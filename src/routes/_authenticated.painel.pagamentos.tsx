import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  DollarSign,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  Calendar as CalendarIcon,
  Copy,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatCPFOrCNPJ } from '@/lib/format';
import { WipeAllButton, EMPTY_UUID } from '@/components/painel/WipeAllButton';
import { useServerFn } from '@tanstack/react-start';
import { reconcilePendingOrders, markOrderPaidManually } from '@/lib/payments/reconcile.functions';

export const Route = createFileRoute('/_authenticated/painel/pagamentos')({
  head: () => ({
    meta: [
      { title: 'Pagamentos — Painel' },
      { name: 'description', content: 'Acompanhe todos os pedidos gerados e pagamentos confirmados.' },
    ],
  }),
  component: PagamentosPage,
});

type Order = {
  id: string;
  reference_cnpj: string | null;
  reference_name: string | null;
  product_name: string | null;
  amount: number;
  status: string;
  payment_provider: string | null;
  external_transaction_id: string | null;
  pix_code: string | null;
  paid_at: string | null;
  created_at: string;
  customer_name: string | null;
  customer_document: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

type Preset = 'hoje' | 'ontem' | '7d' | '15d' | '30d' | 'tudo' | 'custom';

function computeRange(preset: Preset, customFrom?: string, customTo?: string) {
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
  const f = customFrom ? startOfDay(new Date(customFrom + 'T00:00:00')) : undefined;
  const t = customTo ? endOfDay(new Date(customTo + 'T00:00:00')) : undefined;
  return { from: f, to: t };
}

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  paid: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  awaiting_payment: { label: 'Aguardando', color: 'bg-amber-100 text-amber-700', icon: Clock },
  expired: { label: 'Expirado', color: 'bg-slate-100 text-slate-600', icon: XCircle },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: XCircle },
  failed: { label: 'Falhou', color: 'bg-red-100 text-red-700', icon: XCircle },
};

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function PagamentosPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [preset, setPreset] = useState<Preset>('hoje');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'awaiting_payment' | 'other'>('all');
  const [search, setSearch] = useState('');

  const range = useMemo(() => computeRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from('orders')
        .select('id, reference_cnpj, reference_name, product_name, amount, status, payment_provider, external_transaction_id, pix_code, paid_at, created_at, customer_name, customer_document, customer_email, customer_phone')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (range.from) q = q.gte('created_at', range.from.toISOString());
      if (range.to) q = q.lte('created_at', range.to.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      setOrders((data ?? []) as Order[]);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  }

  const reconcileFn = useServerFn(reconcilePendingOrders);
  const [reconciling, setReconciling] = useState(false);

  async function reconcile(silent = false) {
    setReconciling(true);
    try {
      const res = await reconcileFn({ data: {} } as any);
      if (res?.updated && res.updated > 0) {
        toast.success(`${res.updated} pagamento(s) confirmado(s)`);
        await load();
      } else if (!silent) {
        toast.info(`Nenhum pagamento novo (${res?.checked ?? 0} verificados)`);
      }
    } catch (e: any) {
      if (!silent) toast.error(e?.message ?? 'Falha ao reconciliar');
    } finally {
      setReconciling(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo]);

  // Reconciliação automática ao abrir e a cada 30s
  useEffect(() => {
    reconcile(true);
    const t = setInterval(() => reconcile(true), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const paid = orders.filter(o => o.status === 'paid' || o.paid_at);
    const awaiting = orders.filter(o => o.status === 'awaiting_payment' && !o.paid_at);
    const other = orders.filter(o => !['paid', 'awaiting_payment'].includes(o.status) && !o.paid_at);
    const paidAmount = paid.reduce((s, o) => s + Number(o.amount || 0), 0);
    const pendingAmount = awaiting.reduce((s, o) => s + Number(o.amount || 0), 0);
    return {
      total: orders.length,
      paid: paid.length,
      awaiting: awaiting.length,
      other: other.length,
      paidAmount,
      pendingAmount,
      conversion: orders.length > 0 ? Math.round((paid.length / orders.length) * 100) : 0,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return orders.filter(o => {
      if (statusFilter === 'paid' && !(o.status === 'paid' || o.paid_at)) return false;
      if (statusFilter === 'awaiting_payment' && !(o.status === 'awaiting_payment' && !o.paid_at)) return false;
      if (statusFilter === 'other' && (['paid', 'awaiting_payment'].includes(o.status) || o.paid_at)) return false;
      if (!s) return true;
      return (
        (o.reference_cnpj ?? '').toLowerCase().includes(s) ||
        (o.reference_name ?? '').toLowerCase().includes(s) ||
        (o.customer_name ?? '').toLowerCase().includes(s) ||
        (o.customer_email ?? '').toLowerCase().includes(s) ||
        (o.customer_document ?? '').toLowerCase().includes(s) ||
        (o.external_transaction_id ?? '').toLowerCase().includes(s)
      );
    });
  }, [orders, statusFilter, search]);

  async function copyPix(pix: string | null) {
    if (!pix) return toast.error('Sem código PIX');
    try {
      await navigator.clipboard.writeText(pix);
      toast.success('Código PIX copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
  }


  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  function toggleOne(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(prev => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map(o => o.id));
    });
  }

  async function deleteOne(id: string) {
    if (!confirm('Apagar este pedido? Esta ação não pode ser desfeita.')) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
      toast.success('Pedido apagado');
      setOrders(prev => prev.filter(o => o.id !== id));
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao apagar');
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Apagar ${selected.size} pedido(s) selecionado(s)? Ação irreversível.`)) return;
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from('orders').delete().in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} pedido(s) apagado(s)`);
      setOrders(prev => prev.filter(o => !selected.has(o.id)));
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao apagar');
    } finally {
      setDeleting(false);
    }
  }


  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Pagamentos</h1>
          <p className="text-slate-500">Acompanhe todos os pedidos gerados e pagamentos recebidos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WipeAllButton
            size="sm"
            label={preset === 'tudo' ? 'Apagar tudo' : 'Apagar do período'}
            title={preset === 'tudo' ? 'Apagar todos os pedidos?' : 'Apagar pedidos do período?'}
            description={
              preset === 'tudo'
                ? 'Esta ação remove permanentemente TODOS os pedidos registrados. Não pode ser desfeita.'
                : `Serão removidos ${filtered.length} pedidos do período selecionado. Ação irreversível.`
            }
            steps={[
              {
                label: 'Apagar pedidos',
                run: async () => {
                  let del = supabase.from('orders').delete().neq('id', EMPTY_UUID);
                  if (range.from) del = del.gte('created_at', range.from.toISOString());
                  if (range.to) del = del.lte('created_at', range.to.toISOString());
                  return del;
                },
              },
            ]}
            onDone={load}
          />
          <Button variant="outline" onClick={() => reconcile(false)} disabled={reconciling}>
            {reconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Reconciliar
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtro de período */}
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
                <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-auto" />
                <span className="text-slate-400 text-sm">até</span>
                <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-auto" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<DollarSign />} label="Recebido" value={fmtMoney(stats.paidAmount)} sub={`${stats.paid} pagamento(s)`} color="bg-emerald-50 text-emerald-600" />
        <KpiCard icon={<Clock />} label="A receber" value={fmtMoney(stats.pendingAmount)} sub={`${stats.awaiting} aguardando`} color="bg-amber-50 text-amber-600" />
        <KpiCard icon={<CheckCircle2 />} label="Taxa de conversão" value={`${stats.conversion}%`} sub={`${stats.paid} de ${stats.total} pedidos`} color="bg-blue-50 text-blue-600" />
        <KpiCard icon={<XCircle />} label="Cancelados/Expirados" value={String(stats.other)} sub="pedidos não pagos" color="bg-slate-100 text-slate-600" />
      </div>

      {/* Filtros de status + busca */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-2">
          {([
            ['all', 'Todos'],
            ['paid', 'Pagos'],
            ['awaiting_payment', 'Aguardando'],
            ['other', 'Outros'],
          ] as const).map(([k, l]) => (
            <Button
              key={k}
              size="sm"
              variant={statusFilter === k ? 'default' : 'outline'}
              onClick={() => setStatusFilter(k)}
            >
              {l}
            </Button>
          ))}
          <div className="flex-1 min-w-[200px] flex items-center gap-2 ml-2">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por CNPJ, nome, e-mail, ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-slate-500 uppercase tracking-wide flex items-center justify-between">
            <span>Pedidos ({filtered.length})</span>
            {selected.size > 0 && (
              <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={deleting}>
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Apagar {selected.size} selecionado(s)
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </th>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">CNPJ / Empresa</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Contato</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Pago em</th>
                  <th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={9} className="p-8 text-center text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando...
                  </td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-slate-400">
                    Nenhum pedido encontrado.
                  </td></tr>
                )}
                {!loading && filtered.map(o => {
                  const isPaid = o.status === 'paid' || !!o.paid_at;
                  const key = isPaid ? 'paid' : o.status;
                  const info = statusMap[key] ?? { label: o.status, color: 'bg-slate-100 text-slate-600', icon: Clock };
                  const Icon = info.icon;
                  return (
                    <tr key={o.id} className={`border-b last:border-0 hover:bg-slate-50 ${selected.has(o.id) ? 'bg-blue-50/40' : ''}`}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggleOne(o.id)}
                          aria-label="Selecionar"
                        />
                      </td>
                      <td className="p-2 text-slate-500 whitespace-nowrap">
                        {new Date(o.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-2">
                        <div className="font-mono font-semibold text-slate-900">{formatCPFOrCNPJ(o.reference_cnpj)}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">{o.reference_name ?? '—'}</div>
                      </td>
                      <td className="p-2">
                        <div className="font-medium text-slate-900">{o.customer_name ?? '—'}</div>
                        <div className="text-xs text-slate-500 font-mono">{formatCPFOrCNPJ(o.customer_document)}</div>
                      </td>
                      <td className="p-2 text-xs text-slate-600">
                        <div>{o.customer_email ?? '—'}</div>
                        <div className="text-slate-400">{o.customer_phone ?? ''}</div>
                      </td>
                      <td className="p-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {fmtMoney(Number(o.amount || 0))}
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${info.color}`}>
                          <Icon className="h-3 w-3" /> {info.label}
                        </span>
                      </td>
                      <td className="p-2 text-xs text-slate-500 whitespace-nowrap">
                        {o.paid_at ? new Date(o.paid_at).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {o.pix_code && !isPaid && (
                          <Button size="sm" variant="ghost" onClick={() => copyPix(o.pix_code)}>
                            <Copy className="h-3.5 w-3.5 mr-1" /> PIX
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteOne(o.id)}
                          disabled={deleting}
                          title="Apagar pedido"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </div>
        <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm font-medium text-slate-600">{label}</div>
        {sub && <div className="mt-1 text-[11px] text-slate-400">{sub}</div>}
      </CardContent>
    </Card>
  );
}
