import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Copy, RefreshCw, Server } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const Route = createFileRoute('/_authenticated/painel/satelites')({
  head: () => ({ meta: [{ title: 'Satélites | Central MEI' }] }),
  component: SatelitesPage,
});

type Job = {
  id: string;
  satellite_id: string;
  company_id: string;
  cnpj: string | null;
  email: string;
  public_url: string | null;
  status: 'claimed' | 'sent' | 'error';
  error_message: string | null;
  claimed_at: string;
  confirmed_at: string | null;
};

const CLAIM_URL = 'https://certificadodigitalccmei.online/api/public/claim-batch';
const CONFIRM_URL = 'https://certificadodigitalccmei.online/api/public/confirm-send';

function SatelitesPage() {
  const [showCode, setShowCode] = useState(false);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['satellite-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('satellite_jobs')
        .select('id, satellite_id, company_id, cnpj, email, public_url, status, error_message, claimed_at, confirmed_at')
        .order('claimed_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Job[];
    },
    refetchInterval: 15000,
  });

  const jobs = data ?? [];
  const stats = useMemo(() => {
    const bySat = new Map<string, { claimed: number; sent: number; error: number }>();
    for (const j of jobs) {
      const s = bySat.get(j.satellite_id) ?? { claimed: 0, sent: 0, error: 0 };
      s[j.status] = (s[j.status] ?? 0) + 1;
      bySat.set(j.satellite_id, s);
    }
    return Array.from(bySat.entries()).map(([id, s]) => ({ id, ...s }));
  }, [jobs]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="w-6 h-6" /> Satélites
          </h1>
          <p className="text-sm text-muted-foreground">
            Projetos externos que puxam empresas deste mestre para enviar. Cada empresa é entregue a apenas um satélite e nunca é reenviada.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Endpoints para o satélite</CardTitle>
          <CardDescription>
            Cole essas URLs no projeto satélite e autentique com o header <code>x-worker-secret: WORKER_SHARED_SECRET</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <EndpointRow label="Reservar lote (POST)" url={CLAIM_URL} onCopy={copy} />
          <EndpointRow label="Confirmar envio (POST)" url={CONFIRM_URL} onCopy={copy} />
          <Button variant="ghost" size="sm" onClick={() => setShowCode((v) => !v)}>
            {showCode ? 'Ocultar' : 'Ver'} exemplo de código para o satélite
          </Button>
          {showCode && (
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
{`// No projeto satélite (worker de envio):
const SECRET = process.env.WORKER_SHARED_SECRET!;

async function claim(batch = 50) {
  const r = await fetch('${CLAIM_URL}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-secret': SECRET },
    body: JSON.stringify({ satellite_id: 'satelite-1', batch_size: batch }),
  });
  return (await r.json()).jobs as Array<{
    job_id: string; cnpj: string; email: string;
    company_name: string; public_url: string;
  }>;
}

async function confirm(job_id: string, ok: boolean, err?: string) {
  await fetch('${CONFIRM_URL}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-secret': SECRET },
    body: JSON.stringify({
      job_id,
      status: ok ? 'sent' : 'error',
      error_message: err,
    }),
  });
}`}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo por satélite</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum satélite ativo ainda.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {stats.map((s) => (
                <div key={s.id} className="border rounded-lg p-3">
                  <div className="font-semibold truncate">{s.id}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-2 flex-wrap">
                    <Badge variant="secondary">Enviados: {s.sent}</Badge>
                    <Badge variant="outline">Reservados: {s.claimed}</Badge>
                    {s.error > 0 && <Badge variant="destructive">Erros: {s.error}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimos jobs</CardTitle>
          <CardDescription>200 mais recentes</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Satélite</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reservado</TableHead>
                <TableHead>Confirmado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem jobs ainda.</TableCell></TableRow>
              )}
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="text-xs">{j.satellite_id}</TableCell>
                  <TableCell className="text-xs">{j.cnpj}</TableCell>
                  <TableCell className="text-xs truncate max-w-[220px]">{j.email}</TableCell>
                  <TableCell>
                    <Badge variant={j.status === 'sent' ? 'default' : j.status === 'error' ? 'destructive' : 'outline'}>
                      {j.status}
                    </Badge>
                    {j.error_message && (
                      <div className="text-[10px] text-destructive mt-1 truncate max-w-[220px]">{j.error_message}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(j.claimed_at).toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="text-xs">{j.confirmed_at ? new Date(j.confirmed_at).toLocaleString('pt-BR') : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function EndpointRow({ label, url, onCopy }: { label: string; url: string; onCopy: (t: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-mono truncate">{url}</div>
      </div>
      <Button size="sm" variant="outline" onClick={() => onCopy(url)}>
        <Copy className="w-4 h-4" />
      </Button>
    </div>
  );
}
