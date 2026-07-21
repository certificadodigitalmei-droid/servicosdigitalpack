import { useEffect, useRef, useState } from 'react';
import { Minus, X, Activity, Send, CheckCircle2, AlertCircle, Ban, Clock, Pause, Play } from 'lucide-react';

type Stats = {
  total: number;
  sent: number;
  errors: number;
  suppressed: number;
  pending: number;
};

type Props = {
  stats: Stats;
  running: boolean;
  paused: boolean;
  lastEvent?: string;
  onClose: () => void;
};

const POS_KEY = 'envio-massa-floating-pos-v1';

export function FloatingStatsPanel({ stats, running, paused, lastEvent, onClose }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved) return saved;
    } catch {}
    return { x: typeof window !== 'undefined' ? window.innerWidth - 340 : 20, y: 90 };
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
      const width = minimized ? 220 : 320;
      const height = minimized ? 56 : 340;
      const nx = Math.max(4, Math.min(window.innerWidth - width - 4, e.clientX - dx));
      const ny = Math.max(4, Math.min(window.innerHeight - height - 4, e.clientY - dy));
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

  const progress = stats.total > 0 ? ((stats.sent + stats.errors + stats.suppressed) / stats.total) * 100 : 0;

  return (
    <div
      className="fixed z-[9999] select-none animate-scale-in"
      style={{
        left: pos.x,
        top: pos.y,
        width: minimized ? 220 : 320,
        transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), height 0.25s',
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
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> {stats.sent}
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <Ban className="h-3 w-3" /> {stats.suppressed}
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <AlertCircle className="h-3 w-3" /> {stats.errors}
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <Clock className="h-3 w-3" /> {stats.pending}
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
                enviados de {stats.total}
              </div>
            </div>

            {/* Progress bar */}
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

            {/* Grid stats */}
            <div className="grid grid-cols-4 gap-1.5">
              <MiniStat icon={<Clock className="h-3 w-3" />} label="Fila" value={stats.pending} color="text-slate-300" />
              <MiniStat icon={<Send className="h-3 w-3" />} label="Env." value={stats.sent} color="text-emerald-400" />
              <MiniStat icon={<Ban className="h-3 w-3" />} label="Supr." value={stats.suppressed} color="text-amber-400" />
              <MiniStat icon={<AlertCircle className="h-3 w-3" />} label="Erro" value={stats.errors} color="text-red-400" />
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
                    <Play className="h-3 w-3" /> Ativo
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
