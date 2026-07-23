import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useStore } from '@/lib/automation/store';
import { envioStore, bootEnvioEngine } from '@/lib/automation/envio-engine';
import {
  Activity,
  Send,
  CheckCircle2,
  AlertCircle,
  Ban,
  Clock,
  Pause,
  Play,
  Zap,
} from 'lucide-react';

/**
 * Rota destinada a abrir em janela pop-up separada (window.open) — permite
 * arrastar para fora do site. Sincroniza com o painel principal via storage
 * event (o store já ouve mudanças em outras janelas/abas).
 */
export const Route = createFileRoute('/_authenticated/monitor-envio')({
  ssr: false,
  component: MonitorEnvio,
});

function MonitorEnvio() {
  useEffect(() => {
    bootEnvioEngine();
    document.title = 'Monitor · Envio em Massa';
  }, []);

  const queue = useStore(envioStore, (s) => s.queue);
  const running = useStore(envioStore, (s) => s.running);
  const paused = useStore(envioStore, (s) => s.paused);
  const logs = useStore(envioStore, (s) => s.logs);
  const sentToday = useStore(envioStore, (s) => s.sentToday);
  const sentThisHour = useStore(envioStore, (s) => s.sentThisHour);
  const dailyLimit = useStore(envioStore, (s) => s.dailyLimit);
  const hourlyLimit = useStore(envioStore, (s) => s.hourlyLimit);
  const limitMode = useStore(envioStore, (s) => s.limitMode);
  const delaySec = useStore(envioStore, (s) => s.delaySec);
  const lastSuccessAt = useStore(envioStore, (s) => s.lastSuccessAt);
  const lastErrorMsg = useStore(envioStore, (s) => s.lastErrorMsg);

  const pending = queue.filter((q) => q.status === 'pending').length;
  const sending = queue.filter((q) => q.status === 'sending').length;
  const suppressed = queue.filter((q) => q.status === 'suppressed').length;
  const errors = queue.filter((q) => q.status === 'error').length;
  const total = queue.length + sentToday;
  const done = sentToday + suppressed + errors;
  const progress = total > 0 ? (done / total) * 100 : 0;
  const limitCur = limitMode === 'daily' ? sentToday : sentThisHour;
  const limitMax = limitMode === 'daily' ? dailyLimit : hourlyLimit;
  const limitPct = limitMax > 0 ? Math.min(100, (limitCur / limitMax) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 font-sans">
      <div className="mx-auto max-w-md space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-3 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Activity className="h-5 w-5" />
              {running && !paused && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-300 animate-ping" />
              )}
            </div>
            <div>
              <div className="text-sm font-bold">Monitor de Envio</div>
              <div className="text-[10px] text-white/70">
                {running ? (paused ? 'Pausado' : 'Enviando…') : 'Envio parado'} · sincroniza ao vivo
              </div>
            </div>
          </div>
        </div>

        {/* Big counter */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 text-center">
          <div className="text-6xl font-black tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            {sentToday}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-widest text-slate-400">
            enviados hoje · {sentThisHour} nesta hora
          </div>
        </div>

        {/* Limite */}
        {limitMax > 0 && (
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>Limite {limitMode === 'daily' ? 'diário' : 'por hora'}</span>
              <span className="tabular-nums text-slate-200 font-semibold">{limitCur} / {limitMax}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${limitPct >= 100 ? 'bg-red-500' : limitPct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${limitPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Progresso da fila */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Progresso da fila</span>
            <span className="tabular-nums text-slate-200 font-semibold">{done} / {total}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Grid stats */}
        <div className="grid grid-cols-4 gap-2">
          <StatCard icon={<Clock className="h-4 w-4" />} label="Fila" value={pending} color="text-slate-300" />
          <StatCard icon={<Send className="h-4 w-4" />} label="Env." value={sentToday} color="text-emerald-400" />
          <StatCard icon={<Ban className="h-4 w-4" />} label="Supr." value={suppressed} color="text-amber-400" />
          <StatCard icon={<AlertCircle className="h-4 w-4" />} label="Erro" value={errors} color="text-red-400" />
        </div>

        {/* Info detalhada */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-2 text-xs">
          <Row label="Último sucesso" value={lastSuccessAt ? new Date(lastSuccessAt).toLocaleTimeString('pt-BR') : '—'} valueClass="text-emerald-300" />
          <Row label="Delay entre envios" value={`${delaySec}s`} />
          <Row label="Enviando agora" value={sending > 0 ? `${sending} e-mail(s)` : 'aguardando'} />
          <Row label="Status" value={running ? (paused ? 'Pausado' : 'Ativo') : 'Ocioso'} valueClass={running ? (paused ? 'text-amber-300' : 'text-emerald-300') : 'text-slate-400'} />
          {lastErrorMsg && (
            <div className="mt-2 rounded bg-red-900/40 border border-red-700/50 px-2 py-1.5 text-red-300">
              <div className="text-[10px] uppercase tracking-wider text-red-400 mb-0.5">Último erro</div>
              <div>{lastErrorMsg}</div>
            </div>
          )}
        </div>

        {/* State pill */}
        <div className="flex items-center justify-center gap-1.5 text-xs font-medium">
          {running ? (
            paused ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/20 text-amber-300 px-3 py-1">
                <Pause className="h-3.5 w-3.5" /> Pausado
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-300 px-3 py-1">
                <Zap className="h-3.5 w-3.5" /> Ativo
              </span>
            )
          ) : (
            <span className="rounded-full bg-slate-700/60 text-slate-300 px-3 py-1">
              <Play className="inline h-3 w-3 mr-1" /> Ocioso
            </span>
          )}
        </div>

        {/* Log recente */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Log ao vivo</div>
          <div className="h-40 overflow-auto rounded-md border border-slate-800 bg-black/40 p-2 font-mono text-[10px] text-slate-300 space-y-0.5">
            {logs.length === 0 ? (
              <div className="text-slate-600">Sem eventos ainda.</div>
            ) : (
              logs.slice(0, 60).map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-600">
          Arraste esta janela para fora do site — ela continua sincronizada.
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 p-2 text-center">
      <div className={`flex items-center justify-center gap-1 ${color}`}>
        {icon}
        <span className="text-lg font-bold tabular-nums">{value}</span>
      </div>
      <div className="text-[9px] uppercase text-slate-500 tracking-wide">{label}</div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`tabular-nums ${valueClass ?? 'text-slate-200'}`}>{value}</span>
    </div>
  );
}
