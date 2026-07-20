import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * GemMail Provider Placeholder
 * Renamed from GemMailProvider until official documentation is provided.
 * All guessed endpoints are disabled to prevent unauthorized/incorrect calls.
 */
class GemMailProviderPlaceholder {
  private publicKey: string;
  private privateKey: string;
  private baseUrl: string;

  constructor(publicKey: string, privateKey: string, baseUrl: string) {
    if (!baseUrl) {
      throw new Error("URL oficial da API GemMail ainda não configurada.");
    }
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(path: string, options: RequestInit = {}) {
    // Implementação HTTP verificada ou Microserviço PHP necessária
    throw new Error("Ação desativada: Formato HTTP oficial do SDK GemMail ainda não confirmado.");
  }

  async testConnection() {
    throw new Error("Ação desativada: Endpoint oficial para teste ou autenticação necessário.");
  }

  async getLists() {
    throw new Error("Ação desativada: Recurso GemMailApi_Endpoint_Lists necessário.");
  }

  async createList(data: any) {
    throw new Error("Ação desativada: Recurso GemMailApi_Endpoint_Lists necessário.");
  }

  async addSubscribers(listUid: string, subscribers: any[]) {
    throw new Error("Ação desativada: Recurso GemMailApi_Endpoint_ListSubscribers necessário.");
  }

  async createTemplate(data: any) {
    throw new Error("Ação desativada: Recurso GemMailApi_Endpoint_Templates necessário.");
  }

  async createCampaign(data: any) {
    throw new Error("Ação desativada: Recurso GemMailApi_Endpoint_Campaigns necessário.");
  }

  async sendTransactionalEmail(data: any) {
    throw new Error("Ação desativada: Recurso GemMailApi_Endpoint_TransactionalEmails necessário.");
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

    const publicKey = process.env.GEMMAIL_PUBLIC_KEY;
    const privateKey = process.env.GEMMAIL_PRIVATE_KEY;
    const baseUrl = process.env.GEMMAIL_API_BASE_URL;

    if (!baseUrl) {
      return { success: false, message: "GEMMAIL_API_BASE_URL não configurada." };
    }

    if (!publicKey || !privateKey) {
      return { success: false, message: "GEMMAIL_PUBLIC_KEY ou GEMMAIL_PRIVATE_KEY não configuradas." };
    }

    try {
      const provider = new GemMailProviderPlaceholder(publicKey, privateKey, baseUrl);
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

    const publicKey = process.env.GEMMAIL_PUBLIC_KEY!;
    const privateKey = process.env.GEMMAIL_PRIVATE_KEY!;
    const baseUrl = process.env.GEMMAIL_API_BASE_URL;

    if (!baseUrl) throw new Error("GEMMAIL_API_BASE_URL não configurada.");

    const provider = new GemMailProviderPlaceholder(publicKey, privateKey, baseUrl);

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

    const publicKey = process.env.GEMMAIL_PUBLIC_KEY!;
    const privateKey = process.env.GEMMAIL_PRIVATE_KEY!;
    const baseUrl = process.env.GEMMAIL_API_BASE_URL;
    
    if (!baseUrl) throw new Error("GEMMAIL_API_BASE_URL não configurada.");

    const provider = new GemMailProviderPlaceholder(publicKey, privateKey, baseUrl);

    // Disabled functionality until documentation is provided
    throw new Error("Envio desativado: Documentação oficial da API GemMail necessária.");
  });
