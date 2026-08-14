import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, Flame, Gauge, OctagonPause, ShieldCheck } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getSendGuardStatus } from '@/lib/email-hygiene/guard.functions';

const REFRESH_MS = 20_000;

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function humanTime(sec: number) {
  if (sec <= 0) return 'agora';
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

type Tone = 'ok' | 'warn' | 'stop';

const toneStyles: Record<Tone, string> = {
  ok: 'border-emerald-200 bg-emerald-50',
  warn: 'border-amber-200 bg-amber-50',
  stop: 'border-red-200 bg-red-50',
};

const toneText: Record<Tone, string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  stop: 'text-red-700',
};

function GuardCard({
  icon,
  title,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  tone: Tone;
}) {
  return (
    <div className={`rounded-xl border p-3 ${toneStyles[tone]}`}>
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${toneText[tone]}`}>
        {icon}
        {title}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{detail}</p>
    </div>
  );
}

export function SendGuardPanel() {
  const fetchGuard = useServerFn(getSendGuardStatus);
  const q = useQuery({
    queryKey: ['send-guard'],
    queryFn: () => fetchGuard(),
    refetchInterval: REFRESH_MS,
  });

  const g = q.data;

  const overallTone: Tone = g?.overall === 'parado' ? 'stop' : g?.overall === 'atencao' ? 'warn' : 'ok';

  return (
    <Card className={g?.overall === 'parado' ? 'border-red-300' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-slate-500" />
              Proteção do envio
            </CardTitle>
            <CardDescription className="text-xs">
              O envio para sozinho assim que qualquer indicador sair do seguro.
            </CardDescription>
          </div>
          <Badge
            className={
              overallTone === 'stop'
                ? 'bg-red-100 text-red-800'
                : overallTone === 'warn'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
            }
          >
            {g ? (g.overall === 'parado' ? 'ENVIO PARADO' : g.overall === 'atencao' ? 'ATENÇÃO' : 'TUDO OK') : '—'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {g?.blockers?.length ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800">
              <OctagonPause className="h-4 w-4" />
              Envio interrompido automaticamente
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] text-red-700">
              {g.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {g?.warnings?.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Pontos de atenção
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] text-amber-700">
              {g.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <GuardCard
            icon={<Flame className="h-3.5 w-3.5" />}
            title="Aquecimento"
            value={
              !g
                ? '—'
                : g.warmup.day >= g.warmup.totalDays
                  ? 'Aquecido'
                  : `Dia ${g.warmup.day}/${g.warmup.totalDays}`
            }
            detail={
              !g
                ? 'carregando…'
                : `${g.warmup.sentToday}/${g.warmup.dailyLimit ?? 100} hoje · restam ${g.warmup.remainingToday} · nova cota em ${humanTime(g.warmup.secondsToReset)}`
            }
            tone={!g ? 'ok' : g.warmup.blocked ? 'stop' : g.warmup.remainingToday <= 5 ? 'warn' : 'ok'}
          />

          <GuardCard
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            title="Taxa de bounce"
            value={g ? pct(g.bounce.rate) : '—'}
            detail={
              !g
                ? 'carregando…'
                : `${g.bounce.bounced} falhas em ${g.bounce.sent} envios (3 h). Limite seguro 2%.`
            }
            tone={!g ? 'ok' : g.bounce.blocked ? 'stop' : g.bounce.rate > 0.01 ? 'warn' : 'ok'}
          />

          <GuardCard
            icon={<Gauge className="h-3.5 w-3.5" />}
            title="Cota da hora"
            value={g ? `${g.hourly.sentInWindow}/${g.hourly.safeLimit}` : '—'}
            detail={
              !g
                ? 'carregando…'
                : g.hourly.exhausted
                  ? `cota cheia · libera em ${humanTime(g.hourly.secondsToReset)}`
                  : `restam ${g.hourly.remaining} nesta hora`
            }
            tone={!g ? 'ok' : g.hourly.exhausted ? 'warn' : 'ok'}
          />

          <GuardCard
            icon={<Gauge className="h-3.5 w-3.5" />}
            title="Ritmo do dia"
            value={
              !g
                ? '—'
                : g.pacing.insideWindow
                  ? `1 a cada ${Math.round(g.pacing.baseSpacingSec / 60)} min`
                  : 'Fora do horário'
            }
            detail={
              !g
                ? 'carregando…'
                : g.pacing.insideWindow
                  ? `disparos entre ${g.pacing.windowStartHour}h e ${g.pacing.windowEndHour}h, com intervalo variável (parece envio humano).`
                  : (g.pacing.reason ?? 'aguardando a janela de envio.')
            }
            tone={!g ? 'ok' : g.pacing.insideWindow ? 'ok' : 'warn'}
          />

          <GuardCard
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            title="Saúde da fila"
            value={
              !g ? '—' : g.queue.status === 'blocked' ? 'Travada' : g.queue.status === 'warning' ? 'Atenção' : 'Normal'
            }
            detail={
              !g
                ? 'carregando…'
                : `${g.queue.naFila} na fila · ${g.queue.falhas} falhas · ${g.queue.suprimidos} suprimidos · falhas em ${pct(g.queue.failureRate)}`
            }
            tone={!g ? 'ok' : g.queue.status === 'blocked' ? 'stop' : g.queue.status === 'warning' ? 'warn' : 'ok'}
          />
        </div>

        <p className="text-[11px] text-slate-500">
          Atualiza a cada 20 s. Aquecimento até 100 e-mails por dia (15 → 25 → 40 → 55 → 70 → 85 → 100), sempre
          dentro do horário comercial e com intervalo variável entre os disparos. Antes de cada disparo o endereço passa por varredura de sintaxe, domínio, servidor de
          e-mail e caixas genéricas — quem reprova é descartado e nunca mais é importado.
        </p>
      </CardContent>
    </Card>
  );
}
