// SyncPay (Partner API v1) — autenticação Bearer + cobrança Pix (cash-in).
// Docs: https://api.syncpayments.com.br (partner/v1)

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

  const payload = {
    amount: input.amount,
    description: SYNCPAY_DESCRIPTION,
    // O pagador não é solicitado no nosso fluxo; enviamos um pagador genérico.
    client: {
      name: "Pagador",
      cpf: "00000000000",
      email: "pagamentos@servicosdigitalpack.com",
      phone: "11999999999",
    },
    webhook_url: SYNCPAY_WEBHOOK_URL,
    postback_url: SYNCPAY_WEBHOOK_URL,
    external_id: input.identifier,
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
  const pix_code: string =
    data?.pix_code || data?.pix?.code || data?.qr_code || data?.paymentCode || data?.emv || "";
  const transaction_id: string = String(data?.id || data?.identifier || data?.transaction_id || "");
  if (!pix_code) throw new Error(`SyncPay: resposta sem código PIX: ${text.slice(0, 300)}`);

  let qr_code_base64: string = data?.qr_code_base64 || data?.pix?.base64 || "";
  if (qr_code_base64.startsWith("data:image")) {
    qr_code_base64 = qr_code_base64.replace(/^data:image\/[a-z]+;base64,/, "");
  }
  if (!qr_code_base64) {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(pix_code, { errorCorrectionLevel: "M", margin: 1, width: 320 });
    qr_code_base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  }

  return { pix_code, qr_code_base64, transaction_id };
}
