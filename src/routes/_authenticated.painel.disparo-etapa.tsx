import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Mail, RefreshCw, Send, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  listFunnelTargets,
  sendFunnelCampaign,
  clearFunnelDiscount,
  type FunnelStage,
  type FunnelTarget,
} from '@/lib/emails/funnel-campaign.functions';
import { formatCNPJ } from '@/lib/format';

export const Route = createFileRoute('/_authenticated/painel/disparo-etapa')({
  component: DisparoEtapaPage,
  head: () => ({
    meta: [
      { title: 'Disparo por Etapa | Painel' },
      {
        name: 'description',
        content: 'Envie e-mails segmentados por etapa do funil, com desconto opcional por empresa.',
      },
    ],
  }),
});

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';

const STAGES: { value: FunnelStage; label: string }[] = [
  { value: 'all', label: 'Todas (não pagas)' },
  { value: 'not_visited', label: 'Não visitaram o link' },
  { value: 'visited', label: 'Apenas visitaram' },
  { value: 'checkout', label: 'Chegaram no checkout' },
  { value: 'guia', label: 'Clicaram em gerar guia' },
  { value: 'pending_pix', label: 'Geraram PIX e não pagaram' },
];

function rangeFrom(preset: Preset, from: string, to: string) {
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  if (preset === 'today') return { gte: startOf(now), lte: endOf(now) };
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { gte: startOf(y), lte: endOf(y) };
  }
  if (preset === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { gte: startOf(d), lte: endOf(now) };
  }
  if (preset === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { gte: startOf(d), lte: endOf(now) };
  }
  if (preset === 'custom') {
    return {
      gte: from ? new Date(from + 'T00:00:00').toISOString() : undefined,
      lte: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
    };
  }
  return { gte: undefined, lte: undefined };
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

function DisparoEtapaPage() {
  const [preset, setPreset] = useState<Preset>('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stage, setStage] = useState<FunnelStage>('pending_pix');
  const [targets, setTargets] = useState<FunnelTarget[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [useDiscount, setUseDiscount] = useState(true);
  const [discount, setDiscount] = useState('56,99');
  const [hours, setHours] = useState('24');
  const [label, setLabel] = useState('apenas hoje');

  const doList = useServerFn(listFunnelTargets);
  const doSend = useServerFn(sendFunnelCampaign);
  const doClear = useServerFn(clearFunnelDiscount);

  const range = useMemo(() => rangeFrom(preset, from, to), [preset, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await doList({
        data: { stage, from: range.gte, to: range.lte, onlyWithEmail: true, limit: 1000 },
      });
      setTargets(r.targets);
      setSelected(new Set(r.targets.map((t) => t.linkId)));
    } catch (e: any) {
      toast.error('Falha ao carregar: ' + (e?.message ?? 'erro'));
    } finally {
      setLoading(false);
    }
  }, [doList, stage, range.gte, range.lte]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parsedDiscount = Number(discount.replace(/\./g, '').replace(',', '.'));

  const send = async () => {
    const ids = Array.from(selected);
    if (!ids.length) {
      toast.error('Selecione ao menos uma empresa.');
      return;
    }
    if (useDiscount && !(parsedDiscount > 0)) {
      toast.error('Informe um valor de desconto válido.');
      return;
    }
    if (
      !confirm(
        `Enviar e-mail para ${ids.length} empresa(s)` +
          (useDiscount ? ` com o valor promocional de ${brl(parsedDiscount)}?` : '?'),
      )
    )
      return;

    setSending(true);
    try {
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const r = await doSend({
          data: {
            linkIds: ids.slice(i, i + 200),
            template: useDiscount ? 'oferta-desconto' : 'pix-pendente',
            discountAmount: useDiscount ? parsedDiscount : undefined,
            discountHours: Number(hours) || 24,
            ofertaLabel: label || undefined,
          },
        });
        ok += r.sent;
        fail += r.skipped;
      }
      toast.success(`${ok} e-mail(s) enviado(s). ${fail ? `${fail} ignorado(s).` : ''}`);
      void load();
    } catch (e: any) {
      toast.error('Falha no envio: ' + (e?.message ?? 'erro'));
    } finally {
      setSending(false);
    }
  };

  const clearDiscounts = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Remover o desconto de ${ids.length} empresa(s)?`)) return;
    try {
      await doClear({ data: { linkIds: ids } });
      toast.success('Descontos removidos.');
      void load();
    } catch (e: any) {
      toast.error('Falha: ' + (e?.message ?? 'erro'));
    }
  };

  const comDesconto = targets.filter(
    (t) => t.discountCents && (!t.discountExpiresAt || new Date(t.discountExpiresAt) > new Date()),
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Send className="h-6 w-6" /> Disparo por Etapa
        </h1>
        <p className="text-muted-foreground text-sm">
          Escolha a etapa do funil e o período, aplique um desconto exclusivo e envie o e-mail. O
          valor promocional é aplicado automaticamente no link enviado.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Etapa</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as FunnelStage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Período</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="custom">Data personalizada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === 'custom' ? (
            <>
              <div className="space-y-1.5">
                <Label>De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="flex items-end md:col-span-2">
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                lista
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" /> Desconto da campanha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={useDiscount} onCheckedChange={(v) => setUseDiscount(!!v)} />
            Enviar com desconto (o link passa a cobrar o valor promocional)
          </label>
          {useDiscount ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Valor promocional (R$)</Label>
                <Input value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Validade do desconto (horas)</Label>
                <Input value={hours} onChange={(e) => setHours(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Texto da validade no e-mail</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Será enviado o e-mail de <strong>pendência</strong> (guia não paga), sem alterar o
              valor.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={send} disabled={sending || !selected.size}>
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Enviar para {selected.size} empresa(s)
            </Button>
            <Button variant="outline" onClick={clearDiscounts} disabled={!selected.size}>
              <X className="h-4 w-4 mr-2" /> Remover desconto das selecionadas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">
            Empresas encontradas: {targets.length}{' '}
            {comDesconto ? (
              <Badge variant="secondary" className="ml-2">
                {comDesconto} com desconto ativo
              </Badge>
            ) : null}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelected(new Set(targets.map((t) => t.linkId)))}
            >
              Selecionar todas
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Limpar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : targets.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma empresa com e-mail nesta etapa/período.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0">
                  <tr>
                    <th className="p-3 w-10"></th>
                    <th className="text-left p-3">Empresa</th>
                    <th className="text-left p-3">CNPJ</th>
                    <th className="text-left p-3">E-mail</th>
                    <th className="text-center p-3">Acessos</th>
                    <th className="text-center p-3">PIX</th>
                    <th className="text-center p-3">Desconto</th>
                    <th className="text-center p-3">E-mails</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t) => (
                    <tr key={t.linkId} className="border-t">
                      <td className="p-3">
                        <Checkbox
                          checked={selected.has(t.linkId)}
                          onCheckedChange={() => toggle(t.linkId)}
                        />
                      </td>
                      <td className="p-3 max-w-[240px] truncate">{t.empresa ?? '—'}</td>
                      <td className="p-3 whitespace-nowrap">{formatCNPJ(t.cnpj)}</td>
                      <td className="p-3 max-w-[220px] truncate">{t.email}</td>
                      <td className="p-3 text-center">{t.views}</td>
                      <td className="p-3 text-center">
                        {t.pendingPix ? (
                          <Badge variant="destructive">pendente</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {t.discountCents ? (
                          <Badge variant="secondary">{brl(t.discountCents / 100)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">{t.promoCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
