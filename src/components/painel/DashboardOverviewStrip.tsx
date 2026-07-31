import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { getDashboardOverview, type DashboardOverview, type ModuleStatus } from '@/lib/dashboard/overview.functions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Database,
  CreditCard,
  Link2,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function StatusDot({ s, label }: { s: ModuleStatus; label: string }) {
  const color = s === 'ok' ? 'bg-emerald-500' : s === 'warn' ? 'bg-amber-500' : 'bg-slate-300';
  const Icon = s === 'ok' ? CheckCircle2 : s === 'warn' ? AlertCircle : XCircle;
  const text = s === 'ok' ? 'text-emerald-700' : s === 'warn' ? 'text-amber-700' : 'text-slate-500';
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      <span className={`h-2 w-2 rounded-full ${color} ${s === 'ok' ? 'animate-pulse' : ''}`} />
      <Icon className={`h-3.5 w-3.5 ${text}`} />
      <span className={text}>{label}</span>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-lg font-bold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '—';
  }
}

function BRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function DashboardOverviewStrip({
  from,
  to,
  periodLabel = 'hoje',
}: {
  from?: Date;
  to?: Date;
  periodLabel?: string;
} = {}) {
  const fetchOverview = useServerFn(getDashboardOverview);
  const fromISO = from ? from.toISOString() : null;
  const toISO = to ? to.toISOString() : null;
  const { data, isLoading } = useQuery<DashboardOverview>({
    queryKey: ['dashboard-overview', fromISO, toISO],
    queryFn: () => fetchOverview({ data: { from: fromISO, to: toISO } }),
    refetchInterval: 15000,
    staleTime: 5000,
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Carregando visão geral sincronizada...
      </div>
    );
  }

  const { status, importacao, envio, links, pagamentos } = data;

  return (
    <div className="space-y-3">
      {/* Barra de status geral */}
      <Card className="border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Activity className="h-4 w-4 text-brand-blue" />
            Status geral · <span className="text-slate-400 font-normal">atualizado {timeAgo(data.updatedAt)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <StatusDot s={status.importacao} label="Importação" />
            <StatusDot s={status.envio} label="Envio" />
            
            <StatusDot s={status.gateway} label="Gateway PIX" />
            <StatusDot s={status.casaDados} label="Casa dos Dados" />
          </div>
        </CardContent>
      </Card>

      {/* Grid de módulos */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* Importação */}
        <ModuleCard
          icon={<Database className="h-4 w-4 text-brand-blue" />}
          title="Importação"
          to="/painel/importacao-automatica"
          badge={`${importacao.automacoesAtivas} automações`}
        >
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Fila pronta" value={importacao.filaPronta} sub="empresas encontradas" />
            <Kpi label={`Puxadas ${periodLabel}`} value={importacao.empresasHoje} sub="empresas" />
            <Kpi label="Última empresa" value={timeAgo(importacao.ultimaEmpresaAt)} />
            <Kpi label="Próxima execução" value={timeAgo(importacao.proximaExecucao)} />
          </div>
        </ModuleCard>


        {/* Links */}
        <ModuleCard
          icon={<Link2 className="h-4 w-4 text-cyan-600" />}
          title="Links"
          to="/painel/links-gerados"
          badge={`${links.total} total`}
        >
          <div className="grid grid-cols-2 gap-3">
            <Kpi label={`Gerados ${periodLabel}`} value={links.hoje} />
            <Kpi label="Acessos página" value={links.viewLink} />
            <Kpi label="Clicou emitir" value={links.clickCert} />
            <Kpi label="Acessos checkout" value={links.viewCheckout} />
            <Kpi label="Clicou gerar guia" value={links.clickGuia} />
            <Kpi label="Copiou PIX" value={links.copyPix} />
          </div>
        </ModuleCard>

        {/* Pagamentos */}
        <ModuleCard
          icon={<CreditCard className="h-4 w-4 text-amber-600" />}
          title="Pagamentos"
          to="/painel/pagamentos"
          badge={pagamentos.gatewayAtivo ?? 'sem gateway'}
        >
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="PIX gerados (total)" value={pagamentos.pixGerados} />
            <Kpi label={`Pagos ${periodLabel}`} value={pagamentos.pagosHoje} sub={BRL(pagamentos.valorHoje)} />
            <Kpi label="Ticket médio" value={BRL(pagamentos.ticketMedio)} />
            <Kpi label="Conversão total" value={`${pagamentos.conversao.toFixed(1)}%`} />
          </div>
          {pagamentos.ultimos.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs">
              {pagamentos.ultimos.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-slate-600">
                  <span className="truncate">{p.nome}</span>
                  <span className="tabular-nums font-semibold text-emerald-700">{BRL(p.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </ModuleCard>

        {/* Conversão global */}
        <ModuleCard
          icon={<TrendingUp className="h-4 w-4 text-rose-600" />}
          title="Funil global"
          to="/painel/links-gerados"
          badge={periodLabel}
        >
          <div className="space-y-2">
            <FunnelRow label="Acessos página" value={links.viewLink} max={Math.max(links.viewLink, 1)} />
            <FunnelRow label="Cliques emitir" value={links.clickCert} max={Math.max(links.viewLink, 1)} />
            <FunnelRow label="Acessos checkout" value={links.viewCheckout} max={Math.max(links.viewLink, 1)} />
            <FunnelRow label="Copiou PIX" value={links.copyPix} max={Math.max(links.viewLink, 1)} />
            <FunnelRow label="Pagos" value={pagamentos.pagosHoje} max={Math.max(links.viewLink, 1)} highlight />
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            Sincronizado ao vivo (Realtime + refresh 15s)
          </div>
        </ModuleCard>
      </div>
    </div>
  );
}

function ModuleCard({
  icon,
  title,
  to,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  to: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {icon}
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
          <Link to={to as any} className="text-[11px] font-medium text-brand-blue hover:underline">
            ver tudo →
          </Link>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FunnelRow({ label, value, max, highlight }: { label: string; value: number; max: number; highlight?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className={`tabular-nums font-semibold ${highlight ? 'text-emerald-700' : 'text-slate-900'}`}>
          {value} <span className="text-slate-400">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${highlight ? 'bg-emerald-500' : 'bg-brand-blue'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
