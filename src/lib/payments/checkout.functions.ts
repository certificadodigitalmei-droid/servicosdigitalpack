import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SIGILOPAY_DEFAULT_BASE = "https://app.sigilopay.com.br/api/v1";

type PixResult = {
  pix_code: string;
  qr_code_base64: string;
  transaction_id: string;
  expiration: Date | null;
};

// api_key column stores "publicKey|secretKey"
function splitKeys(apiKey: string): { publicKey: string; secretKey: string } {
  const [publicKey = "", secretKey = ""] = (apiKey || "").split("|");
  return { publicKey: publicKey.trim(), secretKey: secretKey.trim() };
}

async function callSigiloPay(
  apiKey: string,
  baseUrl: string,
  input: {
    identifier: string;
    amount: number;
    callbackUrl: string;
    client: { name: string; email: string; phone: string; document: string };
    productName: string;
  },
): Promise<PixResult> {
  const { publicKey, secretKey } = splitKeys(apiKey);
  if (!publicKey || !secretKey) {
    throw new Error("Configure a chave pública e a chave secreta da SigiloPay em Configurações de Pagamento.");
  }
  const cleanBase = (baseUrl || SIGILOPAY_DEFAULT_BASE).replace(/\/+$/, "");

  const payload = {
    identifier: input.identifier,
    amount: input.amount,
    client: input.client,
    products: [
      {
        id: input.identifier,
        name: input.productName,
        quantity: 1,
        price: input.amount,
      },
    ],
    callbackUrl: input.callbackUrl,
  };

  const response = await fetch(`${cleanBase}/gateway/pix/receive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-public-key": publicKey,
      "x-secret-key": secretKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SigiloPay ${response.status}: ${text.slice(0, 500) || "sem resposta"}`);
  }

  const parsed = JSON.parse(text) as any;
  const pix = parsed?.pix ?? {};
  const pix_code = pix.code || pix.emv || pix.pixCode || "";
  const transaction_id = parsed?.transactionId || parsed?.id || "";
  if (!pix_code) throw new Error(`Resposta sem código PIX: ${text.slice(0, 300)}`);

  let qr_code_base64 = pix.base64 || "";
  if (qr_code_base64.startsWith("data:image")) {
    qr_code_base64 = qr_code_base64.replace(/^data:image\/[a-z]+;base64,/, "");
  }
  if (!qr_code_base64) {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(pix_code, { errorCorrectionLevel: "M", margin: 1, width: 320 });
    qr_code_base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  }
  return { pix_code, qr_code_base64, transaction_id, expiration: null };
}

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

    // Resolve gateway ativo
    const { data: gateway } = await supabaseAdmin
      .from("payment_gateways")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (!gateway || !gateway.api_key) {
      throw new Error("Nenhum gateway SigiloPay ativo. Cadastre em Configurações de Pagamento.");
    }
    const provider = "sigilopay";
    const apiKey = gateway.api_key as string;
    const baseUrl = gateway.base_url || SIGILOPAY_DEFAULT_BASE;

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
        // Desconto de campanha: o valor é definido no servidor, nunca no cliente.
        const cents = (link as any).discount_amount_cents as number | null;
        const exp = (link as any).discount_expires_at as string | null;
        if (cents && cents > 0 && (!exp || new Date(exp).getTime() > Date.now())) {
          amount = cents / 100;
        }
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

    const consentPromise = supabaseAdmin.from("consent_logs").insert({
      order_id: order.id,
      privacy_accepted: true,
      terms_accepted: true,
      service_private_acknowledged: true,
      user_agent: data.userAgent?.slice(0, 500) || null,
    });

    let pix: PixResult;
    try {
      pix = await callSigiloPay(apiKey, baseUrl, {
        identifier: order.id,
        amount: data.amount,
        callbackUrl: data.webhookUrl,
        // Dados pessoais do cliente NÃO são enviados ao gateway.
        // Usamos um pagador genérico; os dados reais ficam apenas no nosso banco.
        client: {
          name: "Cliente",
          email: `pedido-${order.id.slice(0, 8)}@certificadodigitalccmei.online`,
          phone: "11999999999",
          document: data.document,
        },

        productName: data.productName,
      });
    } catch (e: any) {
      console.error("[Payments] Falha ao gerar PIX SigiloPay", { error: e?.message });
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

    // E-mail imediato com a guia de pagamento (não bloqueia a resposta em caso de falha).
    try {
      const { sendPixCreatedEmail } = await import('@/lib/emails/order-emails.server');
      await sendPixCreatedEmail(order.id);
    } catch (e) {
      console.error('[Payments] falha ao enviar e-mail de guia gerada', e);
    }

    return {
      orderId: order.id,
      pix_code: pix.pix_code,
      qr_code_base64: pix.qr_code_base64,
      transaction_id: pix.transaction_id,
      provider,
    };
  });
