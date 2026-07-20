import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * GemMail Provider Pending Auth
 * Renamed from GemMailProviderPlaceholder per user request.
 * This service validates credentials but performs no real calls until authentication format is confirmed.
 */
class GemMailProviderPendingAuth {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    if (!baseUrl) {
      throw new Error("URL-base da API GemMail não configurada.");
    }
    if (!apiKey) {
      throw new Error("API Key da GemMail não configurada.");
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  // All methods are currently disabled until official authentication format is confirmed
  async testConnection() {
    throw new Error("Autenticação HTTP da API GemMail ainda não confirmada.");
  }

  async syncCampaign() {
    throw new Error("Sincronização desativada: Rotas HTTP reais não confirmadas.");
  }

  async sendCampaign() {
    throw new Error("Envio bloqueado: Domínio e autenticação pendentes.");
  }
}

// Server Functions

export const testGemMailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Check if user is admin
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      throw new Error("Unauthorized: Only admins can perform this action");
    }

    const apiKey = process.env.GEMMAIL_API_KEY;
    const baseUrl = process.env.GEMMAIL_API_BASE_URL;

    if (!baseUrl) {
      return { success: false, message: "GEMMAIL_API_BASE_URL não configurada." };
    }

    if (!apiKey) {
      return { success: false, message: "GEMMAIL_API_KEY não configurada." };
    }

    try {
      const provider = new GemMailProviderPendingAuth(apiKey, baseUrl);
      await provider.testConnection();
      return { success: true, message: "Conexão aprovada" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

export const syncCampaignToGemMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ campaignId: z.string() }).parse(data))
  .handler(async ({ data: { campaignId }, context }) => {
    // Auth & Role check
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Unauthorized");

    const apiKey = process.env.GEMMAIL_API_KEY!;
    const baseUrl = process.env.GEMMAIL_API_BASE_URL;

    if (!baseUrl) throw new Error("GEMMAIL_API_BASE_URL não configurada.");

    const provider = new GemMailProviderPendingAuth(apiKey, baseUrl);

    try {
      await provider.syncCampaign();
    } catch (error: any) {
      await context.supabase
        .from("email_campaigns")
        .update({ provider_status: "failed", provider_error: error.message })
        .eq("id", campaignId);
      throw error;
    }
  });

export const sendGemMailCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ campaignId: z.string() }).parse(data))
  .handler(async ({ data: { campaignId }, context }) => {
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Unauthorized");

    const apiKey = process.env.GEMMAIL_API_KEY!;
    const baseUrl = process.env.GEMMAIL_API_BASE_URL;
    
    if (!baseUrl) throw new Error("GEMMAIL_API_BASE_URL não configurada.");

    const provider = new GemMailProviderPendingAuth(apiKey, baseUrl);

    await provider.sendCampaign();
  });
