import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flame, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/lib/automation/store';
import {
  envioStore,
  setDelaySec,
  setBatchLimit,
  setLimitMode,
  setDailyLimit,
  setHourlyLimit,
  setHourlyRestMin,
} from '@/lib/automation/envio-engine';

/**
 * Configuração recomendada para aquecer o domínio sem cair em spam.
 * O teto diário real é aplicado no servidor (escada de aquecimento);
 * aqui garantimos que o ritmo do painel também seja lento e espaçado.
 */
const SAFE = {
  delaySec: 300, // 1 e-mail a cada 5 min
  batchLimit: 15,
  limitMode: 'daily' as const,
  dailyLimit: 100, // teto final; o warmup do servidor limita mais no começo
  hourlyLimit: 12,
  hourlyRestMin: 0,
};

export function WarmupSetupCard() {
  const delaySec = useStore(envioStore, (s) => s.delaySec);
  const batchLimit = useStore(envioStore, (s) => s.batchLimit);
  const limitMode = useStore(envioStore, (s) => s.limitMode);
  const dailyLimit = useStore(envioStore, (s) => s.dailyLimit);
  const hourlyLimit = useStore(envioStore, (s) => s.hourlyLimit);
  const running = useStore(envioStore, (s) => s.running);

  const ok = useMemo(
    () =>
      delaySec >= SAFE.delaySec &&
      limitMode === SAFE.limitMode &&
      hourlyLimit > 0 &&
      hourlyLimit <= SAFE.hourlyLimit &&
      dailyLimit > 0 &&
      dailyLimit <= SAFE.dailyLimit &&
      batchLimit <= SAFE.batchLimit,
    [delaySec, limitMode, hourlyLimit, dailyLimit, batchLimit],
  );

  const apply = () => {
    setDelaySec(SAFE.delaySec);
    setBatchLimit(SAFE.batchLimit);
    setLimitMode(SAFE.limitMode);
    setDailyLimit(SAFE.dailyLimit);
    setHourlyLimit(SAFE.hourlyLimit);
    setHourlyRestMin(SAFE.hourlyRestMin);
    toast.success('Configuração de aquecimento aplicada.');
  };

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="h-4 w-4 text-amber-600" />
          Aquecimento do domínio
          {ok ? (
            <Badge className="bg-emerald-100 text-emerald-700">Configurado</Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800">Ajuste recomendado</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Comece devagar e aumente sozinho: 15 e-mails no 1º dia até 100/dia em ~2 semanas, sempre
          entre 9h e 20h, com intervalo variável entre disparos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Item label="Intervalo" value={`${Math.round(delaySec / 60)} min`} good={delaySec >= SAFE.delaySec} />
          <Item label="Por hora" value={String(hourlyLimit)} good={hourlyLimit > 0 && hourlyLimit <= SAFE.hourlyLimit} />
          <Item label="Por dia (teto)" value={String(dailyLimit)} good={dailyLimit > 0 && dailyLimit <= SAFE.dailyLimit} />
          <Item label="Lote" value={String(batchLimit)} good={batchLimit <= SAFE.batchLimit} />
        </div>

        {!ok && (
          <Button onClick={apply} disabled={running} className="bg-amber-600 hover:bg-amber-700">
            Aplicar configuração de aquecimento
          </Button>
        )}

        <ul className="space-y-1 text-[11px] leading-relaxed text-slate-600">
          <li>• Não troque mais o domínio remetente — cada troca zera a reputação.</li>
          <li>• Links dos e-mails e remetente usam o mesmo domínio (melhor sinal para o Gmail).</li>
          <li>• Bounce acima de 2% pausa o envio automaticamente.</li>
          <li>• Endereços com bounce/reclamação são removidos da base sozinhos.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function Item({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex items-center gap-1 font-semibold text-slate-900">
        {good ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        )}
        {value}
      </div>
    </div>
  );
}
