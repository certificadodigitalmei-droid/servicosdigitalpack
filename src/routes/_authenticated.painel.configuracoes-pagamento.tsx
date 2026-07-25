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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  listPaymentGateways,
  upsertPaymentGateway,
  activatePaymentGateway,
  deletePaymentGateway,
  type PaymentGateway,
} from '@/lib/payments/gateways.functions';

export const Route = createFileRoute('/_authenticated/painel/configuracoes-pagamento')({
  head: () => ({ meta: [{ title: 'Configurações de Pagamento | Central MEI' }] }),
  component: PaymentGatewaysPage,
});

const PROVIDER_META: Record<string, { label: string; docsUrl?: string; defaultBase: string; webhookPath: string }> = {
  uniaopay: {
    label: 'UniãoPay',
    defaultBase: 'https://uniao7pay.shop/api/v1',
    webhookPath: '/api/public/webhook-uniaopay',
  },
};


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
    provider_type: 'nexuspay' as 'uniaopay' | 'nexuspay',
    api_key: '',
    base_url: '',
    notes: '',
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', provider_type: 'nexuspay', api_key: '', base_url: '', notes: '' });
    setDialogOpen(true);
  };
  const openEdit = (g: PaymentGateway) => {
    setEditing(g);
    setForm({
      name: g.name,
      provider_type: g.provider_type,
      api_key: '',
      base_url: g.base_url ?? '',
      notes: g.notes ?? '',
    });
    setDialogOpen(true);
  };

  const upsertMut = useMutation({
    mutationFn: async () => {
      await upsertPaymentGateway({
        data: {
          id: editing?.id,
          name: form.name.trim(),
          provider_type: form.provider_type,
          api_key: form.api_key.trim() || undefined,
          base_url: form.base_url.trim(),
          notes: form.notes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? 'Gateway atualizado' : 'Gateway cadastrado');
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
            Cadastre múltiplos provedores de PIX e escolha qual será usado para gerar as cobranças.
          </p>
        </div>
        <Button onClick={openNew} className="bg-brand-blue hover:bg-brand-navy">
          <Plus className="mr-2 h-4 w-4" /> Novo gateway
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid gap-4">
          {(gateways ?? []).map((g) => {
            const meta = PROVIDER_META[g.provider_type];
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
                      {meta?.label ?? g.provider_type}
                      {meta?.docsUrl && (
                        <a
                          href={meta.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-brand-blue underline"
                        >
                          docs <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    {!g.is_active && (
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
                  <div><span className="font-medium text-slate-700">Chave:</span> <code>{g.api_key_masked}</code></div>
                  <div><span className="font-medium text-slate-700">Base URL:</span> {g.base_url || meta?.defaultBase}</div>
                  {meta && origin && (
                    <div>
                      <span className="font-medium text-slate-700">Webhook (colar no painel do provedor):</span>{' '}
                      <code className="break-all">{origin}{meta.webhookPath}</code>
                    </div>
                  )}
                  {g.notes && <div className="text-slate-500">{g.notes}</div>}
                </CardContent>
              </Card>
            );
          })}
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
            <DialogTitle>{editing ? 'Editar gateway' : 'Novo gateway'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome de exibição</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: NexusPay Principal"
              />
            </div>
            <div className="space-y-2">
              <Label>Provedor</Label>
              <Select
                value={form.provider_type}
                onValueChange={(v) => setForm({ ...form, provider_type: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nexuspay">NexusPay (zpay_...)</SelectItem>
                  <SelectItem value="uniaopay">UniãoPay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Chave da API {editing && <span className="text-xs text-slate-500">(deixe em branco para manter)</span>}</Label>
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder={form.provider_type === 'nexuspay' ? 'zpay_...' : 'sua_chave_uniaopay'}
              />
            </div>
            <div className="space-y-2">
              <Label>Base URL <span className="text-xs text-slate-500">(opcional)</span></Label>
              <Input
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder={PROVIDER_META[form.provider_type].defaultBase}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              className="bg-brand-blue hover:bg-brand-navy"
              disabled={upsertMut.isPending || !form.name || (!editing && !form.api_key)}
              onClick={() => upsertMut.mutate()}
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
