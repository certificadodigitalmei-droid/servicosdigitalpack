import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, X, ImagePlus, Trash2, Bold, Minus, Plus } from 'lucide-react';
import type { CampaignDesign } from '@/lib/email-campaign/template';
import { substitute } from '@/lib/email-campaign/template';

type Props = {
  design: CampaignDesign;
  set: <K extends keyof CampaignDesign>(k: K, v: CampaignDesign[K]) => void;
  vars: Record<string, string>;
  onSelect?: (id: string) => void;
};

/**
 * Interactive WYSIWYG preview.
 * - Every text is contentEditable — click and type directly.
 * - Images have a hover overlay to upload/replace/remove.
 * - Selecting a text shows a floating toolbar with size / color / bold controls.
 */
export function InteractivePreview({ design, set, vars, onSelect }: Props) {
  const [focused, setFocused] = useState<string | null>(null);

  const commit = <K extends keyof CampaignDesign>(k: K, e: React.FocusEvent<HTMLElement>) => {
    // read plaintext; convert HTML <b>/**strong** back to **markers**
    const el = e.currentTarget;
    const md = htmlToMarkdown(el);
    set(k, md as CampaignDesign[K]);
  };

  const Editable = ({
    id, field, tag = 'div', multi = false, style, className, placeholder,
  }: {
    id: string;
    field: keyof CampaignDesign;
    tag?: 'div' | 'span' | 'h1' | 'h2' | 'p';
    multi?: boolean;
    style?: React.CSSProperties;
    className?: string;
    placeholder?: string;
  }) => {
    const Tag = tag as any;
    const raw = (design[field] as string) ?? '';
    return (
      <Tag
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: markdownToHtml(substituteEditable(raw, vars)) }}
        onFocus={() => { setFocused(id); onSelect?.(id); }}
        onBlur={(e: React.FocusEvent<HTMLElement>) => {
          setFocused((f) => (f === id ? null : f));
          commit(field, e);
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (!multi && e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
        }}
        data-placeholder={placeholder}
        className={`ee-editable ${className || ''}`}
        style={style}
      />
    );
  };

  const ImageZone = ({
    urlField, sizeField, shape = 'square', width = 200,
  }: {
    urlField: keyof CampaignDesign;
    sizeField?: keyof CampaignDesign;
    shape?: 'square' | 'circle' | 'banner';
    width?: number;
  }) => {
    const url = (design[urlField] as string) || '';
    const size = sizeField ? (design[sizeField] as number) : width;
    const inputRef = useRef<HTMLInputElement>(null);
    const handleFile = (file?: File) => {
      if (!file) return;
      if (file.size > 500 * 1024) { toast.error('Imagem muito grande (máx 500KB)'); return; }
      const r = new FileReader();
      r.onload = () => { set(urlField, String(r.result || '') as CampaignDesign[typeof urlField]); toast.success('Imagem carregada'); };
      r.readAsDataURL(file);
    };
    const dims: React.CSSProperties = shape === 'circle'
      ? { width: size, height: size, borderRadius: '9999px' }
      : shape === 'banner'
        ? { width: '100%', maxHeight: 260 }
        : { width: size, height: 'auto' };
    return (
      <div className="ee-image-zone" style={{ display: 'inline-block', position: 'relative' }}>
        {url ? (
          <>
            <img src={url} alt="" style={{ ...dims, objectFit: 'cover', display: 'block' }} />
            <div className="ee-image-overlay">
              <button type="button" className="ee-btn" onClick={() => inputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Trocar
              </button>
              <button type="button" className="ee-btn ee-btn-danger" onClick={() => set(urlField, '' as CampaignDesign[typeof urlField])}>
                <Trash2 className="h-3.5 w-3.5" /> Remover
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="ee-image-empty"
            style={dims}
          >
            <ImagePlus className="h-6 w-6 opacity-60" />
            <span>Clique para enviar imagem</span>
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
          onDragOver={(e) => e.preventDefault()}
        />
      </div>
    );
  };

  const items = (design.warningItems || '').split(/\r?\n/).filter(Boolean);

  return (
    <div className="ee-root">
      <style>{EE_CSS}</style>

      {focused && (
        <FloatingToolbar
          fieldKey={focused as keyof CampaignDesign}
          design={design}
          set={set}
        />
      )}

      <div style={{ background: design.pageBg, padding: 24 }}>
        <div
          style={{
            maxWidth: design.containerWidth,
            margin: '0 auto',
            background: design.bodyBg,
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          {/* Gov bar */}
          {design.showGovBar && (
            <div
              className="ee-block"
              onClick={() => onSelect?.('govbar')}
              style={{
                background: design.govBarBg || '#071d40',
                color: design.govBarColor || '#c9d5ec',
                fontSize: 11,
                padding: '8px 16px',
                letterSpacing: 0.4,
              }}
            >
              <Editable id="govBarText" field="govBarText" tag="span" />
            </div>
          )}

          {/* Header */}
          <div
            className="ee-block"
            onClick={() => onSelect?.('header')}
            style={{
              background: design.headerBg,
              color: design.headerText,
              padding: `${design.headerPadding}px ${design.contentPaddingX}px`,
              textAlign: design.align,
            }}
          >
            <div style={{ fontSize: design.logoSize, fontWeight: 600, opacity: 0.9, marginBottom: 6 }}>
              <Editable id="logoText" field="logoText" tag="span" />
            </div>

            {design.showAvatar && (
              <div style={{ margin: '12px 0' }}>
                <ImageZone urlField="avatarUrl" sizeField="avatarSize" shape="circle" />
              </div>
            )}

            <div style={{ fontSize: design.titleSize, fontWeight: 800, lineHeight: 1.15, marginTop: 8 }}>
              <Editable id="title" field="title" multi />
            </div>
            <div style={{ fontSize: design.subtitleSize, opacity: 0.85, marginTop: 6 }}>
              <Editable id="subtitle" field="subtitle" />
            </div>

            <div style={{ marginTop: 14 }}>
              <ImageZone urlField="heroImageUrl" shape="banner" />
            </div>
          </div>

          {/* Hero title */}
          {design.showHero && (
            <div
              className="ee-block"
              onClick={() => onSelect?.('hero')}
              style={{
                padding: `18px ${design.contentPaddingX}px 0`,
                textAlign: design.align,
              }}
            >
              <div style={{
                fontSize: design.heroTitleSize,
                color: design.heroTitleColor,
                fontWeight: 800,
                lineHeight: 1.2,
                whiteSpace: 'pre-wrap',
              }}>
                <Editable id="heroTitle" field="heroTitle" multi />
              </div>
            </div>
          )}

          {/* Body */}
          <div
            className="ee-block"
            onClick={() => onSelect?.('body')}
            style={{
              padding: `18px ${design.contentPaddingX}px`,
              color: design.textColor,
              fontSize: design.bodySize,
              lineHeight: 1.6,
              textAlign: design.align,
              whiteSpace: 'pre-wrap',
            }}
          >
            <Editable id="intro" field="intro" multi />
          </div>

          {/* Card */}
          {design.showCard && (
            <div
              className="ee-block"
              onClick={() => onSelect?.('card')}
              style={{
                margin: `0 ${design.contentPaddingX}px 18px`,
                background: design.cardBg,
                borderRadius: 8,
                padding: 16,
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8, color: design.textColor }}>
                <Editable id="cardTitle" field="cardTitle" />
              </div>
              <div style={{ fontSize: 13, color: design.textColor, lineHeight: 1.6 }}>
                <div><strong>Titular:</strong> {vars.NOME_TITULAR}</div>
                <div><strong>CNPJ:</strong> {vars.CNPJ}</div>
                <div><strong>Situação:</strong> {vars.SITUACAO}</div>
                <div><strong>Município/UF:</strong> {vars.MUNICIPIO}/{vars.UF}</div>
              </div>
            </div>
          )}

          {/* Warning */}
          {design.showWarning && (
            <div
              className="ee-block"
              onClick={() => onSelect?.('warning')}
              style={{
                margin: `0 ${design.contentPaddingX}px 18px`,
                background: design.warningBg,
                border: `1px solid ${design.warningBorder}`,
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 700, color: design.warningTitleColor, marginBottom: 6 }}>
                <Editable id="warningTitle" field="warningTitle" />
              </div>
              <div style={{ color: design.warningTextColor, fontSize: 13, lineHeight: 1.6 }}>
                <Editable id="warningItems" field="warningItems" multi />
                {!items.length && <div className="text-slate-400 italic">Adicione itens, um por linha.</div>}
              </div>
            </div>
          )}

          {/* Button */}
          <div
            className="ee-block"
            onClick={() => onSelect?.('button')}
            style={{ padding: `4px ${design.contentPaddingX}px 24px`, textAlign: 'center' }}
          >
            <span
              contentEditable
              suppressContentEditableWarning
              onFocus={() => { setFocused('buttonLabel'); onSelect?.('button'); }}
              onBlur={(e) => { setFocused(null); set('buttonLabel', htmlToMarkdown(e.currentTarget)); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
              className="ee-editable"
              style={{
                display: 'inline-block',
                background: design.buttonBg,
                color: design.buttonText,
                padding: `${design.buttonPaddingY}px ${design.buttonPaddingX}px`,
                borderRadius: design.buttonRadius,
                fontSize: design.buttonSize,
                fontWeight: 700,
                textDecoration: 'none',
                cursor: 'text',
              }}
              dangerouslySetInnerHTML={{ __html: markdownToHtml(design.buttonLabel) }}
            />
          </div>

          {/* Signature */}
          {design.showSignature && (
            <div
              className="ee-block"
              onClick={() => onSelect?.('signature')}
              style={{
                padding: `0 ${design.contentPaddingX}px 20px`,
                color: design.textColor,
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              <Editable id="signature" field="signature" multi />
            </div>
          )}

          {/* Badges */}
          {design.showBadges && (
            <div
              className="ee-block"
              onClick={() => onSelect?.('badges')}
              style={{
                padding: `10px ${design.contentPaddingX}px`,
                textAlign: 'center',
                fontSize: 11,
                color: design.mutedColor,
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <Editable id="badgesText" field="badgesText" />
            </div>
          )}

          {/* Footer */}
          {design.showFooter && (
            <div
              className="ee-block"
              onClick={() => onSelect?.('footer')}
              style={{
                padding: `14px ${design.contentPaddingX}px 22px`,
                background: '#f8fafc',
                color: design.mutedColor,
                fontSize: 11,
                lineHeight: 1.6,
                textAlign: 'center',
                whiteSpace: 'pre-wrap',
              }}
            >
              <Editable id="disclaimer" field="disclaimer" multi />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ Floating toolbar for the focused field ============ */
function FloatingToolbar({
  fieldKey, design, set,
}: {
  fieldKey: keyof CampaignDesign;
  design: CampaignDesign;
  set: <K extends keyof CampaignDesign>(k: K, v: CampaignDesign[K]) => void;
}) {
  const sizeMap: Partial<Record<keyof CampaignDesign, keyof CampaignDesign>> = {
    title: 'titleSize', subtitle: 'subtitleSize', intro: 'bodySize',
    heroTitle: 'heroTitleSize', buttonLabel: 'buttonSize', logoText: 'logoSize',
  };
  const colorMap: Partial<Record<keyof CampaignDesign, keyof CampaignDesign>> = {
    title: 'headerText', subtitle: 'headerText', intro: 'textColor',
    heroTitle: 'heroTitleColor', buttonLabel: 'buttonText', logoText: 'headerText',
    warningTitle: 'warningTitleColor', warningItems: 'warningTextColor',
    signature: 'textColor', disclaimer: 'mutedColor',
  };
  const sizeField = sizeMap[fieldKey];
  const colorField = colorMap[fieldKey];
  const size = sizeField ? (design[sizeField] as number) : null;
  const color = colorField ? (design[colorField] as string) : null;

  const wrapSelection = (marker: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const text = range.toString();
    range.deleteContents();
    range.insertNode(document.createTextNode(`${marker}${text}${marker}`));
  };

  return (
    <div className="ee-toolbar">
      {size !== null && sizeField && (
        <div className="ee-tool-group">
          <button type="button" onClick={() => set(sizeField, Math.max(8, (size as number) - 1) as any)}>
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="ee-tool-value">{size}px</span>
          <button type="button" onClick={() => set(sizeField, Math.min(60, (size as number) + 1) as any)}>
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {color !== null && colorField && (
        <div className="ee-tool-group">
          <label className="ee-color-swatch" style={{ background: color as string }}>
            <input
              type="color" value={color as string}
              onChange={(e) => set(colorField, e.target.value as any)}
            />
          </label>
          <span className="ee-tool-label">Cor</span>
        </div>
      )}
      <div className="ee-tool-group">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrapSelection('**'); }} title="Negrito na seleção">
          <Bold className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="ee-tool-hint">
        <X className="h-3 w-3" /> Clique fora para salvar
      </div>
    </div>
  );
}

/* ============ helpers ============ */
function substituteEditable(s: string, vars: Record<string, string>) {
  // keep variable markers visible while editing so the user can delete/move them
  return s || '';
}
function markdownToHtml(s: string) {
  const escaped = (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />');
}
function htmlToMarkdown(el: HTMLElement) {
  let html = el.innerHTML;
  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<div>/gi, '\n').replace(/<\/div>/gi, '');
  html = html.replace(/<(strong|b)>(.*?)<\/\1>/gi, '**$2**');
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').replace(/\u00a0/g, ' ');
}

const EE_CSS = `
.ee-root { position: relative; }
.ee-block { position: relative; cursor: pointer; transition: outline .12s; outline: 2px solid transparent; outline-offset: -2px; }
.ee-block:hover { outline: 2px dashed #94a3b8; }
.ee-block:has(.ee-editable:focus) { outline: 2px solid #1652d1; }
.ee-editable { outline: none; min-height: 1em; cursor: text; }
.ee-editable:focus { background: rgba(22,82,209,0.06); box-shadow: inset 0 0 0 1px #1652d1; border-radius: 3px; }
.ee-editable:empty:before { content: attr(data-placeholder); color: #94a3b8; }
.ee-image-zone { position: relative; }
.ee-image-zone:hover .ee-image-overlay { opacity: 1; }
.ee-image-overlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px;
  background: rgba(15,23,42,0.55); opacity: 0; transition: opacity .15s; border-radius: inherit;
}
.ee-btn {
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; font-size: 12px; font-weight: 600;
  background: white; color: #0f172a; border-radius: 6px; border: none; cursor: pointer;
}
.ee-btn-danger { color: #dc2626; }
.ee-image-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  border: 2px dashed #cbd5e1; background: #f8fafc; color: #64748b; font-size: 12px;
  padding: 20px; cursor: pointer; min-height: 90px; width: 100%;
}
.ee-toolbar {
  position: sticky; top: 8px; z-index: 40; margin: 0 auto 8px; max-width: fit-content;
  display: flex; gap: 6px; align-items: center; padding: 6px 8px;
  background: #0f172a; color: white; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.25);
  font-size: 12px;
}
.ee-tool-group { display: flex; align-items: center; gap: 4px; padding: 0 6px; border-right: 1px solid rgba(255,255,255,0.15); }
.ee-tool-group:last-child { border-right: none; }
.ee-tool-group button {
  background: rgba(255,255,255,0.08); border: none; color: white; width: 24px; height: 24px;
  border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
}
.ee-tool-group button:hover { background: rgba(255,255,255,0.18); }
.ee-tool-value { min-width: 34px; text-align: center; font-family: monospace; }
.ee-tool-label { opacity: 0.7; font-size: 11px; }
.ee-color-swatch {
  width: 22px; height: 22px; border-radius: 5px; border: 2px solid white; cursor: pointer;
  display: inline-block; position: relative; overflow: hidden;
}
.ee-color-swatch input { position: absolute; inset: -4px; opacity: 0; cursor: pointer; }
.ee-tool-hint { opacity: 0.65; display: inline-flex; align-items: center; gap: 4px; padding-left: 6px; }
`;
