// SyncPay — Partner API v1 (somente o necessário para gerar uma cobrança Pix simples).
// Docs: https://syncpay.apidog.io
//  - POST /api/partner/v1/auth-token                  -> { access_token }
//  - POST /api/partner/v1/cash-in                     -> { pix_code, identifier }
//  - GET  /api/partner/v1/transaction/{identifier}    -> { data: { status } }

export const SYNCPAY_DEFAULT_BASE = "https://api.syncpayments.com.br";
export const SYNCPAY_DESCRIPTION = "Pack de Fotos";
export const SYNCPAY_WEBHOOK_URL =
  "https://servicosdigitalpack.lovable.app/api/public/webhook-syncpay";

export type SyncPayPix = {
  pix_code: string;
  qr_code_base64: string;
  transaction_id: string;
};

// api_key guarda "clientId|clientSecret"
export function splitSyncPayKeys(apiKey: string): { clientId: string; clientSecret: string } {
  const [clientId = "", clientSecret = ""] = (apiKey || "").split("|");
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
}

function cleanBase(baseUrl?: string | null): string {
  return (baseUrl || SYNCPAY_DEFAULT_BASE).replace(/\/+$/, "");
}

export async function getSyncPayToken(apiKey: string, baseUrl?: string | null): Promise<string> {
  const { clientId, clientSecret } = splitSyncPayKeys(apiKey);
  if (!clientId || !clientSecret) {
    throw new Error("Configure o Client ID e o Client Secret da SyncPay em Configurações de Pagamento.");
  }
  const res = await fetch(`${cleanBase(baseUrl)}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SyncPay auth ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text) as any;
  const token = json?.access_token || json?.token || json?.data?.access_token;
  if (!token) throw new Error(`SyncPay: resposta de autenticação sem token: ${text.slice(0, 300)}`);
  return token as string;
}

export async function createSyncPayPix(
  apiKey: string,
  baseUrl: string | null | undefined,
  input: { amount: number; identifier: string },
): Promise<SyncPayPix> {
  const token = await getSyncPayToken(apiKey, baseUrl);

  // Cobrança simples: valor, descrição fixa e webhook. Nenhum dado real do
  // cliente é enviado — o gateway exige o objeto `client`, então usamos um
  // pagador genérico.
  const payload = {
    amount: input.amount,
    description: SYNCPAY_DESCRIPTION,
    webhook_url: SYNCPAY_WEBHOOK_URL,
    client: {
      name: "Pagador",
      cpf: "00000000000",
      email: "pagamentos@servicosdigitalpack.com",
      phone: "11999999999",
    },
  };

  const res = await fetch(`${cleanBase(baseUrl)}/api/partner/v1/cash-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SyncPay cash-in ${res.status}: ${text.slice(0, 500)}`);

  const json = JSON.parse(text) as any;
  const data = json?.data ?? json;
  const pix_code: string = data?.pix_code || data?.paymentCode || "";
  const transaction_id: string = String(data?.identifier || data?.id || "");
  if (!pix_code) throw new Error(`SyncPay: resposta sem código PIX: ${text.slice(0, 300)}`);

  const QRCode = (await import("qrcode")).default;
  const dataUrl = await QRCode.toDataURL(pix_code, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
  const qr_code_base64 = dataUrl.replace(/^data:image\/png;base64,/, "");

  return { pix_code, qr_code_base64, transaction_id };
}

/** Consulta o status da transação (usado na conferência manual/automática). */
export async function getSyncPayTransactionStatus(
  apiKey: string,
  baseUrl: string | null | undefined,
  identifier: string,
): Promise<string> {
  const token = await getSyncPayToken(apiKey, baseUrl);
  const res = await fetch(
    `${cleanBase(baseUrl)}/api/partner/v1/transaction/${encodeURIComponent(identifier)}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`SyncPay status ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any;
  return String(json?.data?.status || json?.status || "").toLowerCase();
}
