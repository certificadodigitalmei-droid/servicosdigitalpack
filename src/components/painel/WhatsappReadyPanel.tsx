import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Loader2, Download, RefreshCw, CheckCircle2, Ban, Link2Off, Users, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCNPJ } from '@/lib/format';
import { getWaReadyOverview, reconcileWaReadyQueue } from '@/lib/whatsapp/ready-queue.functions';
import { purgeNoMobileCompanies, purgeSendFailedCompanies } from '@/lib/whatsapp/maintenance.functions';
import { importBatch } from '@/lib/casa-dos-dados/simple-flow.functions';
import { useStore } from '@/lib/automation/store';
import { consultaStore } from '@/lib/automation/consulta-engine';

const QTY = [10, 20, 50, 100];
const BATCH = 15; // limite por chamada do importBatch

function todayBR(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

type Overview = Awaited<ReturnType<typeof getWaReadyOverview>>;

export function WhatsappReadyPanel({ onChanged }: { onChanged?: () => void }) {
  const loadOverview = useServerFn(getWaReadyOverview);
  const doReconcile = useServerFn(reconcileWaReadyQueue);
  const doImport = useServerFn(importBatch);
  const doPurgeNoMobile = useServerFn(purgeNoMobileCompanies);
  const doPurgeFailed = useServerFn(purgeSendFailedCompanies);

  // Data e filtros vêm da Consulta automática logo acima (fonte única).
  const dateMode = useStore(consultaStore, (s) => s.dateMode);
  const selectedDate = useStore(consultaStore, (s) => s.selectedDate);
  const storeFilters = useStore(consultaStore, (s) => s.filters);
  const date = dateMode === 'today' ? todayBR() : selectedDate || todayBR();

  const [data, setData] = useState<Overview | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [qty, setQty] = useState(10);
  const [customQty, setCustomQty] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastRun, setLastRun] = useState<{ imported: number; rejected: number; skipped: number; reasons: string[] } | null>(null);
  const [preview, setPreview] = useState<any>(null);

  const refresh = async (p = page) => {
    try {
      const r: any = await loadOverview({ data: { page: p, pageSize: 20 } });
      setData(r);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao carregar a fila');
    }
  };

  useEffect(() => {
    void refresh(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const counts = (data as any)?.counts ?? {};
  const rows: any[] = (data as any)?.items ?? [];

  const runImport = async () => {
    const target = Math.max(1, Number(customQty) || qty);
    setBusy('import');
    setProgress({ done: 0, total: target });
    let imported = 0;
    let rejected = 0;
    let skipped = 0;
    const reasons: string[] = [];
    try {
      let remaining = target;
      let guard = 0;
      let emptyRounds = 0;

      while (remaining > 0 && guard < 40) {
        guard += 1;
        const take = Math.min(BATCH, remaining);
        const r: any = await doImport({
          data: {
            date,
            filters: { only_mei: true, only_active: true, only_matriz: true, require_email: false },
            limit: take,
            page: 1,
            skipExisting: true,
          },
        });
        if (!r?.ok) {
          toast.error(r?.error ?? 'Falha na importação');
          break;
        }
        const got = (r.imported ?? []).length;
        imported += got;
        skipped += r.skipped ?? 0;
        for (const f of r.failed ?? []) {
          rejected += 1;
          if (reasons.length < 6) reasons.push(`${formatCNPJ(f.cnpj)}: ${f.error}`);
        }
        // Só conta o que realmente entrou pronto (com celular).
        remaining = target - imported;
        setProgress({ done: Math.min(target, imported), total: target });
        if (got === 0) {
          emptyRounds += 1;
          if (emptyRounds >= 3 || (r.discovered ?? 0) === 0) break;
        } else {
          emptyRounds = 0;
        }

      }
      setLastRun({ imported, rejected, skipped, reasons });
      toast.success(`Importação concluída: ${imported} empresa(s) pronta(s)`);
      await refresh(1);
      setPage(1);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha na importação');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const reconcile = async (apply: boolean) => {
    setBusy(apply ? 'apply' : 'preview');
    try {
      const r: any = await doReconcile({ data: { apply } });
      setPreview(r);
      if (apply) {
        toast.success(`Reconciliação aplicada: ${r.ready} pronta(s)`);
        await refresh(1);
        onChanged?.();
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha na reconciliação');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* IMPORTAR PARA WHATSAPP */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" /> Importar empresas para WhatsApp
          </CardTitle>
          <CardDescription>
            Usa a data e os filtros da <strong>Consulta automática</strong> acima. Só entra empresa com celular
            brasileiro válido e link ativo. Importar <strong>não envia nada</strong> — quem consome a fila é a
            campanha selecionada.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Data de abertura</Label>
            <div className="flex h-10 items-center rounded-md border px-3 text-sm text-muted-foreground">
              {date} {dateMode === 'today' ? '(hoje)' : ''}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Quantidade</Label>
            <div className="flex flex-wrap items-center gap-2">
              {QTY.map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={!customQty && qty === n ? 'default' : 'outline'}
                  onClick={() => {
                    setQty(n);
                    setCustomQty('');
                  }}
                >
                  {n}
                </Button>
              ))}
              <Input
                className="w-28"
                placeholder="personalizada"
                inputMode="numeric"
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button onClick={() => void runImport()} disabled={busy !== null}>
              {busy === 'import' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Importar agora
            </Button>
            {progress ? (
              <span className="text-sm text-muted-foreground">
                {progress.done}/{progress.total} processadas…
              </span>
            ) : null}
          </div>
          {lastRun ? (
            <div className="md:col-span-2">
              <Alert>
                <AlertDescription className="space-y-1 text-sm">
                  <div>
                    Prontas: <strong>{lastRun.imported}</strong> · Rejeitadas: <strong>{lastRun.rejected}</strong> ·
                    Ignoradas (duplicadas/bloqueadas): <strong>{lastRun.skipped}</strong>
                  </div>
                  {lastRun.reasons.map((r) => (
                    <div key={r} className="text-muted-foreground">
                      {r}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* FILA DE PRONTIDÃO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Empresas prontas para WhatsApp
          </CardTitle>
          <CardDescription>
            Fila independente de campanha. A campanha reserva as mais antigas de forma atômica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Prontas" value={counts.ready ?? 0} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
            <Stat label="Aguardando link" value={counts.awaitingLink ?? 0} icon={<Link2Off className="h-4 w-4 text-amber-600" />} />
            <Stat label="Sem celular" value={counts.rejectedNoMobile ?? 0} icon={<Ban className="h-4 w-4 text-destructive" />} />
            <Stat label="Bloqueadas" value={counts.blocked ?? 0} icon={<Ban className="h-4 w-4 text-destructive" />} />
            <Stat label="Reservadas / enviadas" value={(counts.reserved ?? 0) + (counts.sent ?? 0)} icon={<Users className="h-4 w-4" />} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void refresh(page)} disabled={busy !== null}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
            <Button size="sm" variant="outline" onClick={() => void reconcile(false)} disabled={busy !== null}>
              {busy === 'preview' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Prévia da reconciliação
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!window.confirm('Aplicar a reconciliação nas empresas já importadas? Nenhum telefone é inventado.')) return;
                void reconcile(true);
              }}
              disabled={busy !== null || !preview}
            >
              {busy === 'apply' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Aplicar reconciliação
            </Button>
          </div>

          {preview ? (
            <Alert>
              <AlertDescription className="text-sm">
                Analisadas <strong>{preview.analyzed}</strong> · prontas <strong>{preview.ready}</strong> · sem celular{' '}
                <strong>{preview.noMobile}</strong> · sem link <strong>{preview.noLink}</strong> · bloqueadas{' '}
                <strong>{preview.blocked}</strong>
                {preview.applied ? ' (aplicado)' : ' (prévia — nada foi gravado)'}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">Empresa</th>
                  <th className="p-2">CNPJ</th>
                  <th className="p-2">Telefone</th>
                  <th className="p-2">Origem</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={5}>
                      Nenhuma empresa na fila ainda.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.company_name ?? '—'}</td>
                      <td className="p-2">{r.cnpj ? formatCNPJ(r.cnpj) : '—'}</td>
                      <td className="p-2">{r.phone_e164 ?? '—'}</td>
                      <td className="p-2 text-muted-foreground">
                        {r.source ?? '—'} · {r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="p-2">
                        <Badge variant={r.status === 'ready' ? 'default' : 'secondary'}>{r.status}</Badge>
                        {r.reason ? <span className="ml-2 text-xs text-muted-foreground">{r.reason}</span> : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Página {page}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={rows.length < 20} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
