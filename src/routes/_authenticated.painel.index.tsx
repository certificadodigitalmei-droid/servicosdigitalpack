import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Link2, Link as LinkIcon, ShoppingCart, MousePointerClick, FileSignature, Loader2, RefreshCw, Monitor, Smartphone, Tablet, Trash2 } from 'lucide-react';
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
  byBrowser: {},
  byDevice: {},
  byOS: {},
  conversion: 0,
};


function DashboardPage() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [recent, setRecent] = useState<(EventRow & { cnpj?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [{ count: linksTotal }, evRes, linksRes] = await Promise.all([
        supabase.from('company_links').select('id', { count: 'exact', head: true }),
        supabase.from('link_events').select('event_type,browser,os,device,visitor_id,token,created_at').limit(50000),
        supabase.from('company_links').select('token, cnpj'),
      ]);
      const events = (evRes.data ?? []) as EventRow[];
      const linkMap = new Map((linksRes.data ?? []).map((l: any) => [l.token, l.cnpj]));

      const s: Stats = { ...EMPTY, linksTotal: linksTotal ?? 0, byBrowser: {}, byDevice: {}, byOS: {} };
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
      setStats(s);
      setRecent(events.slice(-10).reverse().map(e => ({ ...e, cnpj: linkMap.get(e.token) })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const [clearing, setClearing] = useState(false);
  async function clearAll() {
    setClearing(true);
    try {
      const { error } = await supabase.from('link_events').delete().not('id', 'is', null);
      if (error) throw error;
      toast.success('Dados do Dashboard apagados');
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
                Limpar dados
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar dados do Dashboard?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso apaga todos os eventos de visitas e cliques registrados. Os links e empresas não serão afetados. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={clearAll} className="bg-red-600 hover:bg-red-700">Apagar tudo</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>


      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard icon={<LinkIcon className="h-5 w-5" />} label="Links gerados" value={stats.linksTotal} color="bg-slate-100 text-slate-700" hint="Total de links criados" />
        <MetricCard icon={<Link2 className="h-5 w-5" />} label="Acessos na primeira página" value={stats.viewLink} total={stats.viewLinkTotal} color="bg-blue-50 text-brand-blue" hint="Únicos por navegador/dispositivo" />
        <MetricCard icon={<ShoppingCart className="h-5 w-5" />} label="Acessos no checkout" value={stats.viewCheckout} total={stats.viewCheckoutTotal} color="bg-purple-50 text-purple-600" hint="Únicos por navegador/dispositivo" />
        <MetricCard icon={<MousePointerClick className="h-5 w-5" />} label='Cliques "Emitir Certificado"' value={stats.clickCert} total={stats.clickCertTotal} color="bg-amber-50 text-amber-600" hint="Únicos por navegador/dispositivo" />
        <MetricCard icon={<FileSignature className="h-5 w-5" />} label='Cliques "Gerar Guia"' value={stats.clickGuia} total={stats.clickGuiaTotal} color="bg-rose-50 text-rose-600" hint="Únicos por navegador/dispositivo" />
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

function deviceIcon(k: string) {
  const s = k.toLowerCase();
  if (s.includes('ipad') || s.includes('tablet')) return <Tablet className="h-4 w-4 text-slate-400" />;
  if (s.includes('ios') || s.includes('android') || s.includes('mobile')) return <Smartphone className="h-4 w-4 text-slate-400" />;
  return <Monitor className="h-4 w-4 text-slate-400" />;
}
