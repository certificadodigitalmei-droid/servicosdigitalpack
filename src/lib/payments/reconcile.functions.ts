import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SIGILOPAY_DEFAULT_BASE = "https://app.sigilopay.com.br/api/v1";
const PAID_STATUSES = ["paid", "ok", "completed", "confirmed", "approved", "success"];

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
    console.error("[reconcile] sigilopay fetch error", err);
    return null;
  }
}

export const reconcilePendingOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: pending, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, external_transaction_id")
      .eq("status", "awaiting_payment")
      .gte("created_at", since);

    if (error) throw error;
    if (!pending || pending.length === 0) return { checked: 0, updated: 0 };

    const { data: gateway } = await supabaseAdmin
      .from("payment_gateways")
      .select("api_key, base_url")
      .eq("is_active", true)
      .maybeSingle();
    if (!gateway) return { checked: pending.length, updated: 0 };

    let updated = 0;
    for (const order of pending) {
      if (!order.external_transaction_id) continue;
      const remote = await fetchSigiloStatus(
        gateway.api_key,
        gateway.base_url || SIGILOPAY_DEFAULT_BASE,
        order.external_transaction_id,
      );
      if (remote && PAID_STATUSES.includes(remote)) {
        await supabaseAdmin
          .from("orders")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
        const { sendPaidEmail } = await import("@/lib/emails/order-emails.server");
        await sendPaidEmail(order.id);
        updated++;
      }
    }

    return { checked: pending.length, updated };
  });

export const markOrderPaidManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: "paid", paid_at: nowIso, updated_at: nowIso })
      .eq("id", data.orderId);
    if (error) throw error;
    return { ok: true, paid_at: nowIso };
  });
