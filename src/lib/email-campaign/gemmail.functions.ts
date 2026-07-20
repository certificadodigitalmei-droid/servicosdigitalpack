import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * GemMail Provider Placeholder
 * Renamed from GemMailProvider until official documentation is provided.
 * All guessed endpoints are disabled to prevent unauthorized/incorrect calls.
 */
class GemMailProviderPlaceholder {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    if (!baseUrl) {
      throw new Error("URL oficial da API GemMail ainda não configurada.");
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(path: string, options: RequestInit = {}) {
    // Disabled until official documentation is confirmed
    throw new Error("Ação desativada: Documentação oficial da API GemMail necessária.");
  }

  async testConnection() {
    // Disabled: /health was a guessed endpoint
    throw new Error("Ação desativada: Documentação oficial da API GemMail necessária.");
  }

  async getLists() {
    // Disabled: /lists was a guessed endpoint
    throw new Error("Ação desativada: Documentação oficial da API GemMail necessária.");
  }

  async createList(name: string) {
    // Disabled: /lists was a guessed endpoint
    throw new Error("Ação desativada: Documentação oficial da API GemMail necessária.");
  }

  async addSubscribersBulk(listId: string, subscribers: any[]) {
    // Disabled: /subscribers/bulk was a guessed endpoint
    throw new Error("Ação desativada: Documentação oficial da API GemMail necessária.");
  }

  async createTemplate(data: { name: string; html: string; text?: string }) {
    // Disabled: /templates was a guessed endpoint
    throw new Error("Ação desativada: Documentação oficial da API GemMail necessária.");
  }

  async createCampaign(data: {
    name: string;
    list_id: string;
    template_id: string;
    subject: string;
    from_name: string;
    from_email: string;
    reply_to: string;
  }) {
    // Disabled: /campaigns was a guessed endpoint
    throw new Error("Ação desativada: Documentação oficial da API GemMail necessária.");
  }

  async sendCampaign(campaignId: string) {
    // Disabled: /send was a guessed endpoint
    throw new Error("Ação desativada: Documentação oficial da API GemMail necessária.");
  }

  async getCampaignStats(campaignId: string) {
    // Disabled: /stats was a guessed endpoint
    throw new Error("Ação desativada: Documentação oficial da API GemMail necessária.");
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
      return { success: false, message: "URL oficial da API GemMail ainda não configurada." };
    }

    if (!apiKey) {
      return { success: false, message: "GEMMAIL_API_KEY não configurada nos Secrets" };
    }

    try {
      const provider = new GemMailProviderPlaceholder(apiKey, baseUrl);
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

    if (!baseUrl) throw new Error("URL oficial da API GemMail ainda não configurada.");

    const provider = new GemMailProviderPlaceholder(apiKey, baseUrl);

    try {
      // Disabled functionality until documentation is provided
      throw new Error("Sincronização desativada: Documentação oficial da API GemMail necessária.");
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
    
    if (!baseUrl) throw new Error("URL oficial da API GemMail ainda não configurada.");

    const provider = new GemMailProviderPlaceholder(apiKey, baseUrl);

    // Disabled functionality until documentation is provided
    throw new Error("Envio desativado: Documentação oficial da API GemMail necessária.");
  });
