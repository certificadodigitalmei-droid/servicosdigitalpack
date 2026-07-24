import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Check, Trash2, Pencil, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  listSmtpServers,
  upsertSmtpServer,
  activateSmtpServer,
  deleteSmtpServer,
  type SmtpServer,
} from '@/lib/smtp/servers.functions';

export const Route = createFileRoute('/_authenticated/painel/smtp')({
  head: () => ({ meta: [{ title: 'Servidores SMTP | Central MEI' }] }),
  component: SmtpPage,
});

type FormState = {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  encryption: 'none' | 'tls' | 'ssl';
  hourly_limit: number;
  daily_limit: number;
  monthly_limit: number;
  notes: string;
};

const EMPTY: FormState = {
  name: '',
  host: '',
  port: 587,
  username: '',
  password: '',
  from_email: '',
  from_name: '',
  encryption: 'tls',
  hourly_limit: 100,
  daily_limit: 1000,
  monthly_limit: 30000,
  notes: '',
};

function SmtpPage() {
  const qc = useQueryClient();
  const { data: servers, isLoading } = useQuery({
    queryKey: ['smtp-servers'],
    queryFn: () => listSmtpServers(),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SmtpServer | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };
  const openEdit = (s: SmtpServer) => {
    setEditing(s);
    setForm({
      name: s.name,
      host: s.host,
      port: s.port,
      username: s.username,
      password: '',
      from_email: s.from_email,
      from_name: s.from_name ?? '',
      encryption: (s.encryption as 'none' | 'tls' | 'ssl') ?? 'tls',
      hourly_limit: s.hourly_limit,
      daily_limit: s.daily_limit,
      monthly_limit: s.monthly_limit,
      notes: s.notes ?? '',
    });
    setDialogOpen(true);
  };

  const upsertMut = useMutation({
    mutationFn: async () => {
      await upsertSmtpServer({
        data: {
          id: editing?.id,
          name: form.name.trim(),
          host: form.host.trim(),
          port: Number(form.port),
          username: form.username.trim(),
          password: form.password ? form.password : undefined,
          from_email: form.from_email.trim(),
          from_name: form.from_name.trim(),
          encryption: form.encryption,
          hourly_limit: Number(form.hourly_limit),
          daily_limit: Number(form.daily_limit),
          monthly_limit: Number(form.monthly_limit),
          notes: form.notes,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? 'Servidor atualizado' : 'Servidor cadastrado');
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ['smtp-servers'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar'),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => activateSmtpServer({ data: { id } }),
    onSuccess: () => {
      toast.success('Servidor ativado');
      qc.invalidateQueries({ queryKey: ['smtp-servers'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao ativar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSmtpServer({ data: { id } }),
    onSuccess: () => {
      toast.success('Servidor removido');
      qc.invalidateQueries({ queryKey: ['smtp-servers'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao remover'),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Server className="h-6 w-6" /> Servidores SMTP
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cadastre servidores SMTP (Brevo, SendGrid, Mailgun, Amazon SES, etc.) e defina os limites de
            envio de cada um. Apenas um servidor pode ficar ativo por vez.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Novo servidor
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !servers || servers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum servidor SMTP cadastrado. Clique em <strong>Novo servidor</strong> para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {servers.map((s) => (
            <Card key={s.id} className={s.is_active ? 'border-emerald-500/60 ring-1 ring-emerald-500/30' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <CardDescription>
                      {s.host}:{s.port} · {s.encryption.toUpperCase()}
                    </CardDescription>
                  </div>
                  {s.is_active ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div><span className="font-medium text-foreground">Usuário:</span> {s.username}</div>
                  <div><span className="font-medium text-foreground">Senha:</span> {s.password_masked || '—'}</div>
                  <div className="col-span-2"><span className="font-medium text-foreground">Remetente:</span> {s.from_name ? `${s.from_name} <${s.from_email}>` : s.from_email}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/40 p-2 text-center text-xs">
                  <div>
                    <div className="text-muted-foreground">Por hora</div>
                    <div className="font-semibold">{s.hourly_limit.toLocaleString('pt-BR')}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Por dia</div>
                    <div className="font-semibold">{s.daily_limit.toLocaleString('pt-BR')}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Por mês</div>
                    <div className="font-semibold">{s.monthly_limit.toLocaleString('pt-BR')}</div>
                  </div>
                </div>
                {s.notes ? <p className="text-xs text-muted-foreground">{s.notes}</p> : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  {!s.is_active && (
                    <Button size="sm" variant="default" onClick={() => activateMut.mutate(s.id)} disabled={activateMut.isPending}>
                      <Check className="mr-1 h-4 w-4" /> Ativar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                    <Pencil className="mr-1 h-4 w-4" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => {
                      if (confirm(`Remover o servidor "${s.name}"?`)) deleteMut.mutate(s.id);
                    }}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Remover
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar servidor SMTP' : 'Novo servidor SMTP'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome interno</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Brevo principal" />
            </div>
            <div>
              <Label>Host</Label>
              <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp-relay.brevo.com" />
            </div>
            <div>
              <Label>Porta</Label>
              <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Usuário</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
            </div>
            <div>
              <Label>Senha {editing ? <span className="text-xs text-muted-foreground">(deixe em branco para manter)</span> : null}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            </div>
            <div>
              <Label>E-mail do remetente</Label>
              <Input type="email" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} placeholder="contato@seudominio.com" />
            </div>
            <div>
              <Label>Nome do remetente</Label>
              <Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} placeholder="Central MEI" />
            </div>
            <div>
              <Label>Criptografia</Label>
              <Select value={form.encryption} onValueChange={(v) => setForm({ ...form, encryption: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">STARTTLS (587)</SelectItem>
                  <SelectItem value="ssl">SSL/TLS (465)</SelectItem>
                  <SelectItem value="none">Nenhuma</SelectItem>
                </SelectContent>
              </Select>
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
              disabled={
                upsertMut.isPending ||
                !form.name.trim() ||
                !form.host.trim() ||
                !form.username.trim() ||
                !form.from_email.trim() ||
                (!editing && !form.password)
              }
            >
              {upsertMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
