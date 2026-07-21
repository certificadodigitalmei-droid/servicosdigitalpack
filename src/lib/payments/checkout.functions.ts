import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UNIAOPAY_API_BASE = "https://uniao7pay.shop/api/v1/uniaopay";

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
        webhookUrl: z.string().url().max(500),
        userAgent: z.string().max(1000).optional(),
        token: z.string().max(200).optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apiKey = process.env.UNIAOPAY_API_KEY;
    if (!apiKey) {
      throw new Error("UNIAOPAY_API_KEY não está configurada no servidor");
    }

    // Resolve link → company (se houver token)
    let companyId: string | null = null;
    let publicLinkId: string | null = null;
    if (data.token) {
      const { data: link, error: linkErr } = await supabaseAdmin
        .from("company_links")
        .select("id, company_id")
        .eq("public_token", data.token)
        .eq("active", true)
        .or("expires_at.is.null,expires_at.gt.now()")
        .maybeSingle();
      if (linkErr) throw linkErr;
      if (link) {
        publicLinkId = link.id;
        companyId = link.company_id;
      }
    }

    // 1. Cria cliente
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

    // 2. Cria pedido (status pending para satisfazer a política de INSERT pública)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_id: customer.id,
        public_link_id: publicLinkId,
        company_id: companyId,
        reference_cnpj: data.document.replace(/\D/g, "").length === 14 ? data.document.replace(/\D/g, "") : null,
        reference_name: data.name,
        product_name: data.productName,
        amount: data.amount,
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

    // 3. Registra consentimento
    await supabaseAdmin.from("consent_logs").insert({
      order_id: order.id,
      privacy_accepted: true,
      terms_accepted: true,
      service_private_acknowledged: true,
      user_agent: data.userAgent?.slice(0, 500) || null,
    });

    // 4. Chama UniaoPay
    const payload = {
      amount: data.amount,
      description: `${data.productName} - ${data.name}`,
      external_id: order.id,
      webhook_url: data.webhookUrl,
    };

    const attempts: Record<string, string>[] = [
      { "Content-Type": "application/json", "x-api-key": apiKey },
      { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      { "Content-Type": "application/json", "api-key": apiKey },
    ];

    let lastStatus = 0;
    let lastBody = "";
    for (const headers of attempts) {
      const response = await fetch(`${UNIAOPAY_API_BASE}/pix/create`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      lastStatus = response.status;
      lastBody = text;

      if (response.ok) {
        try {
          const pix = JSON.parse(text) as {
            qrcode?: string;
            transaction_id?: string;
            pix_code?: string;
            expiration?: string;
          };

          const pixQr = pix.qrcode || pix.pix_code || "";
          const transactionId = pix.transaction_id || "";
          const expiration = pix.expiration ? new Date(pix.expiration) : null;

          // 5. Atualiza pedido com dados do PIX e status aguardando pagamento
          await supabaseAdmin
            .from("orders")
            .update({
              status: "awaiting_payment",
              payment_provider: "uniaopay",
              external_transaction_id: transactionId,
              pix_code: pix.pix_code || null,
              pix_qr_code: pixQr || null,
              pix_expiration: expiration?.toISOString() || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          return {
            orderId: order.id,
            qrcode: pixQr,
            transaction_id: transactionId,
          };
        } catch {
          throw new Error(`Resposta inválida do UniaoPay: ${text.slice(0, 200)}`);
        }
      }

      if (response.status !== 401 && response.status !== 403) {
        break;
      }
    }

    console.error("[UniaoPay] Falha ao criar cobrança PIX", {
      status: lastStatus,
      body: lastBody,
    });

    let errorMessage = lastBody.slice(0, 500) || "sem resposta";
    try {
      const parsed = JSON.parse(lastBody) as Record<string, unknown>;
      errorMessage =
        (typeof parsed.message === "string" && parsed.message) ||
        (typeof parsed.error === "string" && parsed.error) ||
        JSON.stringify(parsed);
    } catch {
      // mantém o texto bruto
    }

    throw new Error(`UniaoPay ${lastStatus}: ${errorMessage}`);
  });
