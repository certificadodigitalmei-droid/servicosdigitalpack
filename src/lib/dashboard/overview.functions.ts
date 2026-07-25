import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type ModuleStatus = 'ok' | 'warn' | 'off';

export type DashboardOverview = {
  updatedAt: string;
  status: {
    importacao: ModuleStatus;
    envio: ModuleStatus;
    antenas: ModuleStatus;
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
  antenas: {
    total: number;
    online: number;
    jobsReservados: number;
    jobsPendentes: number;
    enviosHoje: number;
    porAntena: Array<{ satellite_id: string; sent: number; pending: number; failed: number; lastAt: string | null }>;
  };
};

function startOfDayISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function last24hISO(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export const getDashboardOverview = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardOverview> => {
    const { supabase } = context;
    const todayStart = startOfDayISO();
    const dayAgo = last24hISO();

    // ------ Importação ------
    const [{ count: filaPronta }, { data: ultimaEmpresa }, { count: empresasHoje }, { data: autos }] = await Promise.all([
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('status', 'pending_send'),
      supabase.from('companies').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('companies').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('automatic_company_queries').select('enabled,next_run_at,status'),
    ]);
    const automacoesAtivas = (autos ?? []).filter((a: any) => a.enabled).length;
    const proximaExecucao = (autos ?? [])
      .map((a: any) => a.next_run_at)
      .filter(Boolean)
      .sort()[0] ?? null;

    // ------ Envio ------
    const [{ count: enviadosHoje }, { count: filaEnvio }, { count: falhas24h }, { data: workers }, { data: proxRetry }] = await Promise.all([
      supabase.from('email_send_queue').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('updated_at', todayStart),
      supabase.from('email_send_queue').select('id', { count: 'exact', head: true }).in('status', ['queued', 'sending', 'retrying']),
      supabase.from('email_send_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('updated_at', dayAgo),
      supabase.from('email_workers').select('id,is_active,last_success_at'),
      supabase.from('email_send_queue').select('next_retry_at').not('next_retry_at', 'is', null).order('next_retry_at', { ascending: true }).limit(1).maybeSingle(),
    ]);
    const workersAtivos = (workers ?? []).filter((w: any) => w.is_active).length;

    // ------ Links + eventos ------
    const [{ count: linksTotal }, { count: linksHoje }, { data: eventos }] = await Promise.all([
      supabase.from('company_links').select('id', { count: 'exact', head: true }),
      supabase.from('company_links').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('link_events').select('event_type').gte('created_at', todayStart),
    ]);
    const evCount = (ev: string) => (eventos ?? []).filter((e: any) => e.event_type === ev).length;

    // ------ Pagamentos ------
    const [{ count: pixGerados }, { count: pagos }, { data: ordersHoje }, { data: ultimos }, { data: gateway }] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
      supabase.from('orders').select('amount,paid_at,customer_name,id').eq('status', 'paid').gte('paid_at', todayStart),
      supabase.from('orders').select('id,amount,paid_at,customer_name,reference_name').eq('status', 'paid').order('paid_at', { ascending: false }).limit(5),
      supabase.from('payment_gateways').select('name,is_active').eq('is_active', true).maybeSingle(),
    ]);
    const pagosHoje = (ordersHoje ?? []).length;
    const valorHoje = (ordersHoje ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const ticketMedio = pagosHoje > 0 ? valorHoje / pagosHoje : 0;
    const conversao = (pixGerados ?? 0) > 0 ? ((pagos ?? 0) / (pixGerados ?? 1)) * 100 : 0;

    // ------ Antenas ------
    const { data: jobsRaw } = await supabase
      .from('satellite_jobs')
      .select('satellite_id,status,updated_at,claimed_at')
      .gte('claimed_at', dayAgo);
    const bySat = new Map<string, { sent: number; pending: number; failed: number; lastAt: string | null }>();
    let jobsReservados = 0;
    let jobsPendentes = 0;
    let enviosHojeAnt = 0;
    for (const j of jobsRaw ?? []) {
      const sat = (j as any).satellite_id ?? 'desconhecido';
      const entry = bySat.get(sat) ?? { sent: 0, pending: 0, failed: 0, lastAt: null };
      const st = (j as any).status;
      const t = (j as any).updated_at ?? (j as any).claimed_at ?? null;
      if (st === 'sent' || st === 'confirmed') { entry.sent += 1; enviosHojeAnt += 1; }
      else if (st === 'failed' || st === 'error') entry.failed += 1;
      else { entry.pending += 1; if (st === 'claimed' || st === 'reserved') jobsReservados += 1; }
      if (!entry.lastAt || (t && t > entry.lastAt)) entry.lastAt = t;
      bySat.set(sat, entry);
    }
    const { count: pendentesGlobal } = await supabase.from('satellite_jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'reserved', 'claimed']);
    jobsPendentes = pendentesGlobal ?? 0;
    const online = Array.from(bySat.values()).filter((s) => s.lastAt && Date.parse(s.lastAt) > Date.now() - 10 * 60 * 1000).length;

    // ------ Status semáforos ------
    const status = {
      importacao: (automacoesAtivas > 0 ? 'ok' : 'off') as ModuleStatus,
      envio: (workersAtivos > 0 || (enviadosHoje ?? 0) > 0 ? 'ok' : 'off') as ModuleStatus,
      antenas: (online > 0 ? 'ok' : bySat.size > 0 ? 'warn' : 'off') as ModuleStatus,
      gateway: (gateway ? 'ok' : 'off') as ModuleStatus,
      casaDados: 'ok' as ModuleStatus,
    };

    return {
      updatedAt: new Date().toISOString(),
      status,
      importacao: {
        filaPronta: filaPronta ?? 0,
        ultimaEmpresaAt: (ultimaEmpresa as any)?.created_at ?? null,
        empresasHoje: empresasHoje ?? 0,
        automacoesAtivas,
        proximaExecucao,
      },
      envio: {
        enviadosHoje: enviadosHoje ?? 0,
        fila: filaEnvio ?? 0,
        falhas24h: falhas24h ?? 0,
        workersAtivos,
        proximoRetry: (proxRetry as any)?.next_retry_at ?? null,
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
      antenas: {
        total: bySat.size,
        online,
        jobsReservados,
        jobsPendentes,
        enviosHoje: enviosHojeAnt,
        porAntena: Array.from(bySat.entries()).map(([satellite_id, v]) => ({ satellite_id, ...v })),
      },
    };
  });
