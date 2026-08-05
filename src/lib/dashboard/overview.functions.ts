import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export type ModuleStatus = 'ok' | 'warn' | 'off';

export type DashboardOverview = {
  updatedAt: string;
  range: { from: string | null; to: string | null };
  status: {
    importacao: ModuleStatus;
    envio: ModuleStatus;
    gateway: ModuleStatus;
    casaDados: ModuleStatus;
  };
  importacao: {
    filaPronta: number;
    ultimaEmpresaAt: string | null;
    empresasHoje: number;
    automacoesAtivas: number;
    proximaExecucao: string | null;
  };
  envio: {
    enviadosHoje: number;
    enviadosPeriodo: number;
    fila: number;
    falhas24h: number;
    workersAtivos: number;
    proximoRetry: string | null;
  };
  links: {
    total: number;
    hoje: number;
    viewLink: number;
    viewCheckout: number;
    clickCert: number;
    clickGuia: number;
    copyPix: number;
  };
  pagamentos: {
    pixGerados: number;
    pagos: number;
    pagosHoje: number;
    valorHoje: number;
    ticketMedio: number;
    conversao: number;
    ultimos: Array<{ id: string; nome: string; valor: number; paid_at: string }>;
    gatewayAtivo: string | null;
  };
};

function startOfDayISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

const inputSchema = z
  .object({
    from: z.string().datetime().nullable().optional(),
    to: z.string().datetime().nullable().optional(),
  })
  .optional();

export const getDashboardOverview = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data) ?? {})
  .handler(async ({ context, data }): Promise<DashboardOverview> => {
    const { supabase } = context;
    const fromISO = data?.from ?? startOfDayISO();
    const toISO = data?.to ?? null;

    // ------ Importação ------
    const empresasHojeQ = supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromISO);
    const empresasHojeFinal = toISO ? empresasHojeQ.lte('created_at', toISO) : empresasHojeQ;

    const [{ count: filaPronta }, { data: ultimaEmpresa }, { count: empresasHoje }, { data: autos }] = await Promise.all([
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('status', 'encontrada'),
      supabase.from('companies').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      empresasHojeFinal,
      supabase.from('automatic_company_queries').select('enabled,next_run_at,status'),
    ]);
    const automacoesAtivas = (autos ?? []).filter((a: any) => a.enabled).length;
    const proximaExecucao = (autos ?? [])
      .map((a: any) => a.next_run_at)
      .filter(Boolean)
      .sort()[0] ?? null;

    // ------ Envio ------
    const enviadosPeriodoQ = supabase
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('created_at', fromISO);
    const enviadosPeriodoFinal = toISO ? enviadosPeriodoQ.lte('created_at', toISO) : enviadosPeriodoQ;

    const falhasPeriodoQ = supabase
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', fromISO);
    const falhasPeriodoFinal = toISO ? falhasPeriodoQ.lte('created_at', toISO) : falhasPeriodoQ;

    const [enviadosRes, { count: filaEnvio }, falhasRes, { data: workers }] = await Promise.all([
      enviadosPeriodoFinal,
      supabase.from('email_campaign_recipients').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      falhasPeriodoFinal,
      supabase.from('email_workers').select('id,is_active,last_success_at').limit(1),
    ]);
    
    const enviadosPeriodo = enviadosRes.count ?? 0;
    
    // Query separada para "Hoje" absoluto caso o período seja customizado
    const enviadosHojeCount = await supabase
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('created_at', startOfDayISO())
      .then(r => r.count ?? 0);

    const falhas24h = falhasRes.count ?? 0;
    const workersAtivos = (workers ?? []).filter((w: any) => w.is_active).length;

    // ------ Links + eventos ------
    const linksHojeQ = supabase
      .from('company_links')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', fromISO);
    const linksHojeFinal = toISO ? linksHojeQ.lte('created_at', toISO) : linksHojeQ;

    const eventosQ = supabase.from('link_events').select('event_type').gte('created_at', fromISO);
    const eventosFinal = toISO ? eventosQ.lte('created_at', toISO) : eventosQ;

    const [{ count: linksTotal }, { count: linksHoje }, { data: eventos }] = await Promise.all([
      supabase.from('company_links').select('id', { count: 'exact', head: true }),
      linksHojeFinal,
      eventosFinal,
    ]);
    const evCount = (ev: string) => (eventos ?? []).filter((e: any) => e.event_type === ev).length;

    // ------ Pagamentos ------
    const ordersPeriodoQ = supabase
      .from('orders')
      .select('amount,paid_at,customer_name,id')
      .eq('status', 'paid')
      .gte('paid_at', fromISO);
    const ordersPeriodoFinal = toISO ? ordersPeriodoQ.lte('paid_at', toISO) : ordersPeriodoQ;

    const [{ count: pixGerados }, { count: pagos }, { data: ordersHoje }, { data: ultimos }, { data: gateway }] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
      ordersPeriodoFinal,
      supabase.from('orders').select('id,amount,paid_at,customer_name,reference_name').eq('status', 'paid').order('paid_at', { ascending: false }).limit(5),
      supabase.from('payment_gateways').select('name,is_active').eq('is_active', true).maybeSingle(),
    ]);
    const pagosHoje = (ordersHoje ?? []).length;
    const valorHoje = (ordersHoje ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const ticketMedio = pagosHoje > 0 ? valorHoje / pagosHoje : 0;
    const conversao = (pixGerados ?? 0) > 0 ? ((pagos ?? 0) / (pixGerados ?? 1)) * 100 : 0;

    // ------ Status semáforos ------
    const status = {
      importacao: (automacoesAtivas > 0 ? 'ok' : 'off') as ModuleStatus,
      envio: (workersAtivos > 0 || (enviadosHojeCount ?? 0) > 0 ? 'ok' : 'off') as ModuleStatus,
      gateway: (gateway ? 'ok' : 'off') as ModuleStatus,
      casaDados: 'ok' as ModuleStatus,
    };

    return {
      updatedAt: new Date().toISOString(),
      range: { from: fromISO, to: toISO },
      status,
      importacao: {
        filaPronta: filaPronta ?? 0,
        ultimaEmpresaAt: (ultimaEmpresa as any)?.created_at ?? null,
        empresasHoje: empresasHoje ?? 0,
        automacoesAtivas,
        proximaExecucao,
      },
      envio: {
        enviadosHoje: enviadosHojeCount,
        enviadosPeriodo: enviadosPeriodo,
        fila: filaEnvio ?? 0,
        falhas24h: falhas24h ?? 0,
        workersAtivos,
        proximoRetry: null,
      },
      links: {
        total: linksTotal ?? 0,
        hoje: linksHoje ?? 0,
        viewLink: evCount('view_link'),
        viewCheckout: evCount('view_checkout'),
        clickCert: evCount('click_certificado'),
        clickGuia: evCount('click_guia'),
        copyPix: evCount('copy_pix'),
      },
      pagamentos: {
        pixGerados: pixGerados ?? 0,
        pagos: pagos ?? 0,
        pagosHoje,
        valorHoje,
        ticketMedio,
        conversao,
        ultimos: (ultimos ?? []).map((o: any) => ({
          id: o.id,
          nome: o.customer_name ?? o.reference_name ?? 'Cliente',
          valor: Number(o.amount ?? 0),
          paid_at: o.paid_at,
        })),
        gatewayAtivo: (gateway as any)?.name ?? null,
      },
    };
  });
