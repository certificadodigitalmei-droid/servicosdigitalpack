import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Loader2, Bot, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getWaAutopilot, saveWaAutopilot } from '@/lib/whatsapp/campaigns.functions';

type Props = {
  /** Modelos aprovados disponíveis para os lotes automáticos. */
  approvedTemplates: Array<{ name: string }>;
  onChanged?: () => void;
};

export function WhatsappAutopilotCard({ approvedTemplates, onChanged }: Props) {
  const load = useServerFn(getWaAutopilot);
  const save = useServerFn(saveWaAutopilot);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<any>(null);
  const [form, setForm] = useState({
    enabled: false,
    batchSize: 20,
    restMinutes: 25,
    minIntervalSeconds: 40,
    maxIntervalSeconds: 110,
    dailyCap: 250,
    windowStart: 8,
    windowEnd: 20,
    templateName: '',
  });

  const refresh = async () => {
    try {
      const r: any = await load({});
      setState(r);
      const s = r?.settings ?? {};
      setForm({
        enabled: !!s.enabled,
        batchSize: Number(s.batch_size ?? 20),
        restMinutes: Number(s.rest_minutes ?? 25),
        minIntervalSeconds: Number(s.min_interval_seconds ?? 40),
        maxIntervalSeconds: Number(s.max_interval_seconds ?? 110),
        dailyCap: Number(s.daily_cap ?? 250),
        windowStart: Number(s.window_start ?? 8),
        windowEnd: Number(s.window_end ?? 20),
        templateName: String(s.template_name ?? ''),
      });
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao carregar o piloto automático');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = async (next = form) => {
    setBusy(true);
    try {
      const r: any = await save({ data: { ...next, templateName: next.templateName || null } });
      if (!r?.ok) throw new Error(r?.error ?? 'Não foi possível salvar');
      toast.success('Piloto automático atualizado');
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando piloto automático…
        </CardContent>
      </Card>
    );
  }

  const remaining = Math.max(0, form.dailyCap - Number(state?.sent24 ?? 0));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-emerald-600" /> Piloto automático de lotes
            </CardTitle>
            <CardDescription>
              Envia um lote pequeno, descansa e cria o próximo sozinho — sempre com as empresas mais recentes do dia e
              intervalo diferente para cada mensagem.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={form.enabled ? 'default' : 'secondary'}>{form.enabled ? 'Ligado' : 'Desligado'}</Badge>
            <Switch
              checked={form.enabled}
              disabled={busy}
              onCheckedChange={(v) => {
                const next = { ...form, enabled: v };
                setForm(next);
                void persist(next);
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>Empresas por lote</Label>
            <Input
              type="number"
              min={1}
              max={250}
              value={form.batchSize}
              onChange={(e) => setForm({ ...form, batchSize: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="space-y-1">
            <Label>Descanso entre lotes (min)</Label>
            <Input
              type="number"
              min={0}
              max={720}
              value={form.restMinutes}
              onChange={(e) => setForm({ ...form, restMinutes: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <Label>Intervalo mínimo (s)</Label>
            <Input
              type="number"
              min={5}
              max={3600}
              value={form.minIntervalSeconds}
              onChange={(e) => setForm({ ...form, minIntervalSeconds: Number(e.target.value) || 5 })}
            />
          </div>
          <div className="space-y-1">
            <Label>Intervalo máximo (s)</Label>
            <Input
              type="number"
              min={5}
              max={3600}
              value={form.maxIntervalSeconds}
              onChange={(e) => setForm({ ...form, maxIntervalSeconds: Number(e.target.value) || 5 })}
            />
          </div>
          <div className="space-y-1">
            <Label>Teto em 24 h</Label>
            <Input
              type="number"
              min={1}
              max={5000}
              value={form.dailyCap}
              onChange={(e) => setForm({ ...form, dailyCap: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="space-y-1">
            <Label>Começa às (hora)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.windowStart}
              onChange={(e) => setForm({ ...form, windowStart: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <Label>Para às (hora)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.windowEnd}
              onChange={(e) => setForm({ ...form, windowEnd: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <Label>Modelo aprovado</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.templateName}
              onChange={(e) => setForm({ ...form, templateName: e.target.value })}
            >
              <option value="">Usar o modelo selecionado no painel</option>
              {approvedTemplates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 p-3 text-sm">
          <div className="space-y-1">
            <div>
              Enviadas nas últimas 24 h: <strong>{state?.sent24 ?? 0}</strong> · restam <strong>{remaining}</strong> até
              o teto.
            </div>
            <div className="text-muted-foreground">
              {state?.running ? 'Um lote está rodando agora.' : 'Nenhum lote rodando.'}{' '}
              {state?.settings?.last_batch_at
                ? `Último lote terminou em ${new Date(state.settings.last_batch_at).toLocaleString('pt-BR')}.`
                : ''}
            </div>
            {state?.settings?.last_error && (
              <div className="text-amber-700">Aviso: {state.settings.last_error}</div>
            )}
          </div>
          <Button onClick={() => void persist()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar ajustes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
