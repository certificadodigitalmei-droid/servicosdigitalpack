import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type PixResult = {
  pix_code: string;
  qr_code_base64: string;
  transaction_id: string;
  expiration: Date | null;
};

export const createOrderAndPixCharge = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        name: z.string().min(2).max(200),
        document: z.string().min(11).max(20),
        email: z.string().email().max(200),
        phone: z.string().min(8).max(20),
        productName: z.string().min(1).max(200),
        amount: z.number().positive().max(100000),
        userAgent: z.string().max(1000).optional(),
        token: z.string().max(200).optional(),
      })
      .parse(data)
  )

  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Mercado Pago é o único provedor suportado.
    const { data: gateway } = await supabaseAdmin
      .from("payment_gateways")
      .select("*")
      .eq("provider_type", "mercadopago")
      .eq("is_active", true)
      .maybeSingle();

    if (!gateway || !gateway.api_key) {
      throw new Error("Nenhuma conta Mercado Pago ativa. Cadastre em Configurações de Pagamento.");
    }
    const provider = "mercadopago";
    const apiKey = gateway.api_key as string;
    const baseUrl = gateway.base_url || null;


    // Resolve link → company
    let companyId: string | null = null;
    let publicLinkId: string | null = null;
    let amount = data.amount;
    if (data.token) {
      const { data: link, error: linkErr } = await supabaseAdmin
        .from("company_links")
        .select("id, company_id, discount_amount_cents, discount_expires_at")
        .eq("public_token", data.token)
        .eq("active", true)
        .or("expires_at.is.null,expires_at.gt.now()")
        .maybeSingle();
      if (linkErr) throw linkErr;
      if (link) {
        publicLinkId = link.id;
        companyId = link.company_id;
        // Empresa que já pagou não gera nova guia.
        const { data: paidOrder } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("public_link_id", link.id)
          .eq("status", "paid")
          .limit(1)
          .maybeSingle();
        if (paidOrder) {
          throw new Error(
            "Você já realizou o pagamento deste CNPJ. O certificado digital já está ativo e vinculado."
          );
        }
        // Desconto de campanha: o valor é definido no servidor, nunca no cliente.
        const cents = (link as any).discount_amount_cents as number | null;
        const exp = (link as any).discount_expires_at as string | null;
        if (cents && cents > 0 && (!exp || new Date(exp).getTime() > Date.now())) {
          amount = cents / 100;
        }
      }

    }

    // ---- Reaproveita a guia PIX já gerada -------------------------------
    // A mesma empresa não pode gerar várias cobranças: enquanto o PIX anterior
    // estiver válido, devolvemos exatamente o mesmo código. Só geramos outro
    // quando ele expira (data do gateway ou, na falta dela, 3 dias).
    const REUSE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
    const cnpjDigits = data.document.replace(/\D/g, "");

    let reuseQuery = supabaseAdmin
      .from("orders")
      .select("id, pix_code, pix_qr_code, external_transaction_id, payment_provider, pix_expiration, created_at")
      .in("status", ["pending", "awaiting_payment"])
      .not("pix_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    reuseQuery = publicLinkId
      ? reuseQuery.eq("public_link_id", publicLinkId)
      : reuseQuery.eq("reference_cnpj", cnpjDigits);

    const { data: existing } = await reuseQuery.maybeSingle();

    if (existing?.pix_code) {
      const expMs = existing.pix_expiration ? new Date(existing.pix_expiration).getTime() : null;
      const createdMs = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      const stillValid = expMs
        ? expMs > Date.now()
        : Date.now() - createdMs < REUSE_WINDOW_MS;

      if (stillValid) {
        let qr = existing.pix_qr_code || "";
        if (!qr) {
          const QRCode = (await import("qrcode")).default;
          const dataUrl = await QRCode.toDataURL(existing.pix_code, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 320,
          });
          qr = dataUrl.replace(/^data:image\/png;base64,/, "");
        }
        return {
          orderId: existing.id,
          pix_code: existing.pix_code,
          qr_code_base64: qr,
          transaction_id: existing.external_transaction_id || "",
          provider: (existing.payment_provider as string) || provider,
          reused: true,
        };
      }
    }

    // Cria cliente

    const { data: customer, error: custErr } = await supabaseAdmin
      .from("customers")
      .insert({
        name: data.name,
        document: data.document.replace(/\D/g, ""),
        email: data.email,
        phone: data.phone.replace(/\D/g, ""),
      })
      .select("id")
      .single();
    if (custErr) throw custErr;
    if (!customer) throw new Error("Falha ao criar cliente");

    // Cria pedido
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_id: customer.id,
        public_link_id: publicLinkId,
        company_id: companyId,
        reference_cnpj: data.document.replace(/\D/g, "").length === 14 ? data.document.replace(/\D/g, "") : null,
        reference_name: data.name,
        product_name: data.productName,
        amount,
        status: "pending",
        customer_name: data.name,
        customer_document: data.document.replace(/\D/g, ""),
        customer_email: data.email,
        customer_phone: data.phone.replace(/\D/g, ""),
      })
      .select("id")
      .single();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Falha ao criar pedido");

    const consentPromise = supabaseAdmin.from("consent_logs").insert({
      order_id: order.id,
      privacy_accepted: true,
      terms_accepted: true,
      service_private_acknowledged: true,
      user_agent: data.userAgent?.slice(0, 500) || null,
    });

    let pix: PixResult;
    try {
      const { createMercadoPagoPix } = await import("@/lib/payments/mercadopago.server");
      // Em produção usamos o e-mail real do pedido; em teste, os dados de sandbox oficiais.
      pix = await createMercadoPagoPix(apiKey, baseUrl, {
        amount,
        orderId: order.id,
        payerEmail: data.email,
        environment: (gateway.environment as "test" | "production") ?? "test",
      });
    } catch (e: any) {
      console.error("[Payments] Falha ao gerar PIX", { provider, error: e?.message });
      throw e;
    }



    await Promise.all([
      consentPromise,
      supabaseAdmin
        .from("orders")
        .update({
          status: "awaiting_payment",
          payment_provider: provider,
          external_transaction_id: pix.transaction_id || null,
          pix_code: pix.pix_code || null,
          pix_qr_code: pix.qr_code_base64 || null,
          pix_expiration: pix.expiration?.toISOString() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id),
    ]);

    return {
      orderId: order.id,
      pix_code: pix.pix_code,
      qr_code_base64: pix.qr_code_base64,
      transaction_id: pix.transaction_id,
      provider,
      reused: false,
    };
  });
