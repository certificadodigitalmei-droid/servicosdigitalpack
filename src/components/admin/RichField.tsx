import { useRef, useState } from 'react';
import { Bold, Italic, Strikethrough, Palette, Eye } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { renderRich } from '@/lib/rich-text';

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  singleLine?: boolean;
};

const PRESET_COLORS = ['#0b1e3f', '#1351b4', '#138835', '#d93025', '#f59e0b', '#7c3aed', '#000000'];

export function RichField({ label, value, onChange, rows = 3, singleLine }: Props) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [showColors, setShowColors] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const wrap = (before: string, after: string) => {
    const el = ref.current;
    if (!el) {
      onChange(`${value}${before}texto${after}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || 'texto';
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursorStart = start + before.length;
      el.setSelectionRange(cursorStart, cursorStart + selected.length);
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100"
        >
          <Eye className="h-3 w-3" /> {showPreview ? 'Editar' : 'Prévia'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
        <ToolbarBtn onClick={() => wrap('*', '*')} title="Negrito (*texto*)">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => wrap('_', '_')} title="Itálico (_texto_)">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => wrap('~', '~')} title="Riscado (~texto~)">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="relative">
          <ToolbarBtn onClick={() => setShowColors((v) => !v)} title="Cor">
            <Palette className="h-3.5 w-3.5" />
          </ToolbarBtn>
          {showColors ? (
            <div className="absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-lg">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    wrap(`{c:${c}}`, '{/c}');
                    setShowColors(false);
                  }}
                  className="h-5 w-5 rounded-full ring-1 ring-slate-300"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                onChange={(e) => {
                  wrap(`{c:${e.target.value}}`, '{/c}');
                  setShowColors(false);
                }}
                className="h-5 w-5 cursor-pointer rounded"
                title="Cor personalizada"
              />
            </div>
          ) : null}
        </div>
        <div className="ml-auto pr-1 text-[10px] uppercase tracking-wide text-slate-400">
          *neg* _ita_ ~risc~ {'{c:#ff0000}cor{/c}'}
        </div>
      </div>

      {showPreview ? (
        <div className="min-h-[64px] whitespace-pre-wrap rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-800">
          {renderRich(value) || <span className="text-slate-400">Sem conteúdo</span>}
        </div>
      ) : singleLine ? (
        <Input
          ref={ref as any}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Textarea
          ref={ref as any}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
        />
      )}
    </div>
  );
}

function ToolbarBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="grid h-7 w-7 place-items-center rounded text-slate-600 hover:bg-white hover:text-[#0b1e3f] hover:shadow-sm"
    >
      {children}
    </button>
  );
}
