import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Link2, Link as LinkIcon, ShoppingCart, MousePointerClick, FileSignature, Loader2, RefreshCw, Monitor, Smartphone, Tablet, Trash2, Calendar as CalendarIcon, CheckCircle2, Eye, Bell, Info, ArrowRight } from 'lucide-react';
import { CertificatePopup } from '@/components/CertificatePopup';
import { PaymentInfoPopup } from '@/components/checkout/PaymentInfoPopup';
import { Input } from '@/components/ui/input';
import { formatCNPJ } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/_authenticated/painel/')({
  component: DashboardPage,
});

type EventRow = {
  event_type: 'view_link' | 'view_checkout' | 'click_certificado' | 'click_guia';
  browser: string | null;
  os: string | null;
  device: string | null;
  visitor_id: string;
  token: string;
  created_at: string;
};

type Stats = {
  linksTotal: number;
  viewLink: number;
  viewCheckout: number;
  clickCert: number;
  clickGuia: number;
  viewLinkTotal: number;
  viewCheckoutTotal: number;
  clickCertTotal: number;
  clickGuiaTotal: number;
  paid: number;
  paidAmount: number;
  byBrowser: Record<string, number>;
  byDevice: Record<string, number>;
  byOS: Record<string, number>;
  conversion: number;
};

const EMPTY: Stats = {
  linksTotal: 0,
  viewLink: 0,
  viewCheckout: 0,
  clickCert: 0,
  clickGuia: 0,
  viewLinkTotal: 0,
  viewCheckoutTotal: 0,
  clickCertTotal: 0,
  clickGuiaTotal: 0,
  paid: 0,
  paidAmount: 0,
  byBrowser: {},
  byDevice: {},
  byOS: {},
  conversion: 0,
};



type Preset = 'hoje' | 'ontem' | '7d' | '15d' | '30d' | 'tudo' | 'custom';

function computeRange(preset: Preset, customFrom?: string, customTo?: string): { from?: Date; to?: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  if (preset === 'tudo') return {};
  if (preset === 'hoje') return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === 'ontem') {
    const y = new Date(now); y.setDate(now.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (preset === '7d' || preset === '15d' || preset === '30d') {
    const days = preset === '7d' ? 7 : preset === '15d' ? 15 : 30;
    const from = new Date(now); from.setDate(now.getDate() - (days - 1));
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  // custom
  const f = customFrom ? startOfDay(new Date(customFrom + 'T00:00:00')) : undefined;
  const t = customTo ? endOfDay(new Date(customTo + 'T00:00:00')) : undefined;
  return { from: f, to: t };
}

function DashboardPage() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [recent, setRecent] = useState<(EventRow & { cnpj?: string })[]>([]);
  const [journey, setJourney] = useState<{ step: number; label: string; color: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>('tudo');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [previewPopup, setPreviewPopup] = useState<null | 'cert' | 'payment'>(null);

  const range = useMemo(() => computeRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  async function load() {
    setLoading(true);
    try {
      let linksCountQ = supabase.from('company_links').select('id', { count: 'exact', head: true });
      let evQ = supabase.from('link_events').select('event_type,browser,os,device,visitor_id,token,created_at').limit(50000);
      if (range.from) {
        const iso = range.from.toISOString();
        linksCountQ = linksCountQ.gte('created_at', iso);
        evQ = evQ.gte('created_at', iso);
      }
      if (range.to) {
        const iso = range.to.toISOString();
        linksCountQ = linksCountQ.lte('created_at', iso);
        evQ = evQ.lte('created_at', iso);
      }
      let ordersQ = supabase
        .from('orders')
        .select('amount, paid_at')
        .not('paid_at', 'is', null);
      if (range.from) ordersQ = ordersQ.gte('paid_at', range.from.toISOString());
      if (range.to) ordersQ = ordersQ.lte('paid_at', range.to.toISOString());

      const [{ count: linksTotal }, evRes, linksRes, ordersRes] = await Promise.all([
        linksCountQ,
        evQ,
        supabase.from('company_links').select('token, cnpj'),
        ordersQ,
      ]);
      const events = (evRes.data ?? []) as EventRow[];
      const linkMap = new Map((linksRes.data ?? []).map((l: any) => [l.token, l.cnpj]));
      const paidOrders = (ordersRes.data ?? []) as { amount: number | null }[];


      const ALL_BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Opera', 'Samsung Internet', 'Outro'];
      const ALL_OS = ['Windows', 'Android', 'iOS', 'macOS', 'Linux', 'Outro'];
      const ALL_DEVICES = ['Desktop', 'Mobile', 'iOS', 'iPad', 'Android', 'Android Tablet'];
      const seed = (keys: string[]) => Object.fromEntries(keys.map(k => [k, 0]));
      const s: Stats = { ...EMPTY, linksTotal: linksTotal ?? 0, byBrowser: seed(ALL_BROWSERS), byDevice: seed(ALL_DEVICES), byOS: seed(ALL_OS) };
      const uniq: Record<string, Set<string>> = {
        view_link: new Set(),
        view_checkout: new Set(),
        click_certificado: new Set(),
        click_guia: new Set(),
      };
      for (const e of events) {
        if (e.event_type === 'view_link') s.viewLinkTotal++;
        else if (e.event_type === 'view_checkout') s.viewCheckoutTotal++;
        else if (e.event_type === 'click_certificado') s.clickCertTotal++;
        else if (e.event_type === 'click_guia') s.clickGuiaTotal++;

        const key = `${e.token}:${e.visitor_id}`;
        const isUnique = !uniq[e.event_type]?.has(key);
        if (isUnique) uniq[e.event_type]?.add(key);
        if (isUnique) {
          if (e.event_type === 'view_link') s.viewLink++;
          else if (e.event_type === 'view_checkout') s.viewCheckout++;
          else if (e.event_type === 'click_certificado') s.clickCert++;
          else if (e.event_type === 'click_guia') s.clickGuia++;
          if (e.event_type === 'view_link' || e.event_type === 'view_checkout') {
            const b = e.browser || 'Desconhecido';
            const d = e.device || 'Desconhecido';
            const o = e.os || 'Desconhecido';
            s.byBrowser[b] = (s.byBrowser[b] || 0) + 1;
            s.byDevice[d] = (s.byDevice[d] || 0) + 1;
            s.byOS[o] = (s.byOS[o] || 0) + 1;
          }
        }
      }

      s.conversion = s.viewLink > 0 ? Math.round((s.viewCheckout / s.viewLink) * 100) : 0;
      s.paid = paidOrders.length;
      s.paidAmount = paidOrders.reduce((sum, o) => sum + Number(o.amount ?? 0), 0);
      setStats(s);

      setStats(s);

      // Jornada por visitante: qual foi a etapa mais avançada que cada visitante alcançou.
      const STEP_ORDER: Record<string, number> = {
        view_link: 1,
        click_certificado: 2,
        view_checkout: 3,
        click_guia: 4,
      };
      const maxStepByVisitor = new Map<string, number>();
      for (const e of events) {
        const step = STEP_ORDER[e.event_type];
        if (!step) continue;
        const key = `${e.token}:${e.visitor_id}`;
        const prev = maxStepByVisitor.get(key) ?? 0;
        if (step > prev) maxStepByVisitor.set(key, step);
      }
      // Funil cumulativo: quantos visitantes atingiram pelo menos cada etapa
      const cum = [0, 0, 0, 0];
      for (const step of maxStepByVisitor.values()) {
        for (let i = 0; i < step; i++) cum[i]++;
      }
      const paidStep = paidOrders.length;
      const journeyRows = [
        { step: 1, label: '1. Abriu a página do link', color: 'bg-blue-500', count: cum[0] },
        { step: 2, label: '2. Clicou em "Emitir Certificado"', color: 'bg-amber-500', count: cum[1] },
        { step: 3, label: '3. Entrou no checkout', color: 'bg-purple-500', count: cum[2] },
        { step: 4, label: '4. Clicou em "Gerar Guia" (PIX)', color: 'bg-rose-500', count: cum[3] },
        { step: 5, label: '5. Pagou o PIX ✅', color: 'bg-emerald-500', count: paidStep },
      ];
      setJourney(journeyRows);

      setRecent(events.slice(-10).reverse().map(e => ({ ...e, cnpj: linkMap.get(e.token) })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo]);

  const [clearing, setClearing] = useState(false);
  const periodLabel = useMemo(() => {
    const map: Record<Preset, string> = {
      hoje: 'de hoje',
      ontem: 'de ontem',
      '7d': 'dos últimos 7 dias',
      '15d': 'dos últimos 15 dias',
      '30d': 'dos últimos 30 dias',
      tudo: 'de todo o período',
      custom:
        customFrom || customTo
          ? `do período ${customFrom || '...'} até ${customTo || '...'}`
          : 'do período personalizado',
    };
    return map[preset];
  }, [preset, customFrom, customTo]);

  async function clearAll() {
    setClearing(true);
    try {
      let q = supabase.from('link_events').delete().not('id', 'is', null);
      if (range.from) q = q.gte('created_at', range.from.toISOString());
      if (range.to) q = q.lte('created_at', range.to.toISOString());
      const { error } = await q;
      if (error) throw error;
      toast.success(`Dados ${periodLabel} apagados`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao limpar dados');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Acompanhe o desempenho dos links gerados.</p>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-red-600 hover:text-red-700" disabled={clearing || loading}>
                {clearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Limpar dados {preset !== 'tudo' && <span className="ml-1 text-xs opacity-75">({periodLabel})</span>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar dados {periodLabel}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso apaga os eventos de visitas e cliques registrados {periodLabel}. Os links e empresas não serão afetados. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={clearAll} className="bg-red-600 hover:bg-red-700">Apagar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600 mr-2">
              <CalendarIcon className="h-4 w-4" /> Período:
            </div>
            {([
              ['hoje', 'Hoje'],
              ['ontem', 'Ontem'],
              ['7d', '7 dias'],
              ['15d', '15 dias'],
              ['30d', '30 dias'],
              ['tudo', 'Tudo'],
              ['custom', 'Personalizado'],
            ] as [Preset, string][]).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={preset === key ? 'default' : 'outline'}
                onClick={() => setPreset(key)}
              >
                {label}
              </Button>
            ))}
            {preset === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 ml-2">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-auto" />
                <span className="text-slate-400 text-sm">até</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-auto" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>




      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard icon={<LinkIcon className="h-5 w-5" />} label="Links gerados" value={stats.linksTotal} color="bg-slate-100 text-slate-700" hint="Total de links criados" />
        <MetricCard icon={<Link2 className="h-5 w-5" />} label="Acessos na primeira página" value={stats.viewLink} total={stats.viewLinkTotal} color="bg-blue-50 text-brand-blue" hint="Únicos por navegador/dispositivo" />
        <MetricCard icon={<MousePointerClick className="h-5 w-5" />} label='Cliques "Emitir Certificado"' value={stats.clickCert} total={stats.clickCertTotal} color="bg-amber-50 text-amber-600" hint="Únicos por navegador/dispositivo" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard icon={<ShoppingCart className="h-5 w-5" />} label="Acessos no checkout" value={stats.viewCheckout} total={stats.viewCheckoutTotal} color="bg-purple-50 text-purple-600" hint="Únicos por navegador/dispositivo" />
        <MetricCard icon={<FileSignature className="h-5 w-5" />} label='Cliques "Gerar Guia"' value={stats.clickGuia} total={stats.clickGuiaTotal} color="bg-rose-50 text-rose-600" hint="Únicos por navegador/dispositivo" />
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Pagamentos confirmados"
          value={stats.paid}
          color="bg-emerald-50 text-emerald-600"
          hint={stats.paidAmount > 0 ? `Total: R$ ${stats.paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Pedidos com PIX pago'}
        />
      </div>



      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">Conversão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FunnelRow label="Visitas na página do link" value={stats.viewLink} total={Math.max(stats.viewLink, 1)} color="bg-emerald-500" />
            <FunnelRow label="Clicou em Emitir Certificado" value={stats.clickCert} total={Math.max(stats.viewLink, 1)} color="bg-amber-500" />
            <FunnelRow label="Chegou ao checkout" value={stats.viewCheckout} total={Math.max(stats.viewLink, 1)} color="bg-purple-500" />
            <FunnelRow label="Clicou em Gerar Guia" value={stats.clickGuia} total={Math.max(stats.viewLink, 1)} color="bg-rose-500" />
            <div className="pt-2 text-sm text-slate-500">
              Taxa página → checkout: <span className="font-bold text-slate-900">{stats.conversion}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">Dispositivos</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown data={stats.byDevice} iconFor={deviceIcon} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">Navegadores</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown data={stats.byBrowser} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">Sistemas operacionais</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown data={stats.byOS} />
          </CardContent>
        </Card>
      </div>

      {/* Jornada dos clientes — até onde clicou/foi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">
            Jornada dos clientes — até onde clicou e foi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {journey.map((row) => {
            const base = journey[0]?.count ?? 0;
            const pct = base > 0 ? Math.round((row.count / base) * 100) : 0;
            return (
              <div key={row.step}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 font-medium">{row.label}</span>
                  <span className="font-semibold text-slate-900">
                    {row.count.toLocaleString('pt-BR')}
                    {row.step > 1 && (
                      <span className="text-slate-400 font-normal ml-1">({pct}%)</span>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${row.color} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
            Contagem de visitantes únicos (token + dispositivo) que atingiram cada etapa. Pagamento contabiliza pedidos com PIX confirmado no período.
          </p>
        </CardContent>
      </Card>

      {/* Preview dos Pop-ups do site */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">
            Pop-ups do site — cliques
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <PopupClicksCard
              icon={<Bell className="h-5 w-5" />}
              title="Pop-up 1 — Aviso do Certificado"
              description='Abre quando o cliente clica em "Emitir Certificado" na primeira página.'
              badge="1º passo"
              badgeColor="bg-amber-100 text-amber-700"
              uniqueClicks={stats.clickCert}
              totalClicks={stats.clickCertTotal}
            />
            <PopupClicksCard
              icon={<Info className="h-5 w-5" />}
              title="Pop-up 2 — Informações do Pagamento"
              description='Abre quando o cliente clica em "Gerar Guia" no checkout.'
              badge="2º passo"
              badgeColor="bg-purple-100 text-purple-700"
              uniqueClicks={stats.clickGuia}
              totalClicks={stats.clickGuiaTotal}
            />
          </div>
        </CardContent>
      </Card>



      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">Últimos Acessos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-2 text-left">Data/Hora</th>
                  <th className="p-2 text-left">CNPJ</th>
                  <th className="p-2 text-left">Evento</th>
                  <th className="p-2 text-left">Dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-2 text-slate-500">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                    <td className="p-2 font-mono font-semibold">{r.cnpj ? formatCNPJ(r.cnpj) : '—'}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        r.event_type.includes('click') ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {r.event_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-2 text-slate-500 flex items-center gap-1">
                      {deviceIcon(r.device || '')}
                      {r.os} ({r.browser})
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400">Nenhum acesso registrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value, total, color, hint }: { icon: React.ReactNode; label: string; value: number; total?: number; color: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>{icon}</div>
        <div className="mt-3 text-3xl font-bold text-slate-900">{value.toLocaleString('pt-BR')}</div>
        <div className="text-sm font-medium text-slate-600">{label}</div>
        {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
        {typeof total === 'number' && (
          <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
            Total: <span className="font-semibold text-slate-900">{total.toLocaleString('pt-BR')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function FunnelRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">{value.toLocaleString('pt-BR')} <span className="text-slate-400 font-normal">({pct}%)</span></span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Breakdown({ data, iconFor }: { data: Record<string, number>; iconFor?: (k: string) => React.ReactNode }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (entries.length === 0) {
    return <div className="text-sm text-slate-400">Sem dados ainda.</div>;
  }
  return (
    <div className="space-y-3">
      {entries.map(([k, v]) => {
        const pct = total > 0 ? Math.round((v / total) * 100) : 0;
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-700">
                {iconFor?.(k)}
                {k}
              </span>
              <span className="font-semibold text-slate-900">{v.toLocaleString('pt-BR')} <span className="text-slate-400 font-normal">({pct}%)</span></span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-brand-blue" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}


function PopupClicksCard({ icon, title, description, badge, badgeColor, uniqueClicks, totalClicks }: { icon: React.ReactNode; title: string; description: string; badge: string; badgeColor: string; uniqueClicks: number; totalClicks: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-linear-to-br from-slate-50 to-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#0b1e3f]/5 text-[#0b1e3f]">
          {icon}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${badgeColor}`}>{badge}</span>
      </div>
      <div className="mt-4">
        <div className="text-[15px] font-bold text-slate-900">{title}</div>
        <p className="mt-1 text-[13px] text-slate-500 leading-relaxed">{description}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white border border-slate-200 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Pessoas</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{uniqueClicks.toLocaleString('pt-BR')}</div>
          <div className="text-[10px] text-slate-400">Únicos por dispositivo</div>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Cliques totais</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{totalClicks.toLocaleString('pt-BR')}</div>
          <div className="text-[10px] text-slate-400">Incluindo repetidos</div>
        </div>
      </div>
    </div>
  );
}

function deviceIcon(k: string) {
  const s = k.toLowerCase();
  if (s.includes('ipad') || s.includes('tablet')) return <Tablet className="h-4 w-4 text-slate-400" />;
  if (s.includes('ios') || s.includes('android') || s.includes('mobile')) return <Smartphone className="h-4 w-4 text-slate-400" />;
  return <Monitor className="h-4 w-4 text-slate-400" />;
}
