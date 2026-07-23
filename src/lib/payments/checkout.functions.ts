import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UNIAOPAY_DEFAULT_BASE = "https://uniao7pay.shop/api/v1/uniaopay";
const NEXUSPAY_DEFAULT_BASE = "https://nexuspay.squareweb.app/api";

type ProviderType = "uniaopay" | "nexuspay";

type PixResult = {
  pix_code: string;
  qr_code_base64: string;
  transaction_id: string;
  expiration: Date | null;
};

async function callUniaoPay(
  apiKey: string,
  baseUrl: string,
  input: { amount: number; productName: string; name: string; orderId: string; webhookUrl: string },
): Promise<PixResult> {
  const payload = {
    amount: input.amount,
    description: `${input.productName} - ${input.name}`,
    external_id: input.orderId,
    webhook_url: input.webhookUrl,
  };
  const attempts: Record<string, string>[] = [
    { "Content-Type": "application/json", "x-api-key": apiKey },
    { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    { "Content-Type": "application/json", "api-key": apiKey },
  ];
  let lastStatus = 0;
  let lastBody = "";
  for (const headers of attempts) {
    const response = await fetch(`${baseUrl}/pix/create`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    lastStatus = response.status;
    lastBody = text;
    if (response.ok) {
      const parsed = JSON.parse(text) as any;
      const tx = parsed.transaction ?? parsed;
      const pix_code = tx.pix_code || "";
      const qr = tx.qr_code_base64 || parsed.qrcode || "";
      const transaction_id = tx.id || parsed.transaction_id || "";
      const expiration = tx.expiration ? new Date(tx.expiration) : null;
      if (!pix_code && !qr) throw new Error(`Resposta sem dados de PIX: ${text.slice(0, 300)}`);
      return { pix_code, qr_code_base64: qr, transaction_id, expiration };
    }
    if (response.status !== 401 && response.status !== 403) break;
  }
  throw new Error(`UniaoPay ${lastStatus}: ${lastBody.slice(0, 500) || "sem resposta"}`);
}

async function callNexusPay(
  apiKey: string,
  baseUrl: string,
  input: { amount: number },
): Promise<PixResult> {
  const cleanBase = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const response = await fetch(`${cleanBase}/v1/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ amount: input.amount }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`NexusPay ${response.status}: ${text.slice(0, 500) || "sem resposta"}`);
  }
  const parsed = JSON.parse(text) as any;
  const pix_code = parsed.pix_code || parsed.pixCode || "";
  const rawQr = parsed.qr_code || parsed.qrcode || parsed.qr_code_base64 || "";
  const qr_code_base64 = rawQr && !rawQr.startsWith("data:") && !rawQr.startsWith("http")
    ? rawQr
    : rawQr;
  const transaction_id = parsed.transaction_id || parsed.id || "";
  if (!pix_code && !qr_code_base64) throw new Error(`Resposta sem dados de PIX: ${text.slice(0, 300)}`);
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

    // Fallback legado: UniãoPay via secret quando nenhum gateway ativo cadastrado
    const provider: ProviderType = (gateway?.provider_type as ProviderType) || "uniaopay";
    let apiKey = gateway?.api_key ?? "";
    if (!gateway || apiKey === "USE_ENV_UNIAOPAY_API_KEY") {
      apiKey = process.env.UNIAOPAY_API_KEY || "";
    }
    if (!apiKey) {
      throw new Error("Nenhum gateway de pagamento ativo/configurado. Cadastre em Configurações de Pagamento.");
    }
    const baseUrl =
      gateway?.base_url ||
      (provider === "nexuspay" ? NEXUSPAY_DEFAULT_BASE : UNIAOPAY_DEFAULT_BASE);

    // Resolve link → company
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

    await supabaseAdmin.from("consent_logs").insert({
      order_id: order.id,
      privacy_accepted: true,
      terms_accepted: true,
      service_private_acknowledged: true,
      user_agent: data.userAgent?.slice(0, 500) || null,
    });

    let pix: PixResult;
    try {
      if (provider === "nexuspay") {
        pix = await callNexusPay(apiKey, baseUrl, { amount: data.amount });
      } else {
        pix = await callUniaoPay(apiKey, baseUrl, {
          amount: data.amount,
          productName: data.productName,
          name: data.name,
          orderId: order.id,
          webhookUrl: data.webhookUrl,
        });
      }
    } catch (e: any) {
      console.error("[Payments] Falha ao gerar PIX", { provider, error: e?.message });
      throw e;
    }

    await supabaseAdmin
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
      .eq("id", order.id);

    return {
      orderId: order.id,
      pix_code: pix.pix_code,
      qr_code_base64: pix.qr_code_base64,
      transaction_id: pix.transaction_id,
      provider,
    };
  });
