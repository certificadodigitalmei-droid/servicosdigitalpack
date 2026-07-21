import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Loader2, Zap, RefreshCw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  getAutoImportConfig,
  saveAutoImportConfig,
} from '@/lib/casa-dos-dados/simple-flow.functions';

function fmtDT(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return iso;
  }
}

export function AutoImportCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAutoImportConfig);
  const saveFn = useServerFn(saveAutoImportConfig);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['auto-import-config'],
    queryFn: () => getFn(),
    refetchInterval: 20_000,
  });

  const [enabled, setEnabled] = useState(false);
  const [interval, setIntervalM] = useState(30);
  const [qty, setQty] = useState(5);

  useEffect(() => {
    if (data?.config) {
      setEnabled(!!(data.config as any).enabled);
      setIntervalM((data.config as any).interval_minutes ?? 30);
      setQty((data.config as any).quantity_per_run ?? 5);
    }
  }, [data?.config]);

  const saveMut = useMutation({
    mutationFn: (payload: {
      enabled: boolean;
      interval_minutes: number;
      quantity_per_run: number;
    }) =>
      saveFn({
        data: {
          ...payload,
          filters: {
            only_mei: true,
            only_active: true,
            only_matriz: true,
            require_email: false,
          },
        },
      }),
    onSuccess: () => {
      toast.success('Configuração salva.');
      qc.invalidateQueries({ queryKey: ['auto-import-config'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar'),
  });

  const cfg = data?.config as any;
  const lastRun = data?.lastRun as any;

  return (
    <Card className="border-2 border-emerald-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-emerald-600" />
          Importação automática (contínua)
          {cfg?.enabled ? (
            <Badge className="bg-emerald-600">Ativa</Badge>
          ) : (
            <Badge variant="secondary">Desligada</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Quando ligada, o sistema consulta sozinho, a cada X minutos, as empresas
          abertas <strong>hoje</strong> e importa apenas as que ainda não estão no seu banco.
          CNPJs repetidos são <strong>ignorados antes</strong> da chamada paga —
          nenhum crédito é gasto com duplicados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border bg-slate-50 p-3">
          <div>
            <Label htmlFor="auto-enabled" className="font-medium">
              Ligar auto-import
            </Label>
            <p className="text-xs text-slate-600">
              Roda automaticamente enquanto estiver ligado.
            </p>
          </div>
          <Switch id="auto-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="auto-interval">Intervalo (minutos)</Label>
            <Input
              id="auto-interval"
              type="number"
              min={5}
              max={1440}
              value={interval}
              onChange={(e) => setIntervalM(Math.max(5, Number(e.target.value) || 30))}
            />
            <p className="mt-1 text-xs text-slate-500">
              A cada quantos minutos verifica novas empresas. Mínimo 5.
            </p>
          </div>
          <div>
            <Label htmlFor="auto-qty">CNPJs por execução</Label>
            <Input
              id="auto-qty"
              type="number"
              min={1}
              max={15}
              value={qty}
              onChange={(e) =>
                setQty(Math.min(15, Math.max(1, Number(e.target.value) || 1)))
              }
            />
            <p className="mt-1 text-xs text-slate-500">
              Máximo importado em cada rodada. Cada 1 = 1 crédito.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              saveMut.mutate({
                enabled,
                interval_minutes: interval,
                quantity_per_run: qty,
              })
            }
            disabled={saveMut.isPending}
          >
            {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar status
          </Button>
        </div>

        {cfg && (
          <div className="grid gap-2 rounded-md border bg-white p-3 text-xs sm:grid-cols-2">
            <div>
              <span className="text-slate-500">Última execução: </span>
              <strong>{fmtDT(cfg.last_run_at)}</strong>
            </div>
            <div>
              <span className="text-slate-500">Próxima execução: </span>
              <strong>{cfg.enabled ? fmtDT(cfg.next_run_at) : '— (desligado)'}</strong>
            </div>
            {lastRun && (
              <>
                <div>
                  <span className="text-slate-500">Última rodada: </span>
                  <strong>
                    {lastRun.saved_companies ?? 0} importada(s)
                    {lastRun.api_summary?.skipped_existing != null &&
                      ` · ${lastRun.api_summary.skipped_existing} já existiam`}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Status: </span>
                  <strong
                    className={
                      lastRun.status === 'success' ? 'text-emerald-700' : 'text-red-700'
                    }
                  >
                    {lastRun.status}
                  </strong>
                </div>
                {lastRun.error_message && (
                  <div className="sm:col-span-2 text-red-700">
                    Erro: {lastRun.error_message}
                  </div>
                )}
              </>
            )}
            {cfg.last_error && !lastRun?.error_message && (
              <div className="sm:col-span-2 text-red-700">Erro: {cfg.last_error}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
