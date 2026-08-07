// Mercado Pago — Checkout Transparente via Orders API (somente Pix).
// Docs oficiais:
//  - https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/overview
//  - https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix
//  - https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
//
// Endpoints usados:
//  POST /v1/orders        -> cria a Order com pagamento Pix (QR Code + copia e cola)
//  GET  /v1/orders/{id}   -> reconsulta a Order para confirmar a aprovação
//
// Credenciais (Access Token e segredo do webhook) são lidas apenas no servidor,
// nunca retornadas ao frontend nem gravadas em log.

export const MERCADOPAGO_DEFAULT_BASE = "https://api.mercadopago.com";
export const MERCADOPAGO_WEBHOOK_URL =
  "https://servicosdigitalpack.lovable.app/api/webhooks/mercadopago";

export type MercadoPagoPix = {
  pix_code: string;
  qr_code_base64: string;
  transaction_id: string;
  expiration: Date | null;
};

// api_key guarda "publicKey|accessToken"
export function splitMercadoPagoKeys(apiKey: string): { publicKey: string; accessToken: string } {
  const [publicKey = "", accessToken = ""] = (apiKey || "").split("|");
  return { publicKey: publicKey.trim(), accessToken: accessToken.trim() };
}

function cleanBase(baseUrl?: string | null): string {
  return (baseUrl || MERCADOPAGO_DEFAULT_BASE).replace(/\/+$/, "");
}

function money(amount: number): string {
  return amount.toFixed(2);
}

const TEST_CREDENTIALS_MESSAGE =
  "O Mercado Pago não aceita credenciais de teste (TEST-...) no Checkout Transparente. " +
  "Use o Access Token de produção (APP_USR-...) da sua aplicação; para simular pagamentos, " +
  "faça o Pix com um usuário de teste.";

function assertProductionToken(accessToken: string) {
  if (accessToken.toUpperCase().startsWith("TEST-")) {
    throw new Error(TEST_CREDENTIALS_MESSAGE);
  }
}

/** Valida o par de credenciais chamando um endpoint autenticado leve. */
export async function testMercadoPagoCredentials(
  apiKey: string,
  baseUrl?: string | null,
): Promise<{ ok: boolean; message: string }> {
  const { accessToken } = splitMercadoPagoKeys(apiKey);
  if (!accessToken) return { ok: false, message: "Access Token não configurado." };
  if (accessToken.toUpperCase().startsWith("TEST-")) {
    return { ok: false, message: TEST_CREDENTIALS_MESSAGE };
  }
  const res = await fetch(`${cleanBase(baseUrl)}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    return { ok: false, message: `Mercado Pago respondeu ${res.status} ao validar o Access Token.` };
  }
  const json = (await res.json().catch(() => ({}))) as any;
  const live = json?.site_id ? `conta ${json.site_id}` : "conta validada";
  return { ok: true, message: `Conexão bem-sucedida (${live}).` };
}

export async function createMercadoPagoPix(
  apiKey: string,
  baseUrl: string | null | undefined,
  input: { amount: number; orderId: string; payerEmail: string },
): Promise<MercadoPagoPix> {
  const { accessToken } = splitMercadoPagoKeys(apiKey);
  if (!accessToken) {
    throw new Error("Configure o Access Token do Mercado Pago em Configurações de Pagamento.");
  }
  assertProductionToken(accessToken);

  const body = {
    type: "online",
    processing_mode: "automatic",
    external_reference: input.orderId,
    total_amount: money(input.amount),
    payer: { email: input.payerEmail },
    transactions: {
      payments: [
        {
          amount: money(input.amount),
          payment_method: { id: "pix", type: "bank_transfer" },
        },
      ],
    },
  };

  const res = await fetch(`${cleanBase(baseUrl)}/v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Idempotência: reenvios do mesmo pedido não criam cobranças duplicadas.
      "X-Idempotency-Key": input.orderId,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Mercado Pago ${res.status}: ${text.slice(0, 500) || "sem resposta"}`);
  }

  const json = JSON.parse(text) as any;
  const payment = json?.transactions?.payments?.[0] ?? {};
  const method = payment?.payment_method ?? {};

  const pix_code: string = method?.qr_code || "";
  if (!pix_code) throw new Error(`Mercado Pago: resposta sem código PIX: ${text.slice(0, 300)}`);

  let qr_code_base64: string = method?.qr_code_base64 || "";
  if (qr_code_base64.startsWith("data:image")) {
    qr_code_base64 = qr_code_base64.replace(/^data:image\/[a-z]+;base64,/, "");
  }
  if (!qr_code_base64) {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(pix_code, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
    qr_code_base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  }

  const expRaw: string | null =
    payment?.expiration_time || method?.expiration_date || json?.expiration_time || null;
  let expiration: Date | null = null;
  if (expRaw) {
    const parsed = new Date(expRaw);
    if (!Number.isNaN(parsed.getTime())) expiration = parsed;
  }

  return {
    pix_code,
    qr_code_base64,
    transaction_id: String(json?.id || payment?.id || ""),
    expiration,
  };
}

/** Reconsulta a Order e devolve um status normalizado em minúsculas. */
export async function getMercadoPagoOrderStatus(
  apiKey: string,
  baseUrl: string | null | undefined,
  orderId: string,
): Promise<string> {
  const { accessToken } = splitMercadoPagoKeys(apiKey);
  if (!accessToken) return "";
  const res = await fetch(`${cleanBase(baseUrl)}/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) return "";
  const json = (await res.json().catch(() => null)) as any;
  if (!json) return "";
  const payment = json?.transactions?.payments?.[0] ?? {};
  const paymentStatus = String(payment?.status || "").toLowerCase();
  if (paymentStatus) return paymentStatus;
  const orderStatus = String(json?.status || "").toLowerCase();
  const detail = String(json?.status_detail || "").toLowerCase();
  if (orderStatus === "processed" && (detail === "accredited" || detail === "")) return "approved";
  return orderStatus;
}

/** Busca a Order pelo id do pagamento avulso (notificações type=payment). */
export async function getMercadoPagoPaymentStatus(
  apiKey: string,
  baseUrl: string | null | undefined,
  paymentId: string,
): Promise<{ status: string; externalReference: string | null }> {
  const { accessToken } = splitMercadoPagoKeys(apiKey);
  if (!accessToken) return { status: "", externalReference: null };
  const res = await fetch(`${cleanBase(baseUrl)}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) return { status: "", externalReference: null };
  const json = (await res.json().catch(() => null)) as any;
  return {
    status: String(json?.status || "").toLowerCase(),
    externalReference: json?.external_reference ? String(json.external_reference) : null,
  };
}

export const MERCADOPAGO_APPROVED_STATUSES = ["approved", "processed", "accredited"];

/**
 * Valida a assinatura `x-signature` enviada pelo Mercado Pago.
 * Manifesto: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 */
export async function verifyMercadoPagoSignature(params: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): Promise<boolean> {
  const { signatureHeader, requestId, dataId, secret } = params;
  if (!signatureHeader || !secret) return false;

  let ts = "";
  let v1 = "";
  for (const part of signatureHeader.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    const key = (rawKey || "").trim();
    const value = (rawValue || "").trim();
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }
  if (!ts || !v1) return false;

  let manifest = "";
  if (dataId) manifest += `id:${dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(manifest));
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
