import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Pencil, Zap, CheckCircle2, XCircle, Send, Power, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  listEmailWorkers,
  upsertEmailWorker,
  deleteEmailWorker,
  toggleEmailWorker,
  testEmailWorker,
  getEmailWorkersSummary,
  type EmailWorker,
} from '@/lib/email-workers/workers.functions';

export const Route = createFileRoute('/_authenticated/painel/smtp')({
  head: () => ({ meta: [{ title: 'Workers Lovable Email | Central MEI' }] }),
  component: WorkersPage,
});

type FormState = {
  name: string;
  worker_url: string;
  worker_api_key: string;
  from_email: string;
  from_name: string;
  priority: number;
  hourly_limit: number;
  daily_limit: number;
  monthly_limit: number;
  notes: string;
};

const EMPTY: FormState = {
  name: '',
  worker_url: '',
  worker_api_key: '',
  from_email: '',
  from_name: '',
  priority: 100,
  hourly_limit: 100,
  daily_limit: 2000,
  monthly_limit: 50000,
  notes: '',
};

const WORKER_SNIPPET = `// Cole este arquivo em CADA projeto Lovable "worker" que você criar:
// src/routes/api/public/worker-send.ts
import { createFileRoute } from '@tanstack/react-router';
import { sendLovableEmail, EmailAPIError } from '@lovable.dev/email-js';

const WORKER_SECRET = process.env.WORKER_SHARED_SECRET!; // defina em Secrets

export const Route = createFileRoute('/api/public/worker-send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get('authorization') || '';
        const token = auth.replace(/^Bearer\\s+/i, '').trim();
        if (!token || token !== WORKER_SECRET) {
          return new Response('unauthorized', { status: 401 });
        }
        const body = await request.json().catch(() => ({}));
        if (body.mode === 'ping') return Response.json({ ok: true });
        try {
          await sendLovableEmail({
            to: body.to,
            from: body.from,
            sender_domain: body.sender_domain,
            subject: body.subject,
            html: body.html,
            text: body.text,
            purpose: body.purpose ?? 'transactional',
            label: body.label ?? 'worker',
            idempotency_key: body.idempotency_key,
            reply_to: body.reply_to,
          }, { apiKey: process.env.LOVABLE_API_KEY! });
          return Response.json({ ok: true });
        } catch (e) {
          if (e instanceof EmailAPIError) {
            const status = e.status === 429 ? 429 : 502;
            return Response.json(
              { ok: false, code: e.code, message: e.message, retry_after: (e as any).retryAfterSeconds ?? 60 },
              { status }
            );
          }
          return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
`;

function WorkersPage() {
  const qc = useQueryClient();
  const { data: workers, isLoading } = useQuery({
    queryKey: ['email-workers'],
    queryFn: () => listEmailWorkers(),
  });
  const { data: summary } = useQuery({
    queryKey: ['email-workers-summary'],
    queryFn: () => getEmailWorkersSummary(),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [editing, setEditing] = useState<EmailWorker | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [testEmail, setTestEmail] = useState('');

  const openNew = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (w: EmailWorker) => {
    setEditing(w);
    setForm({
      name: w.name,
      worker_url: w.worker_url,
      worker_api_key: '',
      from_email: w.from_email ?? '',
      from_name: w.from_name ?? '',
      priority: w.priority,
      hourly_limit: w.hourly_limit,
      daily_limit: w.daily_limit,
      monthly_limit: w.monthly_limit,
      notes: w.notes ?? '',
    });
    setDialogOpen(true);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['email-workers'] });
    qc.invalidateQueries({ queryKey: ['email-workers-summary'] });
  };

  const upsertMut = useMutation({
    mutationFn: async () => {
      await upsertEmailWorker({
        data: {
          id: editing?.id,
          name: form.name.trim(),
          worker_url: form.worker_url.trim(),
          worker_api_key: form.worker_api_key.trim() || (editing?.worker_api_key ?? ''),
          from_email: form.from_email.trim() || null,
          from_name: form.from_name.trim() || null,
          priority: Number(form.priority),
          hourly_limit: Number(form.hourly_limit),
          daily_limit: Number(form.daily_limit),
          monthly_limit: Number(form.monthly_limit),
          notes: form.notes,
        },
      });
    },
    onSuccess: () => { toast.success(editing ? 'Worker atualizado' : 'Worker cadastrado'); setDialogOpen(false); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar'),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggleEmailWorker({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao atualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEmailWorker({ data: { id } }),
    onSuccess: () => { toast.success('Worker removido'); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao remover'),
  });

  const testMut = useMutation({
    mutationFn: (v: { id: string; recipient?: string }) =>
      testEmailWorker({ data: { id: v.id, recipient: v.recipient ?? null } }),
    onSuccess: (r) => { r.ok ? toast.success(r.message) : toast.error(r.message); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? 'Erro no teste'),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Zap className="h-6 w-6" /> Workers Lovable Email
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Conecte outras contas Lovable para atuarem como <strong>workers de envio</strong>. Cada worker
            testado com sucesso soma seu limite ao total deste projeto — sem trocar o site nem o painel.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSnippetOpen(true)}>Ver código do worker</Button>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo worker</Button>
        </div>
      </div>

      {summary && (
        <div className="grid gap-3 md:grid-cols-4">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Workers ativos</div><div className="text-2xl font-bold">{summary.active} / {summary.total}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Limite por hora</div><div className="text-2xl font-bold">{summary.hourly.toLocaleString('pt-BR')}</div><div className="text-[10px] text-muted-foreground">Inclui 100/h desta conta</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Limite por dia</div><div className="text-2xl font-bold">{summary.daily.toLocaleString('pt-BR')}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Limite por mês</div><div className="text-2xl font-bold">{summary.monthly.toLocaleString('pt-BR')}</div></CardContent></Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !workers || workers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum worker cadastrado. Crie um projeto Lovable com o código do worker, gere um segredo
            compartilhado e cadastre a URL aqui.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workers.map((w: EmailWorker) => (
            <Card key={w.id} className={w.is_active ? 'border-emerald-500/60 ring-1 ring-emerald-500/30' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{w.name}</CardTitle>
                    <CardDescription className="truncate">{w.worker_url}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {w.is_active ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                    <Switch checked={w.is_active} onCheckedChange={(v) => toggleMut.mutate({ id: w.id, is_active: v })} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/40 p-2 text-center text-xs">
                  <div><div className="text-muted-foreground">Por hora</div><div className="font-semibold">{w.hourly_limit.toLocaleString('pt-BR')}</div></div>
                  <div><div className="text-muted-foreground">Por dia</div><div className="font-semibold">{w.daily_limit.toLocaleString('pt-BR')}</div></div>
                  <div><div className="text-muted-foreground">Por mês</div><div className="font-semibold">{w.monthly_limit.toLocaleString('pt-BR')}</div></div>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  {w.last_test_at ? (
                    <div className="flex items-center gap-1">
                      {w.last_test_ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-red-600" />}
                      Último teste: {new Date(w.last_test_at).toLocaleString('pt-BR')} — {w.last_test_message?.slice(0, 80)}
                    </div>
                  ) : <div>Ainda não testado.</div>}
                  {w.last_success_at ? <div>Último envio bem-sucedido: {new Date(w.last_success_at).toLocaleString('pt-BR')}</div> : null}
                  {w.last_error ? <div className="text-red-600">Último erro: {w.last_error.slice(0, 120)}</div> : null}
                </div>
                {w.notes ? <p className="text-xs text-muted-foreground">{w.notes}</p> : null}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Input placeholder="e-mail para teste (opcional)" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="h-8 max-w-[220px]" />
                  <Button size="sm" variant="secondary" onClick={() => testMut.mutate({ id: w.id, recipient: testEmail || undefined })} disabled={testMut.isPending}>
                    <Send className="mr-1 h-4 w-4" /> Testar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(w)}><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
                  <Button
                    size="sm" variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => { if (confirm(`Remover o worker "${w.name}"?`)) deleteMut.mutate(w.id); }}
                    disabled={deleteMut.isPending}
                  ><Trash2 className="mr-1 h-4 w-4" /> Remover</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Editar worker' : 'Novo worker'}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome interno</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Conta Lovable #2" />
            </div>
            <div className="md:col-span-2">
              <Label>URL do worker</Label>
              <Input value={form.worker_url} onChange={(e) => setForm({ ...form, worker_url: e.target.value })} placeholder="https://seu-worker.lovable.app/api/public/worker-send" />
            </div>
            <div className="md:col-span-2">
              <Label>Chave compartilhada (Bearer) {editing ? <span className="text-xs text-muted-foreground">(deixe em branco para manter)</span> : null}</Label>
              <Input type="password" value={form.worker_api_key} onChange={(e) => setForm({ ...form, worker_api_key: e.target.value })} autoComplete="new-password" placeholder="A mesma que você salvou como WORKER_SHARED_SECRET no worker" />
            </div>
            <div>
              <Label>E-mail do remetente (opcional)</Label>
              <Input value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} placeholder="usa o padrão do projeto se vazio" />
            </div>
            <div>
              <Label>Nome do remetente (opcional)</Label>
              <Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Limite por hora</Label>
              <Input type="number" min={0} value={form.hourly_limit} onChange={(e) => setForm({ ...form, hourly_limit: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Limite por dia</Label>
              <Input type="number" min={0} value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Limite por mês</Label>
              <Input type="number" min={0} value={form.monthly_limit} onChange={(e) => setForm({ ...form, monthly_limit: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => upsertMut.mutate()}
              disabled={upsertMut.isPending || !form.name.trim() || !form.worker_url.trim() || (!editing && !form.worker_api_key.trim())}
            >
              {upsertMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={snippetOpen} onOpenChange={setSnippetOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Código do worker (cole em cada conta Lovable)</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Crie um novo projeto Lovable com Lovable Email ativado no domínio desejado.</li>
              <li>Em <strong>Secrets</strong>, adicione <code>WORKER_SHARED_SECRET</code> com um valor forte (ex.: <code>openssl rand -hex 32</code>).</li>
              <li>Cole o arquivo abaixo em <code>src/routes/api/public/worker-send.ts</code> e publique.</li>
              <li>Volte aqui, cadastre a URL <code>https://SEU-WORKER.lovable.app/api/public/worker-send</code> e o mesmo segredo.</li>
              <li>Clique em <strong>Testar</strong> — se o teste passar, ative o worker.</li>
            </ol>
            <div className="relative">
              <pre className="max-h-[380px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs">{WORKER_SNIPPET}</pre>
              <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => { navigator.clipboard.writeText(WORKER_SNIPPET); toast.success('Código copiado'); }}>
                <Copy className="mr-1 h-4 w-4" /> Copiar
              </Button>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setSnippetOpen(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
