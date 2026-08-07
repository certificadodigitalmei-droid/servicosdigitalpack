import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Check, Trash2, Pencil, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  listPaymentGateways,
  upsertPaymentGateway,
  activatePaymentGateway,
  deactivatePaymentGateway,
  deletePaymentGateway,
  testPaymentGatewayConnection,
  type PaymentGateway,
} from '@/lib/payments/gateways.functions';

export const Route = createFileRoute('/_authenticated/painel/configuracoes-pagamento')({
  head: () => ({ meta: [{ title: 'Configurações de Pagamento | Central MEI' }] }),
  component: PaymentGatewaysPage,
});

type ProviderId = 'sigilopay' | 'syncpay' | 'mercadopago';
type Environment = 'test' | 'production';

const PROVIDERS: Record<ProviderId, {
  label: string;
  docsUrl: string;
  defaultBase: string;
  webhookPath: string;
  webhookOrigin?: string;
  publicLabel: string;
  secretLabel: string;
  publicPlaceholder: string;
  secretPlaceholder: string;
  hasWebhookSecret?: boolean;
  hasEnvironment?: boolean;
}> = {
  sigilopay: {
    label: 'SigiloPay',
    docsUrl: 'https://app.sigilopay.com.br/docs',
    defaultBase: 'https://app.sigilopay.com.br/api/v1',
    webhookPath: '/api/public/webhook-sigilopay',
    publicLabel: 'Chave pública (x-public-key)',
    secretLabel: 'Chave secreta (x-secret-key)',
    publicPlaceholder: 'pk_...',
    secretPlaceholder: 'sk_...',
  },
  syncpay: {
    label: 'SyncPay',
    docsUrl: 'https://api.syncpayments.com.br',
    defaultBase: 'https://api.syncpayments.com.br',
    webhookPath: '/api/public/webhook-syncpay',
    webhookOrigin: 'https://servicosdigitalpack.lovable.app',
    publicLabel: 'Client ID',
    secretLabel: 'Client Secret',
    publicPlaceholder: 'client_id',
    secretPlaceholder: 'client_secret',
  },
  mercadopago: {
    label: 'Mercado Pago',
    docsUrl: 'https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/overview',
    defaultBase: 'https://api.mercadopago.com',
    webhookPath: '/api/webhooks/mercadopago',
    webhookOrigin: 'https://servicosdigitalpack.lovable.app',
    publicLabel: 'Public Key',
    secretLabel: 'Access Token',
    publicPlaceholder: 'APP_USR-... (ou TEST-...)',
    secretPlaceholder: 'APP_USR-... (ou TEST-...)',
    hasWebhookSecret: true,
    hasEnvironment: true,
  },
};

function webhookUrlFor(pid: ProviderId, origin: string): string {
  const p = PROVIDERS[pid];
  return `${p.webhookOrigin ?? origin}${p.webhookPath}`;
}


function PaymentGatewaysPage() {
  const qc = useQueryClient();
  const { data: gateways, isLoading } = useQuery({
    queryKey: ['payment-gateways'],
    queryFn: () => listPaymentGateways(),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentGateway | null>(null);
  const [form, setForm] = useState({
    name: '',
    provider_type: 'syncpay' as ProviderId,
    environment: 'test' as Environment,
    public_key: '',
    secret_key: '',
    webhook_secret: '',
    base_url: '',
    notes: '',
  });

  const meta = PROVIDERS[form.provider_type];

  const openNew = (provider: ProviderId = 'syncpay') => {
    setEditing(null);
    setForm({
      name: '',
      provider_type: provider,
      // Mercado Pago começa sempre em ambiente de teste.
      environment: 'test',
      public_key: '',
      secret_key: '',
      webhook_secret: '',
      base_url: '',
      notes: '',
    });
    setDialogOpen(true);
  };


  const openEdit = (g: PaymentGateway) => {
    setEditing(g);
    setForm({
      name: g.name,
      provider_type: (g.provider_type as ProviderId) ?? 'sigilopay',
      environment: (g.environment as Environment) ?? 'test',
      public_key: '',
      secret_key: '',
      webhook_secret: '',
      base_url: g.base_url ?? '',
      notes: g.notes ?? '',
    });
    setDialogOpen(true);
  };

  const upsertMut = useMutation({
    mutationFn: async (opts?: { test?: boolean }) => {
      const res = await upsertPaymentGateway({
        data: {
          id: editing?.id,
          name: form.name.trim(),
          provider_type: form.provider_type,
          environment: form.environment,
          public_key: form.public_key.trim() || undefined,
          secret_key: form.secret_key.trim() || undefined,
          webhook_secret: form.webhook_secret.trim() || undefined,
          base_url: form.base_url.trim(),
          notes: form.notes.trim() || undefined,
        },
      });
      if (opts?.test && res?.id) {
        return await testPaymentGatewayConnection({ data: { id: res.id } });
      }
      return null;
    },
    onSuccess: (result) => {
      toast.success(editing ? 'Gateway atualizado' : 'Gateway cadastrado');
      if (result) {
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ['payment-gateways'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => activatePaymentGateway({ data: { id } }),
    onSuccess: () => {
      toast.success('Gateway ativado');
      qc.invalidateQueries({ queryKey: ['payment-gateways'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao ativar'),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivatePaymentGateway({ data: { id } }),
    onSuccess: () => {
      toast.success('Gateway desativado');
      qc.invalidateQueries({ queryKey: ['payment-gateways'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao desativar'),
  });


  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePaymentGateway({ data: { id } }),
    onSuccess: () => {
      toast.success('Gateway removido');
      qc.invalidateQueries({ queryKey: ['payment-gateways'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Configurações de Pagamento</h1>
          <p className="text-sm text-slate-500">
            Cadastre suas contas Mercado Pago, SyncPay ou SigiloPay e escolha qual será usada para gerar as cobranças.
          </p>

        </div>
        <Button onClick={() => openNew('syncpay')} className="bg-brand-blue hover:bg-brand-navy">
          <Plus className="mr-2 h-4 w-4" /> Novo gateway
        </Button>

      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(PROVIDERS) as ProviderId[]).map((pid) => {
          const p = PROVIDERS[pid];
          const count = (gateways ?? []).filter((g) => g.provider_type === pid).length;
          return (
            <Card key={pid} className="border-slate-200">
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  {p.label}
                  <Badge variant={count > 0 ? 'secondary' : 'outline'}>
                    {count > 0 ? `${count} conta(s)` : 'nenhuma conta'}
                  </Badge>
                </CardTitle>
                <CardDescription className="break-all text-xs">
                  Webhook: {webhookUrlFor(pid, origin)}
                </CardDescription>

              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" onClick={() => openNew(pid)}>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar conta {p.label}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (

        <div className="grid gap-4">
          {(gateways ?? []).map((g) => {
            const gm = PROVIDERS[(g.provider_type as ProviderId) ?? 'sigilopay'] ?? PROVIDERS.sigilopay;
            return (
            <Card key={g.id} className={g.is_active ? 'border-emerald-400 shadow-sm' : ''}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {g.name}
                    {g.is_active && (
                      <Badge className="bg-emerald-500 hover:bg-emerald-500">
                        <Check className="mr-1 h-3 w-3" /> Ativo
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {gm.label}
                    <a
                      href={gm.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 text-brand-blue underline"
                    >
                      docs <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardDescription>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  {g.is_active ? (
                    <Button size="sm" variant="outline" onClick={() => deactivateMut.mutate(g.id)}>
                      Desativar
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => activateMut.mutate(g.id)}>
                      Ativar
                    </Button>
                  )}

                  <Button size="sm" variant="outline" onClick={() => openEdit(g)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      if (confirm('Remover este gateway?')) deleteMut.mutate(g.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-600">
                <div><span className="font-medium text-slate-700">{gm.publicLabel}:</span> <code>{g.public_key_masked || '—'}</code></div>
                <div><span className="font-medium text-slate-700">{gm.secretLabel}:</span> <code>{g.secret_key_masked || '—'}</code></div>
                {gm.hasEnvironment && (
                  <div>
                    <span className="font-medium text-slate-700">Ambiente:</span>{' '}
                    <Badge variant={g.environment === 'production' ? 'default' : 'outline'}>
                      {g.environment === 'production' ? 'Produção' : 'Teste'}
                    </Badge>
                  </div>
                )}
                {gm.hasWebhookSecret && (
                  <div>
                    <span className="font-medium text-slate-700">Chave do webhook:</span>{' '}
                    {g.has_webhook_secret ? 'configurada' : 'não configurada'}
                  </div>
                )}
                <div><span className="font-medium text-slate-700">Base URL:</span> {g.base_url || gm.defaultBase}</div>
                <div>
                  <span className="font-medium text-slate-700">Webhook (colar no painel {gm.label}):</span>{' '}
                  <code className="break-all">
                    {webhookUrlFor((g.provider_type as ProviderId) ?? 'sigilopay', origin)}
                  </code>
                </div>
                {g.notes && <div className="text-slate-500">{g.notes}</div>}

              </CardContent>
            </Card>
          );})}
          {(gateways ?? []).length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
              Nenhum gateway cadastrado.
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar gateway' : `Novo gateway ${meta.label}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome de exibição</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={`Ex: ${meta.label} Principal`}
              />
            </div>
            <div className="space-y-2">
              <Label>Provedor</Label>
              <Select
                value={form.provider_type}
                onValueChange={(v) => setForm({ ...form, provider_type: v as ProviderId })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  <SelectItem value="syncpay">SyncPay</SelectItem>
                  <SelectItem value="sigilopay">SigiloPay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {meta.hasEnvironment && (
              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Select
                  value={form.environment}
                  onValueChange={(v) => setForm({ ...form, environment: v as Environment })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">Teste</SelectItem>
                    <SelectItem value="production">Produção</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  Use credenciais de teste (TEST-...) enquanto estiver homologando.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>
                {meta.publicLabel}{' '}
                {editing && <span className="text-xs text-slate-500">(deixe em branco para manter)</span>}
              </Label>
              <Input
                type="password"
                value={form.public_key}
                onChange={(e) => setForm({ ...form, public_key: e.target.value })}
                placeholder={meta.publicPlaceholder}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>
                {meta.secretLabel}{' '}
                {editing && <span className="text-xs text-slate-500">(deixe em branco para manter)</span>}
              </Label>
              <Input
                type="password"
                value={form.secret_key}
                onChange={(e) => setForm({ ...form, secret_key: e.target.value })}
                placeholder={meta.secretPlaceholder}
                autoComplete="off"
              />
            </div>
            {meta.hasWebhookSecret && (
              <div className="space-y-2">
                <Label>
                  Chave secreta do Webhook{' '}
                  {editing && <span className="text-xs text-slate-500">(deixe em branco para manter)</span>}
                </Label>
                <Input
                  type="password"
                  value={form.webhook_secret}
                  onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
                  placeholder="Assinatura secreta gerada no painel do provedor"
                  autoComplete="off"
                />
                <p className="break-all text-xs text-slate-500">
                  URL do webhook: {webhookUrlFor(form.provider_type, origin)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Base URL <span className="text-xs text-slate-500">(opcional)</span></Label>
              <Input
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder={meta.defaultBase}
              />
            </div>
            <div className="space-y-2">
              <Label>Anotações</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Ex: conta principal / de teste"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="secondary"
              disabled={
                upsertMut.isPending ||
                !form.name ||
                (!editing && (!form.public_key || !form.secret_key))
              }
              onClick={() => upsertMut.mutate({ test: true })}
            >
              {upsertMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar e testar conexão
            </Button>
            <Button
              className="bg-brand-blue hover:bg-brand-navy"
              disabled={
                upsertMut.isPending ||
                !form.name ||
                (!editing && (!form.public_key || !form.secret_key))
              }
              onClick={() => upsertMut.mutate({})}
            >
              {upsertMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </div>
  );
}
