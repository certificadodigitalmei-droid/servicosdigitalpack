import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Note: GEMMAIL_API_KEY and GEMMAIL_API_BASE_URL must be set in Supabase Secrets
// They are not available via process.env in the Edge Runtime if not injected.
// Since we are using TanStack server functions which run on Lovable's infrastructure,
// we'll need the user to provide the GEMMAIL_API_KEY via add_secret.

/**
 * GemMail Provider implementation
 * Following the requested interface and GemMail (assumed standard ESP) pattern.
 */
class GemMailProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      throw new Error(errorData.message || `GemMail error: ${response.status}`);
    }

    return response.json();
  }

  async testConnection() {
    // Standard endpoint check
    return this.request("/health");
  }

  async getLists() {
    return this.request("/lists");
  }

  async createList(name: string) {
    return this.request("/lists", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async addSubscribersBulk(listId: string, subscribers: any[]) {
    return this.request(`/lists/${listId}/subscribers/bulk`, {
      method: "POST",
      body: JSON.stringify({ subscribers }),
    });
  }

  async createTemplate(data: { name: string; html: string; text?: string }) {
    return this.request("/templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
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
    return this.request("/campaigns", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async sendCampaign(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/send`, {
      method: "POST",
    });
  }

  async getCampaignStats(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/stats`);
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
    const baseUrl = process.env.GEMMAIL_API_BASE_URL || "https://api.gemmail.com/v1";

    if (!apiKey) {
      return { success: false, message: "GEMMAIL_API_KEY not configured in Secrets" };
    }

    try {
      const provider = new GemMailProvider(apiKey, baseUrl);
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
    const baseUrl = process.env.GEMMAIL_API_BASE_URL || "https://api.gemmail.com/v1";
    const provider = new GemMailProvider(apiKey, baseUrl);

    try {
      // 1. Fetch campaign data
      const { data: campaign, error: ce } = await context.supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", campaignId)
        .single();
      if (ce || !campaign) throw new Error("Campanha não encontrada");

      // Update status to syncing
      await context.supabase
        .from("email_campaigns")
        .update({ provider_status: "syncing" })
        .eq("id", campaignId);

      // 2. Fetch recipients
      const { data: recipients, error: re } = await context.supabase
        .from("email_campaign_recipients")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("status", "ready");
      if (re) throw re;

      // 3. Create List on GemMail
      const list = await provider.createList(`Campaign: ${campaign.name} (${campaignId})`);
      const listId = list.id;

      // 4. Create Template
      const template = await provider.createTemplate({
        name: `Template for ${campaign.name}`,
        html: campaign.html_template || "",
      });
      const templateId = template.id;

      // 5. Bulk Add Subscribers
      const subscribers = recipients.map(r => ({
        email: r.email,
        fields: {
          NOME_EMPRESARIAL: r.company_name,
          RAZAO_SOCIAL: r.razao_social,
          NOME_TITULAR: r.nome_titular,
          CNPJ: r.cnpj,
          DATA_ABERTURA: r.data_abertura,
          SITUACAO: r.situacao,
          LINK_PUBLICO: r.public_link,
          LINK_CHECKOUT: r.checkout_link,
          TOKEN: r.token,
          REFERENCIA: r.reference_code
        }
      }));

      // Chunk if necessary (ESP limits)
      await provider.addSubscribersBulk(listId, subscribers);

      // 6. Create Campaign
      const gemCampaign = await provider.createCampaign({
        name: campaign.name,
        list_id: listId,
        template_id: templateId,
        subject: campaign.subject_template || "",
        from_name: campaign.from_name || "Admin",
        from_email: campaign.from_email || "",
        reply_to: campaign.reply_to || campaign.from_email || ""
      });

      // 7. Update Database
      await context.supabase
        .from("email_campaigns")
        .update({
          gemmail_list_id: listId,
          gemmail_template_id: templateId,
          gemmail_campaign_id: gemCampaign.id,
          provider_status: "synced",
          synced_at: new Date().toISOString()
        })
        .eq("id", campaignId);

      return { success: true };
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
    const baseUrl = process.env.GEMMAIL_API_BASE_URL || "https://api.gemmail.com/v1";
    const provider = new GemMailProvider(apiKey, baseUrl);

    const { data: campaign } = await context.supabase
      .from("email_campaigns")
      .select("gemmail_campaign_id")
      .eq("id", campaignId)
      .single();

    if (!campaign?.gemmail_campaign_id) throw new Error("Campanha não sincronizada");

    await provider.sendCampaign(campaign.gemmail_campaign_id);

    await context.supabase
      .from("email_campaigns")
      .update({ status: "sending", provider_status: "sending", sent_at: new Date().toISOString() })
      .eq("id", campaignId);

    return { success: true };
  });
