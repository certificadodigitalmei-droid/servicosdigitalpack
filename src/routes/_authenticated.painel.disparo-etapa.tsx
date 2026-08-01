import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { FlaskConical, Loader2, Mail, RefreshCw, Send, Tag, Timer, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  listFunnelTargets,
  sendFunnelCampaign,
  clearFunnelDiscount,
  sendFunnelTestEmail,
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

type TemplateName = 'pix-pendente' | 'oferta-desconto' | 'pix-gerado' | 'pagamento-confirmado';

const TEMPLATES: { value: TemplateName; label: string; hint: string }[] = [
  { value: 'pix-pendente', label: 'Cobrança / pendência (guia não paga)', hint: 'Alerta de pagamento pendente.' },
  { value: 'oferta-desconto', label: 'Oferta com desconto', hint: 'Usa o valor promocional configurado abaixo.' },
  { value: 'pix-gerado', label: 'Guia gerada (PIX criado)', hint: 'Confirma que a guia está disponível.' },
  { value: 'pagamento-confirmado', label: 'Pagamento confirmado', hint: 'Certificado emitido e vinculado.' },
];

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';

/** Perfis de ritmo de envio (quantos e-mails por hora). */
const RITMOS: { value: string; label: string; block: number; rest: number }[] = [
  { value: 'off', label: 'Sem limite (enviar tudo de uma vez)', block: 0, rest: 0 },
  { value: '60', label: 'Seguro — 60 por hora', block: 60, rest: 60 },
  { value: '90', label: 'Recomendado — 90 por hora', block: 90, rest: 60 },
  { value: '100', label: 'Moderado — 100 por hora', block: 100, rest: 60 },
  { value: '200', label: 'Rápido — 200 por hora', block: 200, rest: 60 },
  { value: '400', label: 'Alto volume — 400 por hora', block: 400, rest: 60 },
  { value: '500', label: 'Máximo — 500 por hora', block: 500, rest: 60 },
  { value: 'custom', label: 'Personalizado', block: 100, rest: 60 },
];

const STAGES: { value: FunnelStage; label: string }[] = [
  { value: 'all', label: 'Todas (não pagas)' },
  { value: 'not_visited', label: 'Não visitaram o link' },
  { value: 'visited', label: 'Apenas visitaram' },
  { value: 'checkout', label: 'Chegaram no checkout' },
  { value: 'checkout_unpaid', label: 'Foram ao checkout e não pagaram' },
  { value: 'guia', label: 'Clicaram em gerar guia' },
  { value: 'pending_pix', label: 'Geraram PIX pendente e não pagaram' },
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

  const [template, setTemplate] = useState<TemplateName>('pix-pendente');
  const [useDiscount, setUseDiscount] = useState(false);
  const [discount, setDiscount] = useState('56,99');
  const [hours, setHours] = useState('24');
  const [label, setLabel] = useState('apenas hoje');
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  const doList = useServerFn(listFunnelTargets);
  const doSend = useServerFn(sendFunnelCampaign);
  const doClear = useServerFn(clearFunnelDiscount);
  const doTest = useServerFn(sendFunnelTestEmail);

  // ---- Ritmo de envio ----
  const [ritmo, setRitmo] = useState('90');
  const [blockSize, setBlockSize] = useState('100');
  const [restMin, setRestMin] = useState('60');
  const [progress, setProgress] = useState<{ done: number; total: number; wait: number } | null>(
    null,
  );
  const stopRef = useRef(false);

  const ritmoCfg = useMemo(() => {
    const p = RITMOS.find((r) => r.value === ritmo) ?? RITMOS[0];
    if (ritmo === 'custom') {
      return {
        block: Math.max(1, Number(blockSize) || 100),
        rest: Math.max(0, Number(restMin) || 0),
      };
    }
    return { block: p.block, rest: p.rest };
  }, [ritmo, blockSize, restMin]);

  const sleepWithCountdown = useCallback(async (seconds: number, done: number, total: number) => {
    for (let s = seconds; s > 0; s--) {
      if (stopRef.current) return;
      setProgress({ done, total, wait: s });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }, []);

  /** Percorre a lista em blocos, respeitando o descanso configurado. */
  const runPaced = useCallback(
    async <T,>(items: T[], sendChunk: (chunk: T[]) => Promise<{ sent: number; skipped: number }>) => {
      stopRef.current = false;
      const size = ritmoCfg.block > 0 ? ritmoCfg.block : items.length;
      let ok = 0;
      let fail = 0;
      let done = 0;
      for (let i = 0; i < items.length; i += size) {
        if (stopRef.current) break;
        const chunk = items.slice(i, i + size);
        setProgress({ done, total: items.length, wait: 0 });
        const r = await sendChunk(chunk);
        ok += r.sent;
        fail += r.skipped;
        done += chunk.length;
        setProgress({ done, total: items.length, wait: 0 });
        const hasMore = i + size < items.length;
        if (hasMore && ritmoCfg.rest > 0) {
          await sleepWithCountdown(ritmoCfg.rest * 60, done, items.length);
        }
      }
      setProgress(null);
      return { ok, fail, stopped: stopRef.current };
    },
    [ritmoCfg, sleepWithCountdown],
  );

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
      const { ok, fail, stopped } = await runPaced(ids, async (chunk) => {
        let sent = 0;
        let skipped = 0;
        for (let i = 0; i < chunk.length; i += 200) {
          const r = await doSend({
            data: {
              linkIds: chunk.slice(i, i + 200),
              template,
              discountAmount: useDiscount ? parsedDiscount : undefined,
              discountHours: Number(hours) || 24,
              ofertaLabel: label || undefined,
            },
          });
          sent += r.sent;
          skipped += r.skipped;
        }
        return { sent, skipped };
      });
      toast.success(
        `${ok} e-mail(s) enviado(s). ${fail ? `${fail} ignorado(s). ` : ''}${stopped ? 'Envio interrompido.' : ''}`,
      );
      void load();
    } catch (e: any) {
      toast.error('Falha no envio: ' + (e?.message ?? 'erro'));
    } finally {
      setSending(false);
    }
  };

  const sendTest = async () => {
    const email = testEmail.trim();
    if (!email) {
      toast.error('Informe o e-mail de teste.');
      return;
    }
    setTesting(true);
    try {
      const firstSelected = targets.find((t) => selected.has(t.linkId));
      await doTest({
        data: {
          email,
          template,
          discountAmount: useDiscount && parsedDiscount > 0 ? parsedDiscount : undefined,
          ofertaLabel: label || undefined,
          linkId: firstSelected?.linkId,
        },
      });
      toast.success(`E-mail de teste enviado para ${email}.`);
    } catch (e: any) {
      toast.error('Falha no teste: ' + (e?.message ?? 'erro'));
    } finally {
      setTesting(false);
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
            <Timer className="h-4 w-4" /> Ritmo de envio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-1">
              <Label>Perfil</Label>
              <Select value={ritmo} onValueChange={setRitmo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RITMOS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ritmo === 'custom' ? (
              <>
                <div className="space-y-1.5">
                  <Label>E-mails por bloco</Label>
                  <Input value={blockSize} onChange={(e) => setBlockSize(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Descanso após o bloco (minutos)</Label>
                  <Input value={restMin} onChange={(e) => setRestMin(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="md:col-span-2 flex items-end text-sm text-muted-foreground">
                {ritmoCfg.block > 0
                  ? `Envia ${ritmoCfg.block} e-mail(s), descansa ${ritmoCfg.rest} minuto(s) e continua automaticamente.`
                  : 'Todos os e-mails são enviados de uma só vez.'}
              </div>
            )}
          </div>

          {progress ? (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  Enviados {progress.done} de {progress.total}
                  {progress.wait > 0
                    ? ` — descansando ${Math.floor(progress.wait / 60)}m ${progress.wait % 60}s`
                    : ' — enviando…'}
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    stopRef.current = true;
                    toast.info('Envio será interrompido.');
                  }}
                >
                  Parar
                </Button>
              </div>
              <div className="h-2 w-full rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Mantenha esta aba aberta até o fim do disparo.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Modelo de e-mail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTemplate(t.value)}
                className={`rounded-lg border p-3 text-left transition ${
                  template === t.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-muted/50'
                }`}
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.hint}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            O modelo escolhido é o e-mail enviado para as empresas selecionadas abaixo.
          </p>

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
            Aplicar desconto no link das empresas selecionadas (valor promocional)
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
          <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FlaskConical className="h-4 w-4" /> Testar antes de enviar
            </div>
            <p className="text-xs text-muted-foreground">
              Envia uma prévia real do e-mail selecionado (com o desconto configurado) para o seu
              endereço. Nada é alterado no banco e nenhum cliente recebe.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                placeholder="seu@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="sm:max-w-xs"
              />
              <Button variant="secondary" onClick={sendTest} disabled={testing}>
                {testing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FlaskConical className="h-4 w-4 mr-2" />
                )}
                Enviar teste
              </Button>
            </div>
          </div>

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
