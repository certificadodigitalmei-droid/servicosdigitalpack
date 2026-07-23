import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Copy, Download, RotateCcw, Save, Smartphone, Monitor, Upload, Info,
  AlignLeft, AlignCenter, Type, Image as ImageIcon, MousePointerClick,
  LayoutTemplate, PanelTop, MessageSquare, ShieldAlert, PenLine, Layers,
  User as UserIcon, Ribbon, Award, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  DEFAULT_DESIGN,
  DEFAULT_SUBJECT,
  DEFAULT_PREHEADER,
  renderHtml,
  renderText,
  substitute,
  type CampaignDesign,
} from '@/lib/email-campaign/template';
import { InteractivePreview } from '@/components/email-editor/InteractivePreview';

export const Route = createFileRoute('/_authenticated/painel/modelo-mensagem')({
  component: ModeloMensagem,
  head: () => ({
    meta: [
      { title: 'Editor de E-mail — Central MEI Digital' },
      { name: 'description', content: 'Personalize seu modelo de e-mail com um editor visual.' },
    ],
  }),
});

const STORAGE_KEY = 'campanha:design:v1';
const SUBJECT_KEY = 'campanha:subject:v1';
const PREHEADER_KEY = 'campanha:preheader:v1';
const FROM_NAME_KEY = 'campanha:fromName:v1';
const FROM_ADDRESS_KEY = 'campanha:fromAddress:v1';
const REPLY_TO_KEY = 'campanha:replyTo:v1';

const DEFAULT_FROM_NAME = 'Certificado Digital MEI';
const DEFAULT_FROM_ADDRESS = 'certificado.mei.estadual@seu-certificado-mei-digital.online';


const PREVIEW_VARS: Record<string, string> = {
  NOME_EMPRESARIAL: 'RAFAEL VALE DA SILVA',
  RAZAO_SOCIAL: 'RAFAEL VALE DA SILVA',
  NOME_TITULAR: 'RAFAEL VALE DA SILVA',
  CNPJ: '68087737000127',
  DATA_ABERTURA: '15/03/2024',
  DATA_SITUACAO: '15/03/2024',
  SITUACAO: 'CNPJ sem certificado ativo',
  MUNICIPIO: 'SÃO PAULO',
  UF: 'SP',
  EMAIL: 'exemplo@email.com',
  LINK_PUBLICO: 'https://exemplo.com/c/exemplo',
  LINK_CHECKOUT: 'https://exemplo.com/checkout',
  TOKEN: 'exemplo',
  REFERENCIA: 'REF-000001',
  NOME_REMETENTE: 'Central de Atendimento',
  EMPRESA_REMETENTE: 'Certificado Digital MEI',
};

const VARIABLES: { key: string; label: string; example: string }[] = [
  { key: 'NOME_TITULAR', label: 'Nome do titular do CNPJ', example: 'RAFAEL VALE DA SILVA' },
  { key: 'NOME_EMPRESARIAL', label: 'Nome empresarial', example: 'RAFAEL VALE DA SILVA' },
  { key: 'RAZAO_SOCIAL', label: 'Razão social', example: 'RAFAEL VALE DA SILVA' },
  { key: 'CNPJ', label: 'CNPJ formatado', example: '68.087.737/0001-27' },
  { key: 'DATA_ABERTURA', label: 'Data de abertura', example: '15/03/2024' },
  { key: 'DATA_SITUACAO', label: 'Data da situação', example: '15/03/2024' },
  { key: 'SITUACAO', label: 'Situação cadastral', example: 'CNPJ sem certificado ativo' },
  { key: 'MUNICIPIO', label: 'Município', example: 'SÃO PAULO' },
  { key: 'UF', label: 'Estado (UF)', example: 'SP' },
  { key: 'EMAIL', label: 'E-mail do destinatário', example: 'exemplo@email.com' },
  { key: 'LINK_PUBLICO', label: 'Link personalizado (botão)', example: 'https://.../c/token' },
  { key: 'LINK_CHECKOUT', label: 'Link do checkout', example: 'https://.../checkout' },
  { key: 'TOKEN', label: 'Token único', example: 'abc123' },
  { key: 'REFERENCIA', label: 'Nº de referência', example: 'REF-000001' },
  { key: 'NOME_REMETENTE', label: 'Nome do remetente', example: 'Central de Atendimento' },
  { key: 'EMPRESA_REMETENTE', label: 'Empresa remetente', example: 'Certificado Digital MEI' },
];

type SectionId =
  | 'assunto' | 'govbar' | 'header' | 'avatar' | 'hero' | 'body'
  | 'card' | 'warning' | 'button' | 'signature' | 'badges' | 'footer' | 'layout';

const SECTIONS: { id: SectionId; label: string; icon: typeof Type }[] = [
  { id: 'assunto',   label: 'Assunto',       icon: MessageSquare },
  { id: 'govbar',    label: 'Faixa topo',    icon: Ribbon },
  { id: 'header',    label: 'Cabeçalho',     icon: PanelTop },
  { id: 'avatar',    label: 'Avatar',        icon: UserIcon },
  { id: 'hero',      label: 'Título grande', icon: Type },
  { id: 'body',      label: 'Texto',         icon: PenLine },
  { id: 'card',      label: 'Card CNPJ',     icon: LayoutTemplate },
  { id: 'warning',   label: 'Aviso',         icon: ShieldAlert },
  { id: 'button',    label: 'Botão',         icon: MousePointerClick },
  { id: 'signature', label: 'Assinatura',    icon: PenLine },
  { id: 'badges',    label: 'Selos',         icon: Award },
  { id: 'footer',    label: 'Rodapé',        icon: Layers },
  { id: 'layout',    label: 'Layout',        icon: LayoutTemplate },
];

const COLOR_PRESETS = [
  '#0b3a8a', '#071d40', '#1652d1', '#2563eb', '#0ea5e9',
  '#059669', '#16a34a', '#eab308', '#f59e0b', '#f97316',
  '#dc2626', '#be123c', '#7c3aed', '#111827', '#374151',
  '#6b7280', '#9ca3af', '#e5e7eb', '#f3f4f6', '#ffffff',
];

function loadDesign(): CampaignDesign {
  if (typeof window === 'undefined') return DEFAULT_DESIGN;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_DESIGN, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_DESIGN;
}
function loadStr(key: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  try { return window.localStorage.getItem(key) || fb; } catch { return fb; }
}

function ModeloMensagem() {
  const [design, setDesign] = useState<CampaignDesign>(loadDesign);
  const [subject, setSubject] = useState(() => loadStr(SUBJECT_KEY, DEFAULT_SUBJECT));
  const [preheader, setPreheader] = useState(() => loadStr(PREHEADER_KEY, DEFAULT_PREHEADER));
  const [fromName, setFromName] = useState(() => loadStr(FROM_NAME_KEY, DEFAULT_FROM_NAME));
  const [fromAddress, setFromAddress] = useState(() => loadStr(FROM_ADDRESS_KEY, DEFAULT_FROM_ADDRESS));
  const [replyTo, setReplyTo] = useState(() => loadStr(REPLY_TO_KEY, ''));
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [selected, setSelected] = useState<SectionId>('header');
  const [zoom, setZoom] = useState(0.85);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);

  useEffect(() => { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(design)); } catch {} }, [design]);
  useEffect(() => { try { window.localStorage.setItem(SUBJECT_KEY, subject); } catch {} }, [subject]);
  useEffect(() => { try { window.localStorage.setItem(PREHEADER_KEY, preheader); } catch {} }, [preheader]);
  useEffect(() => { try { window.localStorage.setItem(FROM_NAME_KEY, fromName); } catch {} }, [fromName]);
  useEffect(() => { try { window.localStorage.setItem(FROM_ADDRESS_KEY, fromAddress); } catch {} }, [fromAddress]);
  useEffect(() => { try { window.localStorage.setItem(REPLY_TO_KEY, replyTo); } catch {} }, [replyTo]);


  const set = <K extends keyof CampaignDesign>(k: K, v: CampaignDesign[K]) =>
    setDesign((d) => ({ ...d, [k]: v }));

  const html = useMemo(() => renderHtml(design, PREVIEW_VARS), [design]);
  const text = useMemo(() => renderText(design, PREVIEW_VARS), [design]);
  const renderedSubject = substitute(subject, PREVIEW_VARS);
  const renderedPreheader = substitute(preheader, PREVIEW_VARS);

  const resetAll = () => {
    if (!confirm('Restaurar modelo padrão? Suas alterações serão perdidas.')) return;
    setDesign(DEFAULT_DESIGN); setSubject(DEFAULT_SUBJECT); setPreheader(DEFAULT_PREHEADER);
    toast.success('Modelo restaurado');
  };
  const copyHtml = async () => { await navigator.clipboard.writeText(html); toast.success('HTML copiado'); };
  const downloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo-email.html';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const copyVar = async (key: string) => {
    const tag = `{{${key}}}`;
    try { await navigator.clipboard.writeText(tag); toast.success(`${tag} copiado`); }
    catch { toast.error('Não foi possível copiar'); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-4 md:-m-6 bg-slate-100">
      {/* ===== Top bar ===== */}
      <div className="flex items-center gap-2 border-b bg-white px-4 py-2.5 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-brand-navy leading-tight">Editor de E-mail</div>
          <div className="text-[11px] text-muted-foreground truncate">
            Personalize tudo · Salva automaticamente · Aplicado em Campanhas e Envio em Massa
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1 rounded-md border bg-slate-50 p-0.5">
          <Button size="sm" variant={viewport === 'desktop' ? 'default' : 'ghost'} className="h-7 px-2" onClick={() => setViewport('desktop')}>
            <Monitor className="h-3.5 w-3.5 mr-1" /> Desktop
          </Button>
          <Button size="sm" variant={viewport === 'mobile' ? 'default' : 'ghost'} className="h-7 px-2" onClick={() => setViewport('mobile')}>
            <Smartphone className="h-3.5 w-3.5 mr-1" /> Mobile
          </Button>
        </div>
        <div className="hidden md:flex items-center gap-1 rounded-md border bg-slate-50 p-0.5">
          <button className="px-1.5 py-1 text-xs hover:bg-white rounded" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}>−</button>
          <div className="text-[11px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</div>
          <button className="px-1.5 py-1 text-xs hover:bg-white rounded" onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}>+</button>
        </div>
        <Button size="sm" variant="outline" onClick={copyHtml} className="hidden lg:inline-flex"><Copy className="mr-1.5 h-3.5 w-3.5" />HTML</Button>
        <Button size="sm" variant="outline" onClick={downloadHtml} className="hidden lg:inline-flex"><Download className="mr-1.5 h-3.5 w-3.5" />Baixar</Button>
        <Button size="sm" variant="outline" onClick={resetAll} className="text-red-600"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Restaurar</Button>
        <Button size="sm" onClick={() => toast.success('Modelo salvo — pronto para envio')}>
          <Save className="mr-1.5 h-3.5 w-3.5" />Salvar
        </Button>
      </div>

      {/* ===== 3-column workspace ===== */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left rail — sections */}
        <div className={`shrink-0 border-r bg-white transition-all ${showLeft ? 'w-56' : 'w-10'}`}>
          <button
            className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-slate-600 border-b hover:bg-slate-50"
            onClick={() => setShowLeft((v) => !v)}
          >
            {showLeft && <span>SEÇÕES</span>}
            {showLeft ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {showLeft && (
            <div className="p-1.5 space-y-0.5 overflow-y-auto max-h-[calc(100vh-9rem)]">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = selected === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition
                      ${active ? 'bg-brand-navy text-white font-semibold shadow-sm'
                              : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? 'text-white' : 'text-brand-navy'}`} />
                    <span className="flex-1 truncate">{s.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Center canvas */}
        <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-3">
          <div className="w-full max-w-3xl rounded-md border bg-white px-3 py-2 shadow-sm text-xs flex flex-wrap gap-x-4 gap-y-1">
            <div><span className="text-muted-foreground">Assunto: </span><strong>{renderedSubject}</strong></div>
            <div className="text-muted-foreground italic truncate">Prévia: {renderedPreheader}</div>
          </div>

          {viewport === 'desktop' ? (
            <div
              className="bg-white shadow-xl origin-top transition-transform"
              style={{
                width: design.containerWidth,
                transform: `scale(${zoom})`,
              }}
            >
              <InteractivePreview
                design={design}
                set={set}
                vars={PREVIEW_VARS}
                onSelect={(id) => {
                  const map: Record<string, SectionId> = {
                    govBarText: 'govbar', govbar: 'govbar',
                    header: 'header', logoText: 'header', title: 'header', subtitle: 'header',
                    hero: 'hero', heroTitle: 'hero',
                    body: 'body', intro: 'body',
                    card: 'card', cardTitle: 'card',
                    warning: 'warning', warningTitle: 'warning', warningItems: 'warning',
                    button: 'button', buttonLabel: 'button',
                    signature: 'signature',
                    badges: 'badges', badgesText: 'badges',
                    footer: 'footer', disclaimer: 'footer',
                  };
                  if (map[id]) setSelected(map[id]);
                }}
              />
            </div>
          ) : (
            <div
              className="bg-white rounded-[36px] shadow-2xl overflow-hidden border-[10px] border-slate-900 w-[380px] h-[760px] relative origin-top"
              style={{ transform: `scale(${zoom})`, marginBottom: `${760 * (zoom - 1)}px` }}
            >
              <div className="h-6 w-32 bg-slate-900 absolute top-0 left-1/2 -translate-x-1/2 rounded-b-2xl z-10" />
              <iframe title="prévia-mobile" srcDoc={html} className="w-full h-full border-none pt-6" />
            </div>
          )}

          <Tabs defaultValue="none" className="w-full max-w-3xl">
            <TabsList className="h-8">
              <TabsTrigger value="none" className="text-xs">Prévia</TabsTrigger>
              <TabsTrigger value="html" className="text-xs">HTML</TabsTrigger>
              <TabsTrigger value="text" className="text-xs">Texto</TabsTrigger>
            </TabsList>
            <TabsContent value="none" />
            <TabsContent value="html"><Textarea readOnly value={html} className="h-64 font-mono text-[11px]" /></TabsContent>
            <TabsContent value="text"><Textarea readOnly value={text} className="h-64 font-mono text-[11px]" /></TabsContent>
          </Tabs>
        </div>

        {/* Right rail — properties + variables */}
        <div className={`shrink-0 border-l bg-white transition-all ${showRight ? 'w-80' : 'w-10'}`}>
          <button
            className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-slate-600 border-b hover:bg-slate-50"
            onClick={() => setShowRight((v) => !v)}
          >
            {showRight ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            {showRight && <span>PROPRIEDADES</span>}
          </button>
          {showRight && (
            <div className="overflow-y-auto max-h-[calc(100vh-9rem)]">
              <div className="p-3 border-b bg-gradient-to-b from-slate-50 to-white">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Editando</div>
                <div className="text-sm font-bold text-brand-navy">
                  {SECTIONS.find((s) => s.id === selected)?.label}
                </div>
              </div>

              <div className="p-3 space-y-3">
                <SectionEditor selected={selected} design={design} set={set}
                  subject={subject} setSubject={setSubject}
                  preheader={preheader} setPreheader={setPreheader} />
              </div>

              {/* Variables palette */}
              <div className="border-t p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Info className="h-3.5 w-3.5 text-brand-navy" />
                  <div className="text-xs font-semibold text-brand-navy">Variáveis</div>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Clique para copiar e cole em qualquer campo de texto.
                </p>
                <div className="space-y-1">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key} type="button" onClick={() => copyVar(v.key)}
                      className="w-full text-left rounded-md border border-slate-200 bg-white p-1.5 hover:border-brand-navy hover:bg-slate-50 transition group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-[10px] font-mono font-bold text-brand-navy">{`{{${v.key}}}`}</code>
                        <Copy className="h-3 w-3 text-slate-400 group-hover:text-brand-navy shrink-0" />
                      </div>
                      <div className="text-[10px] text-slate-700 leading-snug">{v.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Contextual editor per section
   ============================================================ */
function SectionEditor({
  selected, design, set, subject, setSubject, preheader, setPreheader,
}: {
  selected: SectionId;
  design: CampaignDesign;
  set: <K extends keyof CampaignDesign>(k: K, v: CampaignDesign[K]) => void;
  subject: string; setSubject: (v: string) => void;
  preheader: string; setPreheader: (v: string) => void;
}) {
  switch (selected) {
    case 'assunto':
      return (
        <>
          <FieldText label="Assunto" hint="Aparece na caixa de entrada" value={subject} onChange={setSubject} />
          <FieldText label="Preheader" hint="Prévia curta ao lado do assunto" value={preheader} onChange={setPreheader} />
        </>
      );
    case 'govbar':
      return (
        <>
          <ToggleRow label="Mostrar faixa" value={!!design.showGovBar} onChange={(v) => set('showGovBar', v)} />
          <FieldText label="Texto" value={design.govBarText || ''} onChange={(v) => set('govBarText', v)} />
          <ColorRow label="Fundo" value={design.govBarBg || '#071d40'} onChange={(v) => set('govBarBg', v)} />
          <ColorRow label="Texto" value={design.govBarColor || '#c9d5ec'} onChange={(v) => set('govBarColor', v)} />
        </>
      );
    case 'header':
      return (
        <>
          <FieldText label="Logo / linha superior" value={design.logoText} onChange={(v) => set('logoText', v)} />
          <SliderRow label="Tamanho logo" unit="px" min={10} max={22} value={design.logoSize} onChange={(v) => set('logoSize', v)} />
          <SliderRow label="Padding topo/base" unit="px" min={16} max={60} value={design.headerPadding} onChange={(v) => set('headerPadding', v)} />
          <FieldTextarea label="Título principal (H1)" rows={2} value={design.title} onChange={(v) => set('title', v)} />
          <SliderRow label="Tamanho título" unit="px" min={18} max={40} value={design.titleSize} onChange={(v) => set('titleSize', v)} />
          <FieldText label="Subtítulo" value={design.subtitle} onChange={(v) => set('subtitle', v)} />
          <SliderRow label="Tamanho subtítulo" unit="px" min={11} max={20} value={design.subtitleSize} onChange={(v) => set('subtitleSize', v)} />
          <ColorRow label="Fundo cabeçalho" value={design.headerBg} onChange={(v) => set('headerBg', v)} />
          <ColorRow label="Cor do texto" value={design.headerText} onChange={(v) => set('headerText', v)} />
          <ImageRow label="Imagem hero (abaixo do cabeçalho)" value={design.heroImageUrl || ''} onChange={(v) => set('heroImageUrl', v)} />
        </>
      );
    case 'avatar':
      return (
        <>
          <ToggleRow label="Mostrar avatar" value={!!design.showAvatar} onChange={(v) => set('showAvatar', v)} />
          <ImageRow label="Imagem circular" value={design.avatarUrl || ''} onChange={(v) => set('avatarUrl', v)} />
          <SliderRow label="Tamanho" unit="px" min={40} max={110} value={design.avatarSize || 64} onChange={(v) => set('avatarSize', v)} />
        </>
      );
    case 'hero':
      return (
        <>
          <ToggleRow label="Mostrar bloco" value={design.showHero} onChange={(v) => set('showHero', v)} />
          <FieldTextarea label="Texto (use ** para negrito)" rows={3} value={design.heroTitle} onChange={(v) => set('heroTitle', v)} />
          <SliderRow label="Tamanho" unit="px" min={18} max={42} value={design.heroTitleSize} onChange={(v) => set('heroTitleSize', v)} />
          <ColorRow label="Cor" value={design.heroTitleColor} onChange={(v) => set('heroTitleColor', v)} />
        </>
      );
    case 'body':
      return (
        <>
          <FieldTextarea label="Texto (suporta **negrito**)" rows={6} value={design.intro} onChange={(v) => set('intro', v)} />
          <SliderRow label="Tamanho do texto" unit="px" min={12} max={22} value={design.bodySize} onChange={(v) => set('bodySize', v)} />
          <AlignRow value={design.align} onChange={(v) => set('align', v)} />
          <ColorRow label="Cor do texto" value={design.textColor} onChange={(v) => set('textColor', v)} />
        </>
      );
    case 'card':
      return (
        <>
          <ToggleRow label="Mostrar card" value={design.showCard} onChange={(v) => set('showCard', v)} />
          <FieldText label="Título do card" value={design.cardTitle} onChange={(v) => set('cardTitle', v)} />
          <ColorRow label="Fundo do card" value={design.cardBg} onChange={(v) => set('cardBg', v)} />
        </>
      );
    case 'warning':
      return (
        <>
          <ToggleRow label="Mostrar aviso" value={design.showWarning} onChange={(v) => set('showWarning', v)} />
          <FieldText label="Título" value={design.warningTitle} onChange={(v) => set('warningTitle', v)} />
          <FieldTextarea label="Itens (um por linha)" rows={4} value={design.warningItems} onChange={(v) => set('warningItems', v)} />
          <ColorRow label="Fundo" value={design.warningBg} onChange={(v) => set('warningBg', v)} />
          <ColorRow label="Borda" value={design.warningBorder} onChange={(v) => set('warningBorder', v)} />
          <ColorRow label="Cor do título" value={design.warningTitleColor} onChange={(v) => set('warningTitleColor', v)} />
          <ColorRow label="Cor do texto" value={design.warningTextColor} onChange={(v) => set('warningTextColor', v)} />
        </>
      );
    case 'button':
      return (
        <>
          <FieldText label="Texto do botão" value={design.buttonLabel} onChange={(v) => set('buttonLabel', v)} />
          <FieldText label="Link" value={design.buttonHref} onChange={(v) => set('buttonHref', v)} />
          <ColorRow label="Cor de fundo" value={design.buttonBg} onChange={(v) => set('buttonBg', v)} />
          <ColorRow label="Cor do texto" value={design.buttonText} onChange={(v) => set('buttonText', v)} />
          <SliderRow label="Tamanho do texto" unit="px" min={12} max={22} value={design.buttonSize} onChange={(v) => set('buttonSize', v)} />
          <SliderRow label="Arredondamento" unit="px" min={0} max={999} value={design.buttonRadius} onChange={(v) => set('buttonRadius', v)} />
          <SliderRow label="Altura (padding vertical)" unit="px" min={8} max={28} value={design.buttonPaddingY} onChange={(v) => set('buttonPaddingY', v)} />
          <SliderRow label="Largura (padding horizontal)" unit="px" min={16} max={80} value={design.buttonPaddingX} onChange={(v) => set('buttonPaddingX', v)} />
        </>
      );
    case 'signature':
      return (
        <>
          <ToggleRow label="Mostrar assinatura" value={design.showSignature} onChange={(v) => set('showSignature', v)} />
          <FieldTextarea label="Texto (use ** para negrito)" rows={3} value={design.signature} onChange={(v) => set('signature', v)} />
        </>
      );
    case 'badges':
      return (
        <>
          <ToggleRow label="Mostrar selos" value={!!design.showBadges} onChange={(v) => set('showBadges', v)} />
          <FieldText label="Texto (separe por · )" value={design.badgesText || ''} onChange={(v) => set('badgesText', v)} />
        </>
      );
    case 'footer':
      return (
        <>
          <ToggleRow label="Mostrar rodapé" value={design.showFooter} onChange={(v) => set('showFooter', v)} />
          <FieldTextarea label="Aviso do rodapé" rows={3} value={design.disclaimer} onChange={(v) => set('disclaimer', v)} />
        </>
      );
    case 'layout':
      return (
        <>
          <SliderRow label="Largura" unit="px" min={480} max={800} step={20} value={design.containerWidth} onChange={(v) => set('containerWidth', v)} />
          <SliderRow label="Padding lateral" unit="px" min={16} max={60} value={design.contentPaddingX} onChange={(v) => set('contentPaddingX', v)} />
          <ColorRow label="Fundo do conteúdo" value={design.bodyBg} onChange={(v) => set('bodyBg', v)} />
          <ColorRow label="Fundo da página" value={design.pageBg} onChange={(v) => set('pageBg', v)} />
        </>
      );
  }
}

/* ============================================================
   Reusable controls
   ============================================================ */
function FieldText({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-slate-700">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
function FieldTextarea({ label, rows = 3, value, onChange }: { label: string; rows?: number; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-slate-700">{label}</Label>
      <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="text-sm" />
    </div>
  );
}
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-slate-50 px-2.5 py-1.5">
      <Label className="text-xs cursor-pointer">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
function SliderRow({ label, min, max, step = 1, unit, value, onChange }:
  { label: string; min: number; max: number; step?: number; unit?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold text-slate-700">{label}</Label>
        <span className="text-[11px] font-mono text-slate-500">{value}{unit}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-slate-700">{label}</Label>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="h-8 w-10 rounded border shadow-sm shrink-0"
          style={{ background: value }}
          aria-label="Escolher cor"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs h-8" />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 rounded border cursor-pointer p-0" />
      </div>
      {open && (
        <div className="grid grid-cols-10 gap-1 p-2 rounded-md border bg-white shadow-inner">
          {COLOR_PRESETS.map((c) => (
            <button key={c} type="button" title={c}
              onClick={() => { onChange(c); setOpen(false); }}
              className="h-5 w-5 rounded border hover:ring-2 hover:ring-brand-navy"
              style={{ background: c }} />
          ))}
        </div>
      )}
    </div>
  );
}
function AlignRow({ value, onChange }: { value: 'left' | 'center'; onChange: (v: 'left' | 'center') => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-slate-700">Alinhamento</Label>
      <div className="flex gap-1 rounded-md border bg-slate-50 p-0.5">
        <Button size="sm" variant={value === 'left' ? 'default' : 'ghost'} className="h-7 flex-1" onClick={() => onChange('left')}>
          <AlignLeft className="h-3.5 w-3.5 mr-1" /> Esquerda
        </Button>
        <Button size="sm" variant={value === 'center' ? 'default' : 'ghost'} className="h-7 flex-1" onClick={() => onChange('center')}>
          <AlignCenter className="h-3.5 w-3.5 mr-1" /> Centro
        </Button>
      </div>
    </div>
  );
}
function ImageRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 500 * 1024) { toast.error('Imagem muito grande (limite 500KB para e-mail)'); return; }
    const r = new FileReader();
    r.onload = () => { onChange(String(r.result || '')); toast.success('Imagem carregada'); };
    r.onerror = () => toast.error('Falha ao ler a imagem');
    r.readAsDataURL(file);
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold text-slate-700">{label}</Label>
      <div
        className="rounded-md border-2 border-dashed bg-slate-50 hover:bg-slate-100 transition cursor-pointer p-3 flex items-center gap-2"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
      >
        {value ? (
          <img src={value} alt="" className="h-14 w-14 rounded object-cover border bg-white shrink-0" />
        ) : (
          <div className="h-14 w-14 rounded border bg-white flex items-center justify-center shrink-0">
            <ImageIcon className="h-5 w-5 text-slate-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-700">
            {value ? 'Trocar imagem' : 'Clique ou arraste'}
          </div>
          <div className="text-[10px] text-muted-foreground">PNG, JPG · até 500KB</div>
        </div>
        <Upload className="h-4 w-4 text-slate-400" />
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])} />
      <div className="flex gap-1.5">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="ou cole URL: https://..." className="text-xs h-7" />
        {value && (
          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 shrink-0" onClick={() => onChange('')}>
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
