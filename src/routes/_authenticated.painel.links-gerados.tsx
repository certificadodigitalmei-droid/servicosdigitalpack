import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Search, Copy, ExternalLink, Loader2, RefreshCw, Building2,
  Eye, ShoppingCart, FileCheck2, Receipt, Smartphone, Monitor, Tablet, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { WipeAllButton, EMPTY_UUID } from '@/components/painel/WipeAllButton';
import { formatCNPJ } from '@/lib/format';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/painel/links-gerados')({
  head: () => ({ meta: [{ title: 'Links Gerados | Painel' }] }),
  component: LinksGeradosPage,
});

const PAGE_SIZE = 25;

type DatePreset = 'all' | 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'custom';

type EventType = 'view_link' | 'view_checkout' | 'click_certificado' | 'click_guia';

type Stats = {
  total: number;
  view_link: number;
  view_checkout: number;
  click_certificado: number;
  click_guia: number;
  devices: Record<string, number>;
  unique_visitors: number;
};

const emptyStats = (): Stats => ({
  total: 0, view_link: 0, view_checkout: 0,
  click_certificado: 0, click_guia: 0, devices: {}, unique_visitors: 0,
});

function isoStart(d: Date) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd.toISOString();
}
function isoEnd(d: Date) {
  const nd = new Date(d);
  nd.setHours(23, 59, 59, 999);
  return nd.toISOString();
}

function rangeFromPreset(preset: DatePreset, from: string, to: string): { gte?: string; lte?: string } {
  const now = new Date();
  if (preset === 'today') return { gte: isoStart(now), lte: isoEnd(now) };
  if (preset === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { gte: isoStart(y), lte: isoEnd(y) };
  }
  if (preset === '7d' || preset === '15d' || preset === '30d') {
    const days = preset === '7d' ? 7 : preset === '15d' ? 15 : 30;
    const start = new Date(now); start.setDate(start.getDate() - (days - 1));
    return { gte: isoStart(start), lte: isoEnd(now) };
  }
  if (preset === 'custom') {
    return {
      gte: from ? isoStart(new Date(from + 'T00:00:00')) : undefined,
      lte: to ? isoEnd(new Date(to + 'T00:00:00')) : undefined,
    };
  }
  return {};
}

function deviceIcon(name: string) {
  const s = (name || '').toLowerCase();
  if (/ipad|tablet/.test(s)) return <Tablet className="h-3.5 w-3.5" />;
  if (/android|ios|iphone|mobile/.test(s)) return <Smartphone className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

function LinksGeradosPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [preset, setPreset] = useState<DatePreset>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [autoLinkIds, setAutoLinkIds] = useState<Set<string>>(new Set());
  const [statsByToken, setStatsByToken] = useState<Record<string, Stats>>({});
  const [aggregate, setAggregate] = useState<Stats>(emptyStats());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const range = useMemo(() => rangeFromPreset(preset, from, to), [preset, from, to]);

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('company_links')
        .select(
          'id,company_id,public_token,public_url,checkout_url,active,status,expires_at,access_count,created_at,generation_id,is_test_record,data_quality_status,companies(id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia)',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false });

      if (status === 'active') q = q.eq('active', true);
      if (status === 'inactive') q = q.eq('active', false);
      if (range.gte) q = q.gte('created_at', range.gte);
      if (range.lte) q = q.lte('created_at', range.lte);
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`public_token.ilike.%${s}%`);
      }
      q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      let list = (data ?? []) as any[];

      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const digits = s.replace(/\D/g, '');
        list = list.filter((r) => {
          const c = r.companies;
          if (!c) return true;
          if (digits && c.cnpj?.includes(digits)) return true;
          const name = ((c.nome_titular_exibicao || c.razao_social_original || c.nome_fantasia) ?? '').toLowerCase();
          return name.includes(s) || (r.public_token ?? '').toLowerCase().includes(s);
        });
      }

      if (list.length) {
        const ids = list.map((r) => r.id);
        const { data: queueRows } = await supabase
          .from('automatic_company_queue')
          .select('company_link_id')
          .in('company_link_id', ids);
        const set = new Set<string>((queueRows ?? []).map((q: any) => q.company_link_id).filter(Boolean));
        setAutoLinkIds(set);
        if (origin === 'auto') list = list.filter((r) => set.has(r.id));
        if (origin === 'manual') list = list.filter((r) => !set.has(r.id));
      } else {
        setAutoLinkIds(new Set());
      }

      setRows(list);
      setTotal(count ?? list.length);

      // Load events for the visible tokens
      const tokens = list.map((r) => r.public_token).filter(Boolean);
      if (tokens.length) {
        let eq = supabase.from('link_events').select('token,event_type,device,visitor_id,created_at').in('token', tokens);
        if (range.gte) eq = eq.gte('created_at', range.gte);
        if (range.lte) eq = eq.lte('created_at', range.lte);
        const { data: events } = await eq;
        const per: Record<string, Stats> = {};
        const agg = emptyStats();
        const visitorsGlobal = new Set<string>();
        const visitorsPer: Record<string, Set<string>> = {};
        for (const e of (events ?? []) as any[]) {
          const t = e.token as string;
          if (!per[t]) { per[t] = emptyStats(); visitorsPer[t] = new Set(); }
          const s = per[t];
          const type = e.event_type as EventType;
          s.total += 1; agg.total += 1;
          if (type in s) { (s as any)[type] += 1; (agg as any)[type] += 1; }
          const dev = e.device || 'Desconhecido';
          s.devices[dev] = (s.devices[dev] ?? 0) + 1;
          agg.devices[dev] = (agg.devices[dev] ?? 0) + 1;
          if (e.visitor_id) { visitorsPer[t].add(e.visitor_id); visitorsGlobal.add(e.visitor_id); }
        }
        for (const t of Object.keys(per)) per[t].unique_visitors = visitorsPer[t].size;
        agg.unique_visitors = visitorsGlobal.size;
        setStatsByToken(per);
        setAggregate(agg);
      } else {
        setStatsByToken({});
        setAggregate(emptyStats());
      }
    } catch (e: any) {
      toast.error('Erro ao carregar links: ' + (e?.message ?? 'desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const funnelPct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Links Gerados</h1>
          <p className="text-sm text-slate-600">Todos os links públicos e de checkout já criados, com métricas completas.</p>
        </div>
        <WipeAllButton
          label="Apagar todos os links"
          title="Apagar todos os links gerados?"
          description="Remove permanentemente todos os links públicos e de checkout, seus eventos e o histórico de gerações. Os links deixarão de funcionar. Não pode ser desfeito."
          steps={[
            { label: 'link_events', run: () => supabase.from('link_events').delete().neq('id', EMPTY_UUID) },
            { label: 'company_links', run: () => supabase.from('company_links').delete().neq('id', EMPTY_UUID) },
            { label: 'link_generations', run: () => supabase.from('link_generations').delete().neq('id', EMPTY_UUID) },
          ]}
          onDone={() => { setPage(0); load(); }}
        />
      </div>

      {/* Aggregate KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI icon={<ExternalLink className="h-4 w-4" />} label="Links no filtro" value={total} tone="slate" />
        <KPI icon={<Eye className="h-4 w-4" />} label="Cliques totais" value={aggregate.total} tone="blue" />
        <KPI icon={<Eye className="h-4 w-4" />} label="Abriu página" value={aggregate.view_link} tone="indigo" />
        <KPI icon={<ShoppingCart className="h-4 w-4" />} label="Foi ao checkout" value={aggregate.view_checkout} tone="violet" />
        <KPI icon={<FileCheck2 className="h-4 w-4" />} label="Emitir certificado" value={aggregate.click_certificado} tone="emerald" />
        <KPI icon={<Receipt className="h-4 w-4" />} label="Gerar guia" value={aggregate.click_guia} tone="amber" />
      </div>

      {/* Funnel bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Funil de conversão</CardTitle>
          <CardDescription>Visitantes únicos: <b>{aggregate.unique_visitors}</b></CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <FunnelRow label="Abriu página" value={aggregate.view_link} base={aggregate.view_link} color="bg-indigo-500" />
          <FunnelRow label="Foi ao checkout" value={aggregate.view_checkout} base={aggregate.view_link} color="bg-violet-500" />
          <FunnelRow label="Emitir certificado" value={aggregate.click_certificado} base={aggregate.view_link} color="bg-emerald-500" />
          <FunnelRow label="Gerar guia (PIX)" value={aggregate.click_guia} base={aggregate.view_link} color="bg-amber-500" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Buscar (CNPJ, empresa, token)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPage(0), void load())}
                placeholder="Digite e pressione Enter" />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Origem</Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="auto">Consulta Automática</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Período</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="15d">Últimos 15 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <Label>De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label>Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="flex items-end gap-2 md:col-span-3 lg:col-span-4">
            <Button onClick={() => { setPage(0); void load(); }} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Aplicar
            </Button>
            <Button variant="outline" onClick={() => {
              setSearch(''); setStatus('all'); setOrigin('all'); setPreset('all'); setFrom(''); setTo('');
              setPage(0); setTimeout(load, 0);
            }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultados</CardTitle>
          <CardDescription>{total} link(s) — página {page + 1} de {totalPages}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-center" title="Cliques totais no link"><Eye className="mx-auto h-3.5 w-3.5" /></TableHead>
                  <TableHead className="text-center" title="Abriu página"><Eye className="mx-auto h-3.5 w-3.5 text-indigo-600" /></TableHead>
                  <TableHead className="text-center" title="Foi ao checkout"><ShoppingCart className="mx-auto h-3.5 w-3.5 text-violet-600" /></TableHead>
                  <TableHead className="text-center" title="Clicou em emitir certificado"><FileCheck2 className="mx-auto h-3.5 w-3.5 text-emerald-600" /></TableHead>
                  <TableHead className="text-center" title="Clicou em gerar guia (PIX)"><Receipt className="mx-auto h-3.5 w-3.5 text-amber-600" /></TableHead>
                  <TableHead>Dispositivos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={13} className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                  </TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="py-8 text-center text-sm text-slate-500">
                    Nenhum link encontrado.
                  </TableCell></TableRow>
                ) : rows.map((r) => {
                  const c = r.companies;
                  const nome = c ? ((c.nome_titular_exibicao || c.razao_social_original || c.nome_fantasia || '').replace(/^\d+[.\-/\s]*/, '').trim() || '—') : '—';
                  const pub = r.public_url || (r.public_token ? `/c/${r.public_token}` : null);
                  const chk = r.checkout_url || (r.public_token ? `/checkout/${r.public_token}` : null);
                  const s = statsByToken[r.public_token] ?? emptyStats();
                  const topDevices = Object.entries(s.devices).sort((a, b) => b[1] - a[1]).slice(0, 3);
                  const isOpen = expanded[r.id];
                  return (
                    <>
                      <TableRow key={r.id}>
                        <TableCell>
                          <button className="text-slate-400 hover:text-slate-700" onClick={() => setExpanded((x) => ({ ...x, [r.id]: !x[r.id] }))}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate font-medium">{nome}</TableCell>
                        <TableCell className="font-mono text-xs">{c?.cnpj ? formatCNPJ(c.cnpj) : '—'}</TableCell>
                        <TableCell className="text-center font-semibold">{s.total}</TableCell>
                        <TableCell className="text-center">{s.view_link}</TableCell>
                        <TableCell className="text-center">{s.view_checkout}</TableCell>
                        <TableCell className="text-center">{s.click_certificado}</TableCell>
                        <TableCell className="text-center">{s.click_guia}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {topDevices.length === 0 && <span className="text-xs text-slate-400">—</span>}
                            {topDevices.map(([name, count]) => (
                              <Badge key={name} variant="outline" className="gap-1 text-xs">
                                {deviceIcon(name)} {name} <span className="text-slate-500">×{count}</span>
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {r.active ? <Badge className="bg-green-600">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                        </TableCell>
                        <TableCell>
                          {autoLinkIds.has(r.id)
                            ? <Badge variant="secondary">Automática</Badge>
                            : <Badge variant="outline">Manual</Badge>}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            {pub && (
                              <>
                                <Button size="sm" variant="ghost" title="Abrir link público" onClick={() => window.open(pub, '_blank')}>
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" title="Copiar link público" onClick={() => { navigator.clipboard.writeText(pub); toast.success('Link copiado'); }}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                            {chk && (
                              <Button size="sm" variant="ghost" title="Copiar checkout" onClick={() => { navigator.clipboard.writeText(chk); toast.success('Checkout copiado'); }}>
                                💳
                              </Button>
                            )}
                            {r.company_id && (
                              <Button asChild size="sm" variant="ghost" title="Abrir empresa">
                                <Link to="/painel/empresas-importadas/$companyId" params={{ companyId: r.company_id }}>
                                  <Building2 className="h-3 w-3" />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={r.id + '-details'} className="bg-slate-50/60">
                          <TableCell colSpan={13} className="py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Funil deste link</div>
                                <div className="space-y-1.5">
                                  <FunnelRow label="Abriu página" value={s.view_link} base={s.view_link} color="bg-indigo-500" small />
                                  <FunnelRow label={`Foi ao checkout (${funnelPct(s.view_checkout, s.view_link)}%)`} value={s.view_checkout} base={s.view_link} color="bg-violet-500" small />
                                  <FunnelRow label={`Emitir certificado (${funnelPct(s.click_certificado, s.view_link)}%)`} value={s.click_certificado} base={s.view_link} color="bg-emerald-500" small />
                                  <FunnelRow label={`Gerar guia PIX (${funnelPct(s.click_guia, s.view_link)}%)`} value={s.click_guia} base={s.view_link} color="bg-amber-500" small />
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Dispositivos</div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(s.devices).length === 0 && <span className="text-xs text-slate-400">Sem eventos registrados.</span>}
                                  {Object.entries(s.devices).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                                    <Badge key={name} variant="secondary" className="gap-1">
                                      {deviceIcon(name)} {name} <span className="opacity-70">×{count}</span>
                                    </Badge>
                                  ))}
                                </div>
                                <div className="mt-3 text-xs text-slate-500">
                                  Visitantes únicos: <b>{s.unique_visitors}</b> • Token: <span className="font-mono">{r.public_token}</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-slate-500">Página {page + 1} de {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  const toneClass: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-100 text-blue-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    violet: 'bg-violet-100 text-violet-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className={`rounded-md p-1.5 ${toneClass[tone] ?? toneClass.slate}`}>{icon}</div>
        </div>
        <div className="mt-1 text-2xl font-bold text-slate-900">{value.toLocaleString('pt-BR')}</div>
      </CardContent>
    </Card>
  );
}

function FunnelRow({ label, value, base, color, small }: { label: string; value: number; base: number; color: string; small?: boolean }) {
  const pct = base > 0 ? Math.max(2, Math.round((value / base) * 100)) : 0;
  return (
    <div>
      <div className={`flex justify-between ${small ? 'text-xs' : 'text-sm'} mb-1`}>
        <span className="text-slate-700">{label}</span>
        <span className="font-semibold tabular-nums">{value.toLocaleString('pt-BR')}</span>
      </div>
      <div className={`h-2 w-full rounded-full bg-slate-100 overflow-hidden`}>
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
