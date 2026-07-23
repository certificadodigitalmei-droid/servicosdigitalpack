import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NEXUSPAY_DEFAULT_BASE = "https://nexuspay.squareweb.app/api";
const PAID_STATUSES = ["paid", "completed", "confirmed", "approved", "success"];

async function fetchNexusStatus(apiKey: string, baseUrl: string, txId: string): Promise<string | null> {
  const cleanBase = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  try {
    const res = await fetch(`${cleanBase}/v1/transaction/${encodeURIComponent(txId)}`, {
      headers: { "X-API-KEY": apiKey },
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const status = json?.data?.status ?? json?.status ?? null;
    return typeof status === "string" ? status.toLowerCase() : null;
  } catch (err) {
    console.error("[reconcile] nexus fetch error", err);
    return null;
  }
}

async function fetchUniaoPayStatus(apiKey: string, baseUrl: string, txId: string): Promise<string | null> {
  const cleanBase = (baseUrl || "https://api.uniaopay.com.br").replace(/\/+$/, "");
  try {
    const res = await fetch(`${cleanBase}/v1/transactions/${encodeURIComponent(txId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const status = json?.data?.status ?? json?.status ?? null;
    return typeof status === "string" ? status.toLowerCase() : null;
  } catch (err) {
    console.error("[reconcile] uniaopay fetch error", err);
    return null;
  }
}

export const reconcilePendingOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Verifica se o usuário é admin
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Busca pedidos pendentes das últimas 48h
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: pending, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, payment_provider, external_transaction_id")
      .eq("status", "awaiting_payment")
      .gte("created_at", since);

    if (error) throw error;
    if (!pending || pending.length === 0) return { checked: 0, updated: 0 };

    // Cache de gateways por provider
    const gatewayCache = new Map<string, { api_key: string; base_url: string }>();
    const getGateway = async (provider: string) => {
      if (gatewayCache.has(provider)) return gatewayCache.get(provider)!;
      const { data } = await supabaseAdmin
        .from("payment_gateways")
        .select("api_key, base_url")
        .eq("provider_type", provider)
        .eq("is_active", true)
        .maybeSingle();
      if (data) gatewayCache.set(provider, data as any);
      return data as { api_key: string; base_url: string } | null;
    };

    let updated = 0;
    for (const order of pending) {
      if (!order.external_transaction_id || !order.payment_provider) continue;
      const gw = await getGateway(order.payment_provider);
      if (!gw) continue;

      let remote: string | null = null;
      if (order.payment_provider === "nexuspay") {
        remote = await fetchNexusStatus(gw.api_key, gw.base_url || NEXUSPAY_DEFAULT_BASE, order.external_transaction_id);
      } else if (order.payment_provider === "uniaopay") {
        remote = await fetchUniaoPayStatus(gw.api_key, gw.base_url, order.external_transaction_id);
      }

      if (remote && PAID_STATUSES.includes(remote)) {
        await supabaseAdmin
          .from("orders")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
        updated++;
      }
    }

    return { checked: pending.length, updated };
  });
