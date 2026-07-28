import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, List, Minus, Maximize2 } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCNPJ } from '@/lib/format';
import { useStore } from '@/lib/automation/store';
import { consultaStore, setListDialogOpen } from '@/lib/automation/consulta-engine';
import { toast } from 'sonner';

const POS_KEY = 'consulta-cnpj-floating-pos-v1';
const MIN_KEY = 'consulta-cnpj-floating-min-v1';

function formatBR(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function DraggableCnpjPanel() {
  const listDialogOpen = useStore(consultaStore, (s) => s.listDialogOpen);
  const autoCount = useStore(consultaStore, (s) => s.autoCount);
  const foundList = useStore(consultaStore, (s) => s.foundList);
  const importedSetArr = useStore(consultaStore, (s) => s.importedSet);
  const flashes = useStore(consultaStore, (s) => s.flashes);
  const countResult = useStore(consultaStore, (s) => s.countResult);
  const dateMode = useStore(consultaStore, (s) => s.dateMode);
  const selectedDate = useStore(consultaStore, (s) => s.selectedDate);

  const importedSet = useMemo(() => new Set(importedSetArr), [importedSetArr]);
  const effectiveDate = dateMode === 'today'
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
    : selectedDate;

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 720, h: 560 });
  const [minimized, setMinimized] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(MIN_KEY) === '1';
  });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // posição inicial ou salva
  useEffect(() => {
    if (pos != null) return;
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && typeof saved.x === 'number') {
        setPos({ x: saved.x, y: saved.y });
        if (saved.w && saved.h) setSize({ w: saved.w, h: saved.h });
        return;
      }
    } catch {}
    const w = Math.min(720, window.innerWidth - 40);
    const h = Math.min(560, window.innerHeight - 80);
    setSize({ w, h });
    setPos({ x: Math.max(20, (window.innerWidth - w) / 2), y: Math.max(20, (window.innerHeight - h) / 2) });
  }, [pos]);

  useEffect(() => {
    if (pos) localStorage.setItem(POS_KEY, JSON.stringify({ ...pos, ...size }));
  }, [pos, size]);

  useEffect(() => {
    localStorage.setItem(MIN_KEY, minimized ? '1' : '0');
  }, [minimized]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dragRef.current.dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragRef.current.dy)),
      });
    };
    const onUp = () => { dragRef.current = null; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!listDialogOpen || !pos) return null;

  const startDrag = (e: React.MouseEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    document.body.style.userSelect = 'none';
  };

  const copy = async (v: string) => {
    try { await navigator.clipboard.writeText(v); toast.success('CNPJ copiado'); }
    catch { toast.error('Falha ao copiar'); }
  };

  const savedCount = foundList.length;
  const apiTotal = countResult?.total ?? null;
  const importedCount = foundList.reduce((acc, f) => acc + (importedSet.has(f.cnpj) ? 1 : 0), 0);

  // ---- MINIMIZADO: barra compacta ----
  if (minimized) {
    return (
      <div
        className="fixed z-[9998] select-none"
        style={{ left: pos.x, top: pos.y }}
      >
        <div
          onMouseDown={startDrag}
          className="flex cursor-move items-center gap-2 rounded-full border border-slate-700 bg-slate-900/95 px-3 py-1.5 text-white shadow-2xl backdrop-blur"
        >
          {autoCount ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-slate-400" />
          )}
          <span className="text-xs font-semibold">CNPJs: {savedCount}</span>
          <span className="text-[10px] text-slate-400">· {importedCount} imp.</span>
          <button
            onClick={() => setMinimized(false)}
            className="ml-1 rounded p-1 hover:bg-white/10"
            title="Expandir"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setListDialogOpen(false)}
            className="rounded p-1 hover:bg-white/10"
            title="Fechar"
          >✕</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[9998] flex flex-col rounded-2xl border border-slate-200/70 bg-white/95 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.35)] backdrop-blur-xl resize overflow-hidden ring-1 ring-black/5"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, minWidth: 380, minHeight: 300 }}
    >
      <div className="pointer-events-none absolute -top-2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1">
        {flashes.map((f) => (
          <div
            key={f.id}
            className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/40 animate-in fade-in slide-in-from-bottom-2"
          >
            +{f.count} novo{f.count === 1 ? '' : 's'} CNPJ{f.count === 1 ? '' : 's'}
          </div>
        ))}
      </div>

      <div
        onMouseDown={startDrag}
        className="cursor-move select-none bg-gradient-to-r from-brand-navy via-slate-800 to-brand-navy px-4 py-3 text-white"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
              {autoCount ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                </span>
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">CNPJs encontrados</div>
              <div className="text-[11px] text-white/70">
                {formatBR(effectiveDate)} · {autoCount ? 'monitorando ao vivo' : 'monitor pausado'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMinimized(true)}
              className="grid h-7 w-7 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              title="Minimizar"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setListDialogOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Fechar"
            >✕</button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/10 px-2 py-1.5 ring-1 ring-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Salvos</div>
            <div className="text-base font-bold tabular-nums">{savedCount}</div>
          </div>
          <div className="rounded-lg bg-white/10 px-2 py-1.5 ring-1 ring-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Total API</div>
            <div className="text-base font-bold tabular-nums">
              {apiTotal != null ? apiTotal.toLocaleString('pt-BR') : '—'}
            </div>
          </div>
          <div className="rounded-lg bg-white/10 px-2 py-1.5 ring-1 ring-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Importados</div>
            <div className="text-base font-bold tabular-nums text-red-200">{importedCount}</div>
          </div>
        </div>
      </div>

      <VirtualCnpjList
        items={foundList}
        importedSet={importedSet}
        onCopy={copy}
      />


      <div className="border-t border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-500">
        ✋ Arraste o topo · ↘ redimensione pelo canto · continua aberto ao trocar de aba
      </div>
    </div>
  );
}

const CnpjRow = memo(function CnpjRow(props: {
  cnpj: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
  firstSeenAt: string;
  isImported: boolean;
  onCopy: (v: string) => void | Promise<void>;
}) {
  const { cnpj, nome, municipio, uf, firstSeenAt, isImported, onCopy } = props;
  return (
    <div
      className={cn(
        'group flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 transition',
        isImported ? 'bg-red-50/70' : 'hover:bg-white',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            'font-mono text-sm font-semibold tabular-nums',
            isImported ? 'text-red-700 line-through decoration-red-400/60' : 'text-slate-900',
          )}>
            {formatCNPJ(cnpj)}
          </span>
          {isImported && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              Importado
            </span>
          )}
        </div>
        <div className={cn('mt-0.5 truncate text-sm', isImported ? 'text-red-800/80' : 'text-slate-700')}>{nome}</div>
        {(municipio || uf) && (
          <div className={cn('mt-0.5 text-xs', isImported ? 'text-red-600/80' : 'text-slate-500')}>
            📍 {[municipio, uf].filter(Boolean).join(' / ')}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[10px] text-slate-400 tabular-nums">
          {new Date(firstSeenAt).toLocaleTimeString('pt-BR')}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 opacity-70 transition group-hover:opacity-100"
          onClick={() => onCopy(cnpj)}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
});

type FoundItem = {
  cnpj: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
  firstSeenAt: string;
};

function VirtualCnpjList(props: {
  items: FoundItem[];
  importedSet: Set<string>;
  onCopy: (v: string) => void | Promise<void>;
}) {
  const { items, importedSet, onCopy } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 84,
    overscan: 12,
    getItemKey: (i) => items[i]?.cnpj ?? i,
  });

  if (items.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50/40">
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
            <List className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium text-slate-700">Nenhum CNPJ ainda</div>
          <div className="text-xs text-slate-500">
            Ligue o <strong>Modo automático</strong> — os CNPJs aparecem aqui em tempo real.
          </div>
        </div>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto bg-slate-50/40 contain-strict">
      <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualItems.map((v) => {
          const it = items[v.index];
          if (!it) return null;
          return (
            <div
              key={v.key}
              data-index={v.index}
              ref={rowVirtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
            >
              <CnpjRow
                cnpj={it.cnpj}
                nome={it.nome}
                municipio={it.municipio}
                uf={it.uf}
                firstSeenAt={it.firstSeenAt}
                isImported={importedSet.has(it.cnpj)}
                onCopy={onCopy}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
