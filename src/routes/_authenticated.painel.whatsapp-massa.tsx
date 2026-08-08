import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Send, Trash2, Users, CheckCircle2, XCircle, RefreshCw, Link2 } from 'lucide-react';
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
  syncWaTemplateStatus,
  enqueueWaCompanies,
  sendWaBatch,
  clearWaApiQueue,
  sendWaTestMessage,
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
  plugin_id: string;
  whatsapp_phone_number_id: string;
  waba_id: string;
  whatsapp_api_version: string;
  button_base_url: string;
  template_name: string;
  template_language: string;
  template_body: string;
  active: boolean;
  daily_limit: number;
  batch_size: number;
  min_delay_ms: number;
};

const EMPTY: Cfg = {
  base_url: 'https://api.chakrahq.com',
  plugin_id: '',
  whatsapp_phone_number_id: '',
  waba_id: '',
  whatsapp_api_version: 'v19.0',
  button_base_url: 'https://seu-certificado-mei-digital.online/c/',
  template_name: 'certificado1',
  template_language: 'pt_BR',
  template_body:
    '*Olá, {{razao}}* Recomendamos que confira as informações do CNPJ MEI: *{{cnpj}}.* e os dados relacionados ao Certificado Digital da sua empresa.',
  active: false,
  daily_limit: 300,
  batch_size: 20,
  min_delay_ms: 4000,
};

function statusBadge(status: string) {
  const s = (status || 'PENDING').toUpperCase();
  if (s === 'APPROVED') return { label: 'Aprovado', variant: 'default' as const };
  if (s === 'REJECTED') return { label: 'Rejeitado', variant: 'destructive' as const };
  if (s === 'PAUSED') return { label: 'Pausado', variant: 'destructive' as const };
  return { label: 'Aguardando aprovação', variant: 'secondary' as const };
}

function WhatsappMassaPage() {
  const load = useServerFn(getWaApiConfig);
  const save = useServerFn(saveWaApiConfig);
  const syncStatus = useServerFn(syncWaTemplateStatus);
  const enqueue = useServerFn(enqueueWaCompanies);
  const send = useServerFn(sendWaBatch);
  const clear = useServerFn(clearWaApiQueue);
  const sendTest = useServerFn(sendWaTestMessage);

  const [cfg, setCfg] = useState<Cfg>(EMPTY);
  const [templateStatus, setTemplateStatus] = useState('PENDING');
  const [lastError, setLastError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0, audience: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [qty, setQty] = useState(50);
  const [testPhone, setTestPhone] = useState('');
  const [testRazao, setTestRazao] = useState('');
  const [testCnpj, setTestCnpj] = useState('');
  const [testToken, setTestToken] = useState('');

  const approved = templateStatus.toUpperCase() === 'APPROVED';
  const badge = statusBadge(templateStatus);

  const refresh = async () => {
    try {
      const res: any = await load({});
      const s = res.settings;
      if (s) {
        setCfg({
          base_url: s.base_url ?? EMPTY.base_url,
          plugin_id: s.plugin_id ?? '',
          whatsapp_phone_number_id: s.whatsapp_phone_number_id ?? '',
          waba_id: s.waba_id ?? '',
          whatsapp_api_version: s.whatsapp_api_version ?? 'v19.0',
          button_base_url: s.button_base_url ?? EMPTY.button_base_url,
          template_name: s.template_name ?? '',
          template_language: s.template_language ?? 'pt_BR',
          template_body: s.template_body ?? '',
          active: !!s.active,
          daily_limit: s.daily_limit ?? 300,
          batch_size: s.batch_size ?? 20,
          min_delay_ms: s.min_delay_ms ?? 4000,
        });
        setTemplateStatus(s.template_status ?? 'PENDING');
        setLastError(s.last_error ?? null);
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
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>Template: {badge.label}</Badge>
          <Badge variant={cfg.active && approved ? 'default' : 'secondary'}>
            {cfg.active && approved ? 'Ativo' : 'Pausado'}
          </Badge>
        </div>
      </header>

      {!hasApiKey && (
        <Alert>
          <AlertDescription>
            A chave da ChakraHQ ainda não está salva no servidor. Cadastre a chave
            <code className="mx-1 rounded bg-slate-100 px-1">CHAKRA_API_KEY</code> antes de disparar.
          </AlertDescription>
        </Alert>
      )}

      {!approved && (
        <Alert>
          <AlertDescription>
            O template <b>{cfg.template_name || '—'}</b> está com status <b>{badge.label}</b>. O envio permanece
            bloqueado até o WhatsApp aprovar. Use “Sincronizar status do template” para atualizar.
          </AlertDescription>
        </Alert>
      )}

      {lastError && (
        <Alert variant="destructive">
          <AlertDescription className="break-words">{lastError}</AlertDescription>
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
          <CardTitle>Conexão oficial (ChakraHQ)</CardTitle>
          <CardDescription>
            Template <b>certificado1</b> · variáveis do corpo <b>razao</b> (nome da empresa) e <b>cnpj</b> (formatado
            00.000.000/0000-00) · botão <b>{'{{1}}'}</b> recebe somente o token individual do link.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 rounded-lg border bg-slate-50 p-3 text-sm md:col-span-2">
            <div className="text-xs font-semibold uppercase text-slate-500">Prévia por empresa</div>
            <p className="text-slate-700">Atenção: Verifique seu CNPJ</p>
            <p className="text-slate-700">
              <b>Olá, {'{razao da empresa}'}</b> Recomendamos que confira as informações do CNPJ MEI:{' '}
              <b>{'{cnpj da empresa}'}.</b> e os dados relacionados ao Certificado Digital da sua empresa.
            </p>
            <p className="text-slate-500">
              Botão “Clique aqui - VERIFICAR” → {cfg.button_base_url}
              <b>{'{token da empresa}'}</b>
            </p>
            <p className="text-xs text-slate-500">
              Cada disparo substitui razao, cnpj e token pelos dados da empresa correspondente na fila.
            </p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="base_url">API base</Label>
            <Input id="base_url" value={cfg.base_url} onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plugin_id">Plugin ID</Label>
            <Input id="plugin_id" value={cfg.plugin_id} onChange={(e) => setCfg({ ...cfg, plugin_id: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone_id">Phone Number ID (Meta)</Label>
            <Input
              id="phone_id"
              value={cfg.whatsapp_phone_number_id}
              onChange={(e) => setCfg({ ...cfg, whatsapp_phone_number_id: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="waba_id">WABA ID</Label>
            <Input id="waba_id" value={cfg.waba_id} onChange={(e) => setCfg({ ...cfg, waba_id: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api_version">Versão da API</Label>
            <Input
              id="api_version"
              value={cfg.whatsapp_api_version}
              onChange={(e) => setCfg({ ...cfg, whatsapp_api_version: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template_name">Template aprovado</Label>
            <Input
              id="template_name"
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
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="button_base_url">Base do botão</Label>
            <Input
              id="button_base_url"
              value={cfg.button_base_url}
              onChange={(e) => setCfg({ ...cfg, button_base_url: e.target.value })}
            />
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Link2 className="h-3.5 w-3.5" />
              Cada empresa recebe <code className="rounded bg-slate-100 px-1">{cfg.button_base_url}</code>
              <b>{'{token individual}'}</b> — só o token vai no botão.
            </p>
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
              placeholder="Olá {{razao}}, o CNPJ {{cnpj}} consta sem certificado digital ativo."
              value={cfg.template_body}
              onChange={(e) => setCfg({ ...cfg, template_body: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch
              id="active"
              disabled={!approved}
              checked={cfg.active && approved}
              onCheckedChange={(v) => setCfg({ ...cfg, active: v })}
            />
            <Label htmlFor="active">Envio ativo {approved ? '' : '(bloqueado até aprovação)'}</Label>
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button
              disabled={busy === 'save'}
              onClick={() =>
                run('save', async () => {
                  await save({
                    data: {
                      base_url: cfg.base_url,
                      plugin_id: cfg.plugin_id || null,
                      whatsapp_phone_number_id: cfg.whatsapp_phone_number_id || null,
                      waba_id: cfg.waba_id || null,
                      whatsapp_api_version: cfg.whatsapp_api_version,
                      button_base_url: cfg.button_base_url,
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
            <Button
              variant="secondary"
              disabled={busy === 'sync'}
              onClick={() =>
                run('sync', async () => {
                  const r: any = await syncStatus({});
                  if (r.ok) toast.success(`Status do template: ${r.status}`);
                  else toast.error(r.error ?? 'Falha ao sincronizar');
                })
              }
            >
              {busy === 'sync' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sincronizar status do template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200">
        <CardHeader>
          <CardTitle>Envio de teste</CardTitle>
          <CardDescription>
            Antes de disparar em massa, envie uma mensagem única para o número que você escolher.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="test_phone">Número de destino (com DDD)</Label>
            <Input
              id="test_phone"
              placeholder="(11) 99999-9999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test_razao">Nome da empresa (opcional)</Label>
            <Input id="test_razao" value={testRazao} onChange={(e) => setTestRazao(e.target.value)} placeholder="Empresa Teste" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test_cnpj">CNPJ (opcional)</Label>
            <Input id="test_cnpj" value={testCnpj} onChange={(e) => setTestCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="test_token">Token do botão (opcional)</Label>
            <Input
              id="test_token"
              value={testToken}
              onChange={(e) => setTestToken(e.target.value)}
              placeholder="Deixe vazio para usar o último link ativo"
            />
          </div>
          <div className="flex items-end md:col-span-2">
            <Button
              variant="secondary"
              disabled={busy === 'test' || !approved || !testPhone.trim()}
              onClick={() =>
                run('test', async () => {
                  const r: any = await sendTest({
                    data: {
                      phone: testPhone.trim(),
                      razao: testRazao.trim() || undefined,
                      cnpj: testCnpj.trim() || undefined,
                      token: testToken.trim() || undefined,
                    },
                  });
                  if (r.ok) toast.success(`Teste enviado para ${r.phone}`);
                  else toast.error(r.error ?? 'Falha no envio de teste');
                })
              }
            >
              {busy === 'test' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar teste
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>

        <CardHeader>
          <CardTitle>Fila de disparo</CardTitle>
          <CardDescription>
            Só entram empresas com telefone brasileiro válido e link ativo com token individual.
          </CardDescription>
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
                toast.success(
                  `${r.inserted} contatos adicionados · ${r.skippedNoLink ?? 0} sem link ativo · ${r.skippedNoPhone ?? 0} sem telefone válido`,
                );
              })
            }
          >
            {busy === 'enq' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar à fila
          </Button>
          <Button
            disabled={busy === 'send' || !approved || !cfg.active}
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
                <th className="py-2">Link</th>
                <th className="py-2">Status</th>
                <th className="py-2">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">Nenhum envio ainda.</td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">
                    <div className="font-medium text-slate-800">{r.company_name ?? '—'}</div>
                    <div className="text-xs text-slate-400">{r.cnpj ?? ''}</div>
                  </td>
                  <td className="py-2 text-slate-600">{r.phone}</td>
                  <td className="py-2 text-xs text-slate-500">
                    {r.button_url_token ? `/c/${r.button_url_token}` : <span className="text-red-500">sem token</span>}
                  </td>
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
