import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Mail, Send, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getEmailSenderSettings,
  saveEmailSenderSettings,
  type EmailSenderSettings,
} from '@/lib/email-sender.functions';

export const Route = createFileRoute('/_authenticated/painel/remetente-email')({
  head: () => ({ meta: [{ title: 'Remetente de E-mail | Central MEI' }] }),
  component: EmailSenderPage,
});

function EmailSenderPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['email-sender-settings'],
    queryFn: () => getEmailSenderSettings(),
  });

  const [form, setForm] = useState<EmailSenderSettings>({
    from_email: '',
    from_name: '',
    reply_to: '',
  });

  useEffect(() => {
    if (data) {
      setForm({
        from_email: data.from_email,
        from_name: data.from_name,
        reply_to: data.reply_to || '',
      });
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () => saveEmailSenderSettings({ data: form }),
    onSuccess: () => {
      toast.success('Remetente salvo');
      qc.invalidateQueries({ queryKey: ['email-sender-settings'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });

  const previewFrom = `${form.from_name || 'Nome'} <${form.from_email || 'email@dominio.com'}>`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Remetente de E-mail</h1>
        <p className="text-sm text-slate-500">
          Configure o nome e o endereço de e-mail que aparecerão nos envios oficiais do sistema.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4 text-brand-blue" />
                Identidade do remetente
              </CardTitle>
              <CardDescription>
                Esse e-mail será usado como padrão em todos os envios: PIX gerado, lembretes,
                confirmação de pagamento, campanhas e envio em massa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="from_name">Nome do remetente</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="from_name"
                    className="pl-9"
                    value={form.from_name}
                    onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                    placeholder="Ex: Central MEI Digital"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="from_email">E-mail remetente</Label>
                <Input
                  id="from_email"
                  type="email"
                  value={form.from_email}
                  onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                  placeholder="Ex: contato@seudominio.com"
                />
                <p className="text-xs text-slate-500">
                  O domínio deve estar verificado no Cloud → Emails. Domínio atual:{' '}
                  <span className="font-medium text-slate-700">notify.seu-certificado-mei-digital.online</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reply_to">Responder para (opcional)</Label>
                <div className="relative">
                  <Reply className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="reply_to"
                    type="email"
                    className="pl-9"
                    value={form.reply_to}
                    onChange={(e) => setForm({ ...form, reply_to: e.target.value })}
                    placeholder="Ex: suporte@seudominio.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed bg-slate-50/50">
            <CardHeader>
              <CardTitle className="text-sm text-slate-600">Pré-visualização</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
                <div className="text-xs uppercase tracking-wide text-slate-400">De</div>
                <div className="mt-1 font-medium text-slate-800">{previewFrom}</div>
                {form.reply_to && (
                  <>
                    <div className="mt-2 text-xs uppercase tracking-wide text-slate-400">Responder para</div>
                    <div className="mt-1 text-slate-700">{form.reply_to}</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              className="bg-brand-blue hover:bg-brand-navy"
              disabled={mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar remetente
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
