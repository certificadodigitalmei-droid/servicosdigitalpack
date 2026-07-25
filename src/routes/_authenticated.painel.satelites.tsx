import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Copy, RefreshCw, Server, Send, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { enqueueSatelliteTest } from '@/lib/satellites.functions';

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
  status: 'claimed' | 'sent' | 'error' | 'pending_test';
  error_message: string | null;
  claimed_at: string;
  confirmed_at: string | null;
  is_test?: boolean;
};

const CLAIM_URL = 'https://certificadodigitalccmei.online/api/public/claim-batch';
const CONFIRM_URL = 'https://certificadodigitalccmei.online/api/public/confirm-send';

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function SatelitesPage() {
  const [showCode, setShowCode] = useState(false);
  const [testSatId, setTestSatId] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [enqueuing, setEnqueuing] = useState(false);
  const enqueue = useServerFn(enqueueSatelliteTest);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['satellite_jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('satellite_jobs')
        .select(
          'id, satellite_id, company_id, cnpj, email, public_url, status, error_message, claimed_at, confirmed_at, is_test',
        )
        .order('claimed_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Job[];
    },
    refetchInterval: 15000,
  });

  const jobs = data ?? [];

  const dashboard = useMemo(() => {
    const todayIso = startOfTodayISO();
    const weekIso = daysAgoISO(7);
    const totals = { sent: 0, claimed: 0, error: 0, pending_test: 0, today: 0, week: 0 };
    const bySat = new Map<
      string,
      {
        id: string;
        sent: number;
        claimed: number;
        error: number;
        pending_test: number;
        sent_today: number;
        sent_week: number;
        last_activity: string | null;
      }
    >();

    for (const j of jobs) {
      const s =
        bySat.get(j.satellite_id) ??
        {
          id: j.satellite_id,
          sent: 0,
          claimed: 0,
          error: 0,
          pending_test: 0,
          sent_today: 0,
          sent_week: 0,
          last_activity: null as string | null,
        };
      (s as any)[j.status] = ((s as any)[j.status] ?? 0) + 1;
      (totals as any)[j.status] = ((totals as any)[j.status] ?? 0) + 1;

      const ref = j.confirmed_at ?? j.claimed_at;
      if (!s.last_activity || ref > s.last_activity) s.last_activity = ref;

      if (j.status === 'sent' && j.confirmed_at) {
        if (j.confirmed_at >= todayIso) {
          s.sent_today += 1;
          totals.today += 1;
        }
        if (j.confirmed_at >= weekIso) {
          s.sent_week += 1;
          totals.week += 1;
        }
      }
      bySat.set(j.satellite_id, s);
    }
    const list = Array.from(bySat.values()).sort((a, b) => b.sent - a.sent);
    return { totals, list };
  }, [jobs]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado');
  };

  const handleTest = async () => {
    if (!testSatId.trim() || !testEmail.trim()) {
      toast.error('Preencha ID do satélite e e-mail');
      return;
    }
    setEnqueuing(true);
    try {
      await enqueue({ data: { satellite_id: testSatId.trim(), email: testEmail.trim() } });
      toast.success('Teste enfileirado! O satélite irá enviar no próximo ciclo.');
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enfileirar teste');
    } finally {
      setEnqueuing(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="w-6 h-6" /> Satélites
          </h1>
          <p className="text-sm text-muted-foreground">
            Projetos externos que puxam empresas deste mestre para enviar. Cada
            empresa vai para apenas um satélite e nunca é reenviada.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* Totais gerais */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Enviados hoje" value={dashboard.totals.today} />
        <MetricCard label="Enviados 7 dias" value={dashboard.totals.week} />
        <MetricCard label="Enviados (total)" value={dashboard.totals.sent} />
        <MetricCard label="Reservados" value={dashboard.totals.claimed} />
        <MetricCard label="Erros" value={dashboard.totals.error} tone="destructive" />
      </div>

      {/* Modo teste */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" /> Modo teste de antena
          </CardTitle>
          <CardDescription>
            Enfileira um envio de teste para uma antena específica. No próximo
            ciclo, essa antena receberá o job e enviará o e-mail para o endereço
            informado. Não conta como envio real (não bloqueia empresa nem entra
            no histórico).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">ID do satélite</Label>
            <Input
              placeholder="ex: satelite-conta2"
              value={testSatId}
              onChange={(e) => setTestSatId(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">E-mail de teste</Label>
            <Input
              placeholder="voce@email.com"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleTest} disabled={enqueuing} className="w-full">
              <Send className="w-4 h-4 mr-2" />
              {enqueuing ? 'Enfileirando...' : 'Enviar teste'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard por antena */}
      <Card>
        <CardHeader>
          <CardTitle>Dashboard por antena</CardTitle>
          <CardDescription>Envios de cada satélite conectado.</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma antena ativa ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Satélite</TableHead>
                    <TableHead className="text-right">Hoje</TableHead>
                    <TableHead className="text-right">7 dias</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Reservados</TableHead>
                    <TableHead className="text-right">Erros</TableHead>
                    <TableHead className="text-right">Testes</TableHead>
                    <TableHead>Última atividade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.list.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.id}</TableCell>
                      <TableCell className="text-right">{s.sent_today}</TableCell>
                      <TableCell className="text-right">{s.sent_week}</TableCell>
                      <TableCell className="text-right font-semibold">{s.sent}</TableCell>
                      <TableCell className="text-right">{s.claimed}</TableCell>
                      <TableCell className="text-right">
                        {s.error > 0 ? (
                          <span className="text-destructive font-semibold">{s.error}</span>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-right">{s.pending_test}</TableCell>
                      <TableCell className="text-xs">
                        {s.last_activity
                          ? new Date(s.last_activity).toLocaleString('pt-BR')
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle>Endpoints para o satélite</CardTitle>
          <CardDescription>
            Cole essas URLs no projeto satélite e autentique com o header{' '}
            <code>x-worker-secret: WORKER_SHARED_SECRET</code>.
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
    company_name: string; public_url: string; is_test?: boolean;
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

      {/* Últimos jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Últimos jobs</CardTitle>
          <CardDescription>500 mais recentes</CardDescription>
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
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Sem jobs ainda.
                  </TableCell>
                </TableRow>
              )}
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="text-xs">
                    {j.satellite_id}
                    {j.is_test && (
                      <Badge variant="outline" className="ml-1 text-[9px]">TESTE</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{j.cnpj}</TableCell>
                  <TableCell className="text-xs truncate max-w-[220px]">{j.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        j.status === 'sent'
                          ? 'default'
                          : j.status === 'error'
                          ? 'destructive'
                          : j.status === 'pending_test'
                          ? 'secondary'
                          : 'outline'
                      }
                    >
                      {j.status}
                    </Badge>
                    {j.error_message && (
                      <div className="text-[10px] text-destructive mt-1 truncate max-w-[220px]">
                        {j.error_message}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(j.claimed_at).toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-xs">
                    {j.confirmed_at ? new Date(j.confirmed_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'destructive';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`text-2xl font-bold ${
            tone === 'destructive' && value > 0 ? 'text-destructive' : ''
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function EndpointRow({
  label,
  url,
  onCopy,
}: {
  label: string;
  url: string;
  onCopy: (t: string) => void;
}) {
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
