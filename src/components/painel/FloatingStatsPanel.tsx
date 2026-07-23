import { useEffect, useRef, useState } from 'react';
import {
  Minus,
  X,
  Activity,
  Send,
  CheckCircle2,
  AlertCircle,
  Ban,
  Clock,
  Pause,
  Play,
  ExternalLink,
  Zap,
} from 'lucide-react';

type Stats = {
  total: number;      // total de itens hoje incluindo já enviados (queue+enviados hoje)
  pending: number;    // fila pendente
  sending: number;    // enviando agora
  sent: number;       // enviados confirmados (hoje)
  sentHour: number;   // enviados nesta hora
  suppressed: number; // suprimidos ainda na fila
  errors: number;     // erros ainda na fila
  dailyLimit: number;
  hourlyLimit: number;
  hourlyRestMin: number;
  stopAtDaily: number;
  limitMode: 'daily' | 'hourly';
  delaySec: number;
};

type Props = {
  stats: Stats;
  running: boolean;
  paused: boolean;
  lastEvent?: string;
  lastSuccessAt?: string | null;
  lastErrorMsg?: string | null;
  onClose: () => void;
};

const POS_KEY = 'envio-massa-floating-pos-v2';

export function FloatingStatsPanel({
  stats,
  running,
  paused,
  lastEvent,
  lastSuccessAt,
  lastErrorMsg,
  onClose,
}: Props) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && typeof saved.x === 'number') return saved;
    } catch {}
    return { x: typeof window !== 'undefined' ? window.innerWidth - 360 : 20, y: 90 };
  });
  const [minimized, setMinimized] = useState(false);
  const [pulse, setPulse] = useState(false);
  const draggingRef = useRef<{ dx: number; dy: number } | null>(null);
  const prevSent = useRef(stats.sent);

  useEffect(() => {
    if (stats.sent > prevSent.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 700);
      prevSent.current = stats.sent;
      return () => clearTimeout(t);
    }
    prevSent.current = stats.sent;
  }, [stats.sent]);

  useEffect(() => {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const { dx, dy } = draggingRef.current;
      const width = minimized ? 260 : 340;
      const height = minimized ? 56 : 440;
      // Mantém dentro da viewport, mas sem margem exagerada (usuário pode
      // arrastar bem perto das bordas).
      const nx = Math.max(0, Math.min(window.innerWidth - width, e.clientX - dx));
      const ny = Math.max(0, Math.min(window.innerHeight - height, e.clientY - dy));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => (draggingRef.current = null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [minimized]);

  const doneCount = stats.sent + stats.suppressed + stats.errors;
  const progress = stats.total > 0 ? (doneCount / stats.total) * 100 : 0;
  const limitCur = stats.limitMode === 'daily' ? stats.sent : stats.sentHour;
  const limitMax = stats.limitMode === 'daily' ? stats.dailyLimit : stats.hourlyLimit;
  const limitPct = limitMax > 0 ? Math.min(100, (limitCur / limitMax) * 100) : 0;
  const hourlyReached = stats.limitMode === 'hourly' && stats.hourlyLimit > 0 && stats.sentHour >= stats.hourlyLimit;
  const stopReached = stats.stopAtDaily > 0 && stats.sent >= stats.stopAtDaily;

  const detach = () => {
    window.open(
      '/painel/monitor-envio',
      'monitor-envio',
      'popup,width=380,height=560,resizable=yes,scrollbars=yes',
    );
  };

  const lastSuccessTxt = lastSuccessAt
    ? new Date(lastSuccessAt).toLocaleTimeString('pt-BR')
    : '—';

  return (
    <div
      className="fixed z-[9999] select-none animate-scale-in"
      style={{
        left: pos.x,
        top: pos.y,
        width: minimized ? 260 : 340,
        transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <div
        className="rounded-xl border border-slate-700 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur-md overflow-hidden"
        style={{ boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)' }}
      >
        {/* Header - drag handle */}
        <div
          onMouseDown={(e) => {
            draggingRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          }}
          className="flex items-center justify-between gap-2 px-3 py-2 cursor-move bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative">
              <Activity className="h-4 w-4" />
              {running && !paused && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </div>
            <span className="text-xs font-semibold truncate">
              {running ? (paused ? 'Pausado' : 'Enviando…') : 'Envio parado'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={detach}
              className="rounded p-1 hover:bg-white/20 transition"
              title="Abrir em janela separada (arraste para fora do site)"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setMinimized((v) => !v)}
              className="rounded p-1 hover:bg-white/20 transition"
              title={minimized ? 'Expandir' : 'Minimizar'}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} className="rounded p-1 hover:bg-white/20 transition" title="Fechar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {minimized ? (
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-400" title="Enviados hoje">
              <CheckCircle2 className="h-3 w-3" /> {stats.sent}
            </span>
            <span className="flex items-center gap-1 text-blue-300" title="Nesta hora">
              <Zap className="h-3 w-3" /> {stats.sentHour}
            </span>
            <span className="flex items-center gap-1 text-slate-400" title="Fila pendente">
              <Clock className="h-3 w-3" /> {stats.pending}
            </span>
            <span className="flex items-center gap-1 text-red-400" title="Erros">
              <AlertCircle className="h-3 w-3" /> {stats.errors}
            </span>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {/* Big counter */}
            <div className="text-center">
              <div
                className={`text-4xl font-black tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent transition-transform ${pulse ? 'scale-125' : 'scale-100'}`}
                style={{ transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}
              >
                {stats.sent}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">
                enviados hoje · {stats.sentHour} nesta hora
              </div>
            </div>

            {/* Limite (barra) */}
            {limitMax > 0 && (
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Limite {stats.limitMode === 'daily' ? 'diário' : 'por hora'}</span>
                  <span className="tabular-nums">{limitCur} / {limitMax}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${limitPct >= 100 ? 'bg-red-500' : limitPct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${limitPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Progress bar da fila */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>Progresso da fila</span>
                <span className="tabular-nums">{doneCount} / {stats.total}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-500 relative"
                  style={{ width: `${progress}%` }}
                >
                  {running && !paused && (
                    <div
                      className="absolute inset-0 opacity-40"
                      style={{
                        backgroundImage:
                          'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s linear infinite',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Grid stats */}
            <div className="grid grid-cols-4 gap-1.5">
              <MiniStat icon={<Clock className="h-3 w-3" />} label="Fila" value={stats.pending} color="text-slate-300" />
              <MiniStat icon={<Send className="h-3 w-3" />} label="Env." value={stats.sent} color="text-emerald-400" />
              <MiniStat icon={<Ban className="h-3 w-3" />} label="Supr." value={stats.suppressed} color="text-amber-400" />
              <MiniStat icon={<AlertCircle className="h-3 w-3" />} label="Erro" value={stats.errors} color="text-red-400" />
            </div>

            {/* Info detalhada */}
            <div className="space-y-1 rounded-md bg-slate-800/70 border border-slate-700 p-2 text-[10.5px]">
              <div className="flex justify-between text-slate-400">
                <span>Último sucesso</span>
                <span className="text-emerald-300 tabular-nums">{lastSuccessTxt}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Delay entre envios</span>
                <span className="text-slate-200 tabular-nums">{stats.delaySec}s</span>
              </div>
              {lastErrorMsg && (
                <div className="mt-1 rounded bg-red-900/40 border border-red-700/50 px-1.5 py-1 text-red-300">
                  <div className="text-[9px] uppercase tracking-wider text-red-400 mb-0.5">Último erro</div>
                  <div className="truncate" title={lastErrorMsg}>{lastErrorMsg}</div>
                </div>
              )}
            </div>

            {/* Last event */}
            <div className="rounded-md bg-slate-800/70 px-2 py-1.5 text-[11px] font-mono text-slate-300 truncate border border-slate-700">
              {lastEvent || 'Aguardando eventos…'}
            </div>

            {/* State pill */}
            <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium">
              {running ? (
                paused ? (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5">
                    <Pause className="h-3 w-3" /> Pausado
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5">
                    <Play className="h-3 w-3" /> Ativo · {stats.sending > 0 ? `enviando ${stats.sending}` : 'aguardando delay'}
                  </span>
                )
              ) : (
                <span className="rounded-full bg-slate-700/60 text-slate-300 px-2 py-0.5">Ocioso</span>
              )}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

function MiniStat({
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
    <div className="rounded-md bg-slate-800/60 border border-slate-700/50 p-1.5 text-center">
      <div className={`flex items-center justify-center gap-0.5 ${color}`}>
        {icon}
        <span className="text-sm font-bold">{value}</span>
      </div>
      <div className="text-[9px] uppercase text-slate-500 tracking-wide">{label}</div>
    </div>
  );
}
