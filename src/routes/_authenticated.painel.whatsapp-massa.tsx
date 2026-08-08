import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Send, Trash2, Users, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  getWaApiConfig,
  saveWaApiConfig,
  enqueueWaCompanies,
  sendWaBatch,
  clearWaApiQueue,
} from '@/lib/whatsapp/chakra.functions';

export const Route = createFileRoute('/_authenticated/painel/whatsapp-massa')({
  head: () => ({
    meta: [
      { title: 'Envio em massa WhatsApp | Central MEI' },
      { name: 'description', content: 'Disparo oficial de mensagens WhatsApp com template aprovado via ChakraHQ.' },
    ],
  }),
  component: WhatsappMassaPage,
});

type Cfg = {
  base_url: string;
  channel_id: string;
  template_name: string;
  template_language: string;
  template_body: string;
  active: boolean;
  daily_limit: number;
  batch_size: number;
  min_delay_ms: number;
};

const EMPTY: Cfg = {
  base_url: 'https://api.chakrahq.com/v1/messages',
  channel_id: '',
  template_name: '',
  template_language: 'pt_BR',
  template_body: '',
  active: false,
  daily_limit: 300,
  batch_size: 20,
  min_delay_ms: 4000,
};

function WhatsappMassaPage() {
  const load = useServerFn(getWaApiConfig);
  const save = useServerFn(saveWaApiConfig);
  const enqueue = useServerFn(enqueueWaCompanies);
  const send = useServerFn(sendWaBatch);
  const clear = useServerFn(clearWaApiQueue);

  const [cfg, setCfg] = useState<Cfg>(EMPTY);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0, audience: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [qty, setQty] = useState(50);

  const refresh = async () => {
    try {
      const res: any = await load({});
      if (res.settings) {
        setCfg({
          base_url: res.settings.base_url ?? EMPTY.base_url,
          channel_id: res.settings.channel_id ?? '',
          template_name: res.settings.template_name ?? '',
          template_language: res.settings.template_language ?? 'pt_BR',
          template_body: res.settings.template_body ?? '',
          active: !!res.settings.active,
          daily_limit: res.settings.daily_limit ?? 300,
          batch_size: res.settings.batch_size ?? 20,
          min_delay_ms: res.settings.min_delay_ms ?? 4000,
        });
      }
      setHasApiKey(!!res.hasApiKey);
      setStats(res.stats);
      setRecent(res.recent ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro inesperado');
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <MessageCircle className="h-6 w-6 text-emerald-600" />
            Envio em massa — WhatsApp
          </h1>
          <p className="text-sm text-slate-500">
            Disparo oficial pela API da ChakraHQ usando o template aprovado pelo WhatsApp.
          </p>
        </div>
        <Badge variant={cfg.active ? 'default' : 'secondary'}>{cfg.active ? 'Ativo' : 'Pausado'}</Badge>
      </header>

      {!hasApiKey && (
        <Alert>
          <AlertDescription>
            A chave da ChakraHQ ainda não está salva no servidor. Peça para cadastrar a chave
            <code className="mx-1 rounded bg-slate-100 px-1">CHAKRA_API_KEY</code> antes de disparar.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Empresas com telefone', value: stats.audience, icon: Users },
          { label: 'Na fila', value: stats.pending, icon: Send },
          { label: 'Enviadas', value: stats.sent, icon: CheckCircle2 },
          { label: 'Falhas', value: stats.failed, icon: XCircle },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <s.icon className="h-5 w-5 text-slate-400" />
              <div className="min-w-0">
                <div className="text-2xl font-bold text-slate-900">{s.value}</div>
                <div className="truncate text-xs text-slate-500">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração da API (ChakraHQ)</CardTitle>
          <CardDescription>
            Endpoint de envio, canal e template aprovado. As variáveis do template são preenchidas
            nesta ordem: <b>{'{{1}}'}</b> nome da empresa, <b>{'{{2}}'}</b> CNPJ, <b>{'{{3}}'}</b> link.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="base_url">URL do endpoint de envio</Label>
            <Input id="base_url" value={cfg.base_url} onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="channel_id">ID do canal / número (opcional)</Label>
            <Input id="channel_id" value={cfg.channel_id} onChange={(e) => setCfg({ ...cfg, channel_id: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template_name">Nome do template aprovado</Label>
            <Input
              id="template_name"
              placeholder="ex: aviso_certificado_mei"
              value={cfg.template_name}
              onChange={(e) => setCfg({ ...cfg, template_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template_language">Idioma do template</Label>
            <Input
              id="template_language"
              value={cfg.template_language}
              onChange={(e) => setCfg({ ...cfg, template_language: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="daily_limit">Limite por dia</Label>
            <Input
              id="daily_limit"
              type="number"
              value={cfg.daily_limit}
              onChange={(e) => setCfg({ ...cfg, daily_limit: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="batch_size">Mensagens por lote</Label>
            <Input
              id="batch_size"
              type="number"
              value={cfg.batch_size}
              onChange={(e) => setCfg({ ...cfg, batch_size: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="min_delay_ms">Intervalo entre mensagens (ms)</Label>
            <Input
              id="min_delay_ms"
              type="number"
              value={cfg.min_delay_ms}
              onChange={(e) => setCfg({ ...cfg, min_delay_ms: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="template_body">Texto do template (referência interna)</Label>
            <Textarea
              id="template_body"
              rows={4}
              placeholder="Olá {{1}}, identificamos que o CNPJ {{2}} está com o certificado digital pendente. Acesse: {{3}}"
              value={cfg.template_body}
              onChange={(e) => setCfg({ ...cfg, template_body: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch id="active" checked={cfg.active} onCheckedChange={(v) => setCfg({ ...cfg, active: v })} />
            <Label htmlFor="active">Envio ativo</Label>
          </div>
          <div className="md:col-span-2">
            <Button
              disabled={busy === 'save'}
              onClick={() =>
                run('save', async () => {
                  await save({
                    data: {
                      base_url: cfg.base_url,
                      channel_id: cfg.channel_id || null,
                      template_name: cfg.template_name || null,
                      template_language: cfg.template_language,
                      template_body: cfg.template_body || null,
                      active: cfg.active,
                      daily_limit: cfg.daily_limit,
                      batch_size: cfg.batch_size,
                      min_delay_ms: cfg.min_delay_ms,
                    },
                  });
                  toast.success('Configuração salva');
                })
              }
            >
              {busy === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fila de disparo</CardTitle>
          <CardDescription>Monta a fila com empresas importadas que possuem telefone celular.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qty">Quantidade</Label>
            <Input id="qty" type="number" className="w-32" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          <Button
            variant="secondary"
            disabled={busy === 'enq'}
            onClick={() =>
              run('enq', async () => {
                const r: any = await enqueue({ data: { limit: Math.max(1, Math.min(2000, qty)) } });
                toast.success(`${r.inserted} contatos adicionados à fila`);
              })
            }
          >
            {busy === 'enq' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar à fila
          </Button>
          <Button
            disabled={busy === 'send'}
            onClick={() =>
              run('send', async () => {
                const r: any = await send({ data: {} });
                if (r.error) toast.error(r.error);
                else toast.success(`Enviadas: ${r.sent} · Falhas: ${r.failed}`);
              })
            }
          >
            {busy === 'send' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Disparar lote
          </Button>
          <Button
            variant="ghost"
            className="text-slate-500 hover:text-red-600"
            disabled={busy === 'clr'}
            onClick={() =>
              run('clr', async () => {
                await clear({ data: { scope: 'pending' } });
                toast.success('Fila pendente limpa');
              })
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />Limpar pendentes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimos envios</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-400">
                <th className="py-2">Empresa</th>
                <th className="py-2">Telefone</th>
                <th className="py-2">Status</th>
                <th className="py-2">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">Nenhum envio ainda.</td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">
                    <div className="font-medium text-slate-800">{r.company_name ?? '—'}</div>
                    <div className="text-xs text-slate-400">{r.cnpj ?? ''}</div>
                  </td>
                  <td className="py-2 text-slate-600">{r.phone}</td>
                  <td className="py-2">
                    <Badge variant={r.status === 'sent' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="max-w-[280px] truncate py-2 text-xs text-slate-500">
                    {r.error_message ?? r.provider_message_id ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
