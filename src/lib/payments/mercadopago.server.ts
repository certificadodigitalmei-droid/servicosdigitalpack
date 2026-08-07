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
  "https://servicosdigitalpack.lovable.app/api/public/webhook-mercadopago";


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

// Atenção: no Checkout Transparente (Orders API) o Access Token de TESTE também
// começa com "APP_USR-". Por isso NUNCA inferimos o ambiente pelo prefixo do token —
// o ambiente vem exclusivamente da configuração do gateway ("test" | "production").
export type MercadoPagoEnvironment = "test" | "production";

// Pagador de sandbox exigido pela documentação oficial da Orders API para Pix.
const SANDBOX_PAYER = {
  email: "test_user_br@testuser.com",
};

// O e-mail do cliente NUNCA é enviado ao Mercado Pago: o MP dispara comprovantes
// automáticos para o e-mail do pagador, o que expõe a operação ao cliente final.
// Usamos sempre uma caixa interna neutra; a comunicação é feita apenas pelo site.
const INTERNAL_PAYER_EMAIL = "pagamentos@seu-certificado-mei-digital.online";


/** Valida o par de credenciais chamando um endpoint autenticado leve. */
export async function testMercadoPagoCredentials(
  apiKey: string,
  baseUrl?: string | null,
): Promise<{ ok: boolean; message: string }> {
  const { accessToken } = splitMercadoPagoKeys(apiKey);
  if (!accessToken) return { ok: false, message: "Access Token não configurado." };
  const res = await fetch(`${cleanBase(baseUrl)}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    return {
      ok: false,
      message:
        `Mercado Pago respondeu ${res.status} ao validar o Access Token. ` +
        "Confira se copiou o token correto do ambiente selecionado " +
        "(Minha aplicação > Testes > Credenciais de teste, ou Produção).",
    };
  }
  const json = (await res.json().catch(() => ({}))) as any;
  const live = json?.site_id ? `conta ${json.site_id}` : "conta validada";
  return { ok: true, message: `Conexão bem-sucedida (${live}).` };
}


/**
 * Fallback: API clássica de pagamentos (/v1/payments) com payment_method_id "pix".
 * Retorna null quando também falhar, para que o erro original seja exibido.
 */
async function createPixViaPaymentsApi(
  accessToken: string,
  baseUrl: string | null | undefined,
  input: { amount: number; orderId: string; payerEmail: string },
): Promise<MercadoPagoPix | null> {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const res = await fetch(`${cleanBase(baseUrl)}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Idempotency-Key": `${input.orderId}-pay`,
    },
    body: JSON.stringify({
      transaction_amount: Number(money(input.amount)),
      payment_method_id: "pix",
      description: "Pack de Fotos",
      external_reference: input.orderId,
      date_of_expiration: expires.toISOString().replace("Z", "-00:00"),
      payer: { email: input.payerEmail || "pagador@exemplo.com" },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as any;
  const data = json?.point_of_interaction?.transaction_data ?? {};
  const pix_code: string = data?.qr_code || "";
  if (!pix_code) return null;
  let qr_code_base64: string = data?.qr_code_base64 || "";
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
  const expRaw = json?.date_of_expiration || null;
  const parsed = expRaw ? new Date(expRaw) : null;
  return {
    pix_code,
    qr_code_base64,
    transaction_id: String(json?.id || ""),
    expiration: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
  };
}

export async function createMercadoPagoPix(

  apiKey: string,
  baseUrl: string | null | undefined,
  input: {
    amount: number;
    orderId: string;
    payerEmail: string;
    environment?: MercadoPagoEnvironment;
  },
): Promise<MercadoPagoPix> {
  const { accessToken } = splitMercadoPagoKeys(apiKey);
  if (!accessToken) {
    throw new Error("Configure o Access Token do Mercado Pago em Configurações de Pagamento.");
  }

  // O pagador precisa pertencer ao mesmo ambiente do Access Token. Em teste, a Orders API
  // exige o usuário oficial de sandbox; em produção, usa-se o e-mail real do pedido.
  const realPayer = { email: input.payerEmail || "pagador@exemplo.com" };
  const sandboxPayer = { email: SANDBOX_PAYER.email };
  const payer = input.environment === "production" ? realPayer : sandboxPayer;

  const buildBody = (payer: Record<string, string>) => ({
    type: "online",
    processing_mode: "automatic",
    external_reference: input.orderId,
    total_amount: money(input.amount),
    payer,
    transactions: {
      payments: [
        {
          amount: money(input.amount),
          payment_method: { id: "pix", type: "bank_transfer" },
          expiration_time: "P1D",
        },
      ],
    },
  });

  const post = async (payer: Record<string, string>, idemSuffix: string) =>
    fetch(`${cleanBase(baseUrl)}/v1/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        // Idempotência: reenvios do mesmo pedido não criam cobranças duplicadas.
        "X-Idempotency-Key": `${input.orderId}${idemSuffix}`,
      },
      body: JSON.stringify(buildBody(payer)),
    });

  let res = await post(payer, input.environment === "production" ? "" : "-sbx");
  let text = await res.text();

  if (!res.ok && input.environment === "production" && text.includes("invalid_users_involved")) {
    // Proteção para uma configuração marcada como produção que ainda usa credencial de teste.
    res = await post(sandboxPayer, "-environment-check");
    text = await res.text();
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        "Mercado Pago recusou o Access Token (401). No ambiente de Teste, use o token de " +
          "Minha aplicação > Testes > Credenciais de teste; em Produção, o token de produção.",
      );
    }

    // A Orders API ainda não está liberada em todas as contas. Nesses casos o Mercado Pago
    // devolve "processing_error"/"invalid_users_involved"; caímos então para a API clássica
    // de pagamentos (/v1/payments), que é a rota padrão de Pix do Checkout Transparente.
    const fallback = await createPixViaPaymentsApi(accessToken, baseUrl, {
      amount: input.amount,
      orderId: input.orderId,
      payerEmail: payer.email,
    });
    if (fallback) return fallback;

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
  if (!res.ok) {
    // Cobranças criadas pelo fallback usam o id de /v1/payments.
    const pay = await getMercadoPagoPaymentStatus(apiKey, baseUrl, orderId);
    return pay.status;
  }

  const json = (await res.json().catch(() => null)) as any;
  if (!json) return "";
  const payment = json?.transactions?.payments?.[0] ?? {};
  const paymentStatus = String(payment?.status || "").toLowerCase();
  const paymentDetail = String(payment?.status_detail || "").toLowerCase();
  // Na Orders API o Pix pago aparece como status "processed" com detalhe "accredited".
  if (paymentStatus === "processed" || paymentDetail === "accredited") return "approved";
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
