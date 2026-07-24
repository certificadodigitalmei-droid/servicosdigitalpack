import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, XCircle, Mail, Globe, ShieldCheck, Send } from 'lucide-react';
import {
  workspaceStatus,
  testWorkspaceConnection,
  sendWorkspaceTestEmail,
} from '@/lib/gmail/send.functions';

export const Route = createFileRoute('/_authenticated/painel/google-workspace')({
  head: () => ({
    meta: [
      { title: 'Google Workspace — Painel' },
      { name: 'description', content: 'Configuração e status da integração Gmail API (Google Workspace).' },
      { property: 'og:title', content: 'Google Workspace — Painel' },
      { property: 'og:description', content: 'Configuração da integração Gmail API.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: GoogleWorkspacePage,
});

function GoogleWorkspacePage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(workspaceStatus);
  const testConn = useServerFn(testWorkspaceConnection);
  const sendTest = useServerFn(sendWorkspaceTestEmail);

  const [testResult, setTestResult] = useState<any>(null);
  const [sendResult, setSendResult] = useState<any>(null);

  const status = useQuery({ queryKey: ['gws-status'], queryFn: () => statusFn() });

  const testMut = useMutation({
    mutationFn: async () => testConn(),
    onSuccess: (r: any) => {
      setTestResult(r);
      if (r.ok) toast.success(`Conectado como ${r.connectedAs}`);
      else toast.error(r.error || r.warning || 'Falha no teste de conexão');
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro'),
  });

  const sendMut = useMutation({
    mutationFn: async () => sendTest(),
    onSuccess: (r: any) => {
      setSendResult(r);
      if (r.sent) toast.success(`Enviado para ${r.to}`);
      else toast.error(r.error || 'Falha ao enviar');
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro'),
  });

  const s = status.data;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Google Workspace</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Envio de e-mails via Gmail API (HTTPS + OAuth2). Sem SMTP, sem senha.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Site
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm break-all">certificadodigitalccmei.online</p>
            <p className="text-xs text-muted-foreground mt-1">Domínio do site — não é alterado.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Remetente Google Workspace
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm break-all">
              {s?.sender ?? 'certificadomeidigital@seu-certificado-mei-digital.online'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Fixo no backend — não editável pelo frontend.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Status da configuração
          </CardTitle>
          <CardDescription>Segredos exigidos no backend.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status.isLoading ? (
            <p className="text-sm text-muted-foreground">Verificando…</p>
          ) : s?.configured ? (
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Todos os 4 segredos configurados
            </Badge>
          ) : (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Segredos faltando</AlertTitle>
              <AlertDescription>
                {s?.missing?.join(', ')}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => testMut.mutate()}
              disabled={!s?.configured || testMut.isPending}
              variant="outline"
            >
              {testMut.isPending ? 'Testando…' : 'Testar conexão (sem enviar e-mail)'}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={!s?.configured || sendMut.isPending}>
                  <Send className="h-4 w-4 mr-1" />
                  {sendMut.isPending ? 'Enviando…' : 'Enviar teste para o próprio remetente'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar envio de teste</AlertDialogTitle>
                  <AlertDialogDescription>
                    Um e-mail de teste será enviado <strong>somente</strong> para{' '}
                    <span className="font-mono">{s?.sender}</span>. Nenhum destinatário externo será contatado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => sendMut.mutate()}>Enviar teste</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ['gws-status'] })}>
              Recarregar status
            </Button>
          </div>

          {testResult && (
            <Alert variant={testResult.ok ? 'default' : 'destructive'} className="mt-4">
              <AlertTitle>{testResult.ok ? 'Conexão OK' : 'Falha na conexão'}</AlertTitle>
              <AlertDescription className="text-xs font-mono break-all">
                {testResult.ok
                  ? `Conta autenticada: ${testResult.connectedAs}`
                  : testResult.error || testResult.warning}
              </AlertDescription>
            </Alert>
          )}
          {sendResult && (
            <Alert variant={sendResult.sent ? 'default' : 'destructive'} className="mt-2">
              <AlertTitle>{sendResult.sent ? 'Teste enviado' : 'Falha no envio'}</AlertTitle>
              <AlertDescription className="text-xs font-mono break-all">
                {sendResult.sent
                  ? `Message-Id: ${sendResult.messageId}`
                  : sendResult.error}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Segurança</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Todas as chamadas exigem sessão autenticada com papel <strong>admin</strong>.</p>
          <p>• O remetente é fixo pelo segredo <code>GOOGLE_SENDER_EMAIL</code>. O frontend não pode alterá-lo.</p>
          <p>• Header injection (CR/LF em To/Subject) é rejeitado antes do envio.</p>
          <p>• A fila <code>email_send_queue</code> registra tentativas, backoff exponencial e status.</p>
          <p>• Nenhum token, corpo ou destinatário completo é gravado nos logs de erro.</p>
        </CardContent>
      </Card>
    </div>
  );
}
