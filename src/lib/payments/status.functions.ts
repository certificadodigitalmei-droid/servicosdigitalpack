import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SIGILOPAY_DEFAULT_BASE = "https://app.sigilopay.com.br/api/v1";

function splitKeys(apiKey: string): { publicKey: string; secretKey: string } {
  const [publicKey = "", secretKey = ""] = (apiKey || "").split("|");
  return { publicKey: publicKey.trim(), secretKey: secretKey.trim() };
}

async function fetchSigiloStatus(apiKey: string, baseUrl: string, txId: string): Promise<string | null> {
  const { publicKey, secretKey } = splitKeys(apiKey);
  if (!publicKey || !secretKey) return null;
  const cleanBase = (baseUrl || SIGILOPAY_DEFAULT_BASE).replace(/\/+$/, "");
  try {
    const res = await fetch(`${cleanBase}/transactions?id=${encodeURIComponent(txId)}`, {
      headers: { "x-public-key": publicKey, "x-secret-key": secretKey },
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const raw =
      json?.transaction?.status ??
      json?.data?.status ??
      json?.status ??
      null;
    return typeof raw === "string" ? raw.toLowerCase() : null;
  } catch (err) {
    console.error("[status] sigilopay fetch error", err);
    return null;
  }
}

export const checkOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, payment_provider, external_transaction_id")
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order) return { status: "not_found" as const, paid: false };
    if (order.status === "paid") return { status: "paid" as const, paid: true };
    if (!order.external_transaction_id) {
      return { status: order.status, paid: false };
    }

    const { data: gateway } = await supabaseAdmin
      .from("payment_gateways")
      .select("api_key, base_url")
      .eq("is_active", true)
      .maybeSingle();

    if (!gateway) return { status: order.status, paid: false };

    const remote = await fetchSigiloStatus(
      gateway.api_key,
      gateway.base_url || SIGILOPAY_DEFAULT_BASE,
      order.external_transaction_id,
    );

    const paidStatuses = ["paid", "ok", "completed", "confirmed", "approved", "success"];
    const isPaid = !!remote && paidStatuses.includes(remote);

    if (isPaid) {
      await supabaseAdmin
        .from("orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      return { status: "paid" as const, paid: true };
    }

    return { status: order.status, paid: false, remote };
  });
