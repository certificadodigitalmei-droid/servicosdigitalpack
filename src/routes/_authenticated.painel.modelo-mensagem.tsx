import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { Copy, Download, RotateCcw, Save, Smartphone, Monitor, Upload, Info } from 'lucide-react';
import {
  DEFAULT_DESIGN,
  DEFAULT_SUBJECT,
  DEFAULT_PREHEADER,
  renderHtml,
  renderText,
  substitute,
  type CampaignDesign,
} from '@/lib/email-campaign/template';

export const Route = createFileRoute('/_authenticated/painel/modelo-mensagem')({
  component: ModeloMensagem,
});

const STORAGE_KEY = 'campanha:design:v1';
const SUBJECT_KEY = 'campanha:subject:v1';
const PREHEADER_KEY = 'campanha:preheader:v1';

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
  LINK_PUBLICO: 'https://seu-certificado-mei-digital.online/c/exemplo',
  LINK_CHECKOUT: 'https://seu-certificado-mei-digital.online/checkout',
  TOKEN: 'exemplo',
  REFERENCIA: 'REF-000001',
  NOME_REMETENTE: 'Central de Atendimento',
  EMPRESA_REMETENTE: 'Certificado Digital MEI',
};

const VARIABLES: { key: string; label: string; example: string }[] = [
  { key: 'NOME_TITULAR', label: 'Nome do titular do CNPJ', example: 'RAFAEL VALE DA SILVA' },
  { key: 'NOME_EMPRESARIAL', label: 'Nome empresarial (fantasia)', example: 'RAFAEL VALE DA SILVA' },
  { key: 'RAZAO_SOCIAL', label: 'Razão social completa', example: 'RAFAEL VALE DA SILVA' },
  { key: 'CNPJ', label: 'CNPJ formatado (00.000.000/0000-00)', example: '68.087.737/0001-27' },
  { key: 'DATA_ABERTURA', label: 'Data de abertura da empresa', example: '15/03/2024' },
  { key: 'DATA_SITUACAO', label: 'Data da situação cadastral', example: '15/03/2024' },
  { key: 'SITUACAO', label: 'Situação cadastral atual', example: 'CNPJ sem certificado ativo' },
  { key: 'MUNICIPIO', label: 'Município da empresa', example: 'SÃO PAULO' },
  { key: 'UF', label: 'Estado (sigla)', example: 'SP' },
  { key: 'EMAIL', label: 'E-mail cadastrado do destinatário', example: 'exemplo@email.com' },
  { key: 'LINK_PUBLICO', label: 'Link personalizado do destinatário (botão)', example: 'https://.../c/token' },
  { key: 'LINK_CHECKOUT', label: 'Link direto do checkout de pagamento', example: 'https://.../checkout' },
  { key: 'TOKEN', label: 'Token único do link', example: 'abc123' },
  { key: 'REFERENCIA', label: 'Número de referência da campanha', example: 'REF-000001' },
  { key: 'NOME_REMETENTE', label: 'Nome do remetente (assinatura)', example: 'Central de Atendimento' },
  { key: 'EMPRESA_REMETENTE', label: 'Empresa remetente (assinatura)', example: 'Certificado Digital MEI' },
];

function loadDesign(): CampaignDesign {
  if (typeof window === 'undefined') return DEFAULT_DESIGN;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_DESIGN, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_DESIGN;
}

function loadString(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function ModeloMensagem() {
  const [design, setDesign] = useState<CampaignDesign>(loadDesign);
  const [subject, setSubject] = useState<string>(() => loadString(SUBJECT_KEY, DEFAULT_SUBJECT));
  const [preheader, setPreheader] = useState<string>(() => loadString(PREHEADER_KEY, DEFAULT_PREHEADER));
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(design)); } catch {} }, [design]);
  useEffect(() => { try { window.localStorage.setItem(SUBJECT_KEY, subject); } catch {} }, [subject]);
  useEffect(() => { try { window.localStorage.setItem(PREHEADER_KEY, preheader); } catch {} }, [preheader]);

  const set = <K extends keyof CampaignDesign>(k: K, v: CampaignDesign[K]) =>
    setDesign((d) => ({ ...d, [k]: v }));

  const html = renderHtml(design, PREVIEW_VARS);
  const text = renderText(design, PREVIEW_VARS);
  const renderedSubject = substitute(subject, PREVIEW_VARS);
  const renderedPreheader = substitute(preheader, PREVIEW_VARS);

  const resetAll = () => {
    if (!confirm('Restaurar modelo padrão? Suas alterações serão perdidas.')) return;
    setDesign(DEFAULT_DESIGN);
    setSubject(DEFAULT_SUBJECT);
    setPreheader(DEFAULT_PREHEADER);
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
    try {
      await navigator.clipboard.writeText(tag);
      toast.success(`${tag} copiado — cole no campo desejado`);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">Modelo de Mensagem</h1>
          <p className="text-sm text-muted-foreground">
            Edite todos os elementos do e-mail. As alterações são salvas automaticamente e
            aplicadas em <strong>Campanhas de E-mail</strong> e <strong>Envio em Massa</strong>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => {
            try {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
              window.localStorage.setItem(SUBJECT_KEY, subject);
              window.localStorage.setItem(PREHEADER_KEY, preheader);
              toast.success('Modelo salvo — será usado no próximo envio');
            } catch { toast.error('Falha ao salvar no navegador'); }
          }}><Save className="mr-2 h-4 w-4" />Salvar modelo</Button>
          <Button variant="outline" size="sm" onClick={copyHtml}><Copy className="mr-2 h-4 w-4" />Copiar HTML</Button>
          <Button variant="outline" size="sm" onClick={downloadHtml}><Download className="mr-2 h-4 w-4" />Baixar HTML</Button>
          <Button variant="outline" size="sm" onClick={resetAll} className="text-red-600"><RotateCcw className="mr-2 h-4 w-4" />Restaurar padrão</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* ===== Editor ===== */}
        <div className="space-y-3">
          <Accordion type="multiple" defaultValue={['assunto', 'header', 'hero', 'body', 'button']} className="space-y-2">

            <SectionItem value="assunto" title="Assunto e preheader">
              <Field label="Assunto (aparece no Gmail)" hint="Use variáveis do painel à direita, ex: {{NOME_TITULAR}}">
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Preheader (prévia curta na caixa de entrada)">
                <Input value={preheader} onChange={(e) => setPreheader(e.target.value)} />
              </Field>
            </SectionItem>

            <SectionItem value="header" title="Cabeçalho (topo)">
              <Field label="Logo / linha superior (texto)">
                <Input value={design.logoText} onChange={(e) => set('logoText', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <SliderField label="Tamanho logo (px)" min={10} max={22} value={design.logoSize} onChange={(v) => set('logoSize', v)} />
                <SliderField label="Padding topo/base (px)" min={16} max={60} value={design.headerPadding} onChange={(v) => set('headerPadding', v)} />
              </div>
              <Field label="Título principal (H1)">
                <Textarea rows={2} value={design.title} onChange={(e) => set('title', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <SliderField label="Tamanho título (px)" min={18} max={40} value={design.titleSize} onChange={(v) => set('titleSize', v)} />
                <SliderField label="Tamanho subtítulo (px)" min={11} max={20} value={design.subtitleSize} onChange={(v) => set('subtitleSize', v)} />
              </div>
              <Field label="Subtítulo (referência)">
                <Input value={design.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <ColorField label="Fundo cabeçalho" value={design.headerBg} onChange={(v) => set('headerBg', v)} />
                <ColorField label="Texto cabeçalho" value={design.headerText} onChange={(v) => set('headerText', v)} />
              </div>
              <ImageField
                label="Imagem hero (opcional, abaixo do cabeçalho)"
                value={design.heroImageUrl || ''}
                onChange={(v) => set('heroImageUrl', v)}
              />
            </SectionItem>

            <SectionItem value="hero" title="Título grande (bloco central)">
              <ToggleField label="Mostrar bloco" value={design.showHero} onChange={(v) => set('showHero', v)} />
              <Field label="Texto (use \n para quebrar linha, **negrito**)">
                <Textarea rows={2} value={design.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <SliderField label="Tamanho (px)" min={18} max={42} value={design.heroTitleSize} onChange={(v) => set('heroTitleSize', v)} />
                <ColorField label="Cor" value={design.heroTitleColor} onChange={(v) => set('heroTitleColor', v)} />
              </div>
            </SectionItem>

            <SectionItem value="body" title="Corpo do e-mail">
              <Field label="Texto de introdução (suporte a **negrito**)">
                <Textarea rows={5} value={design.intro} onChange={(e) => set('intro', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <SliderField label="Tamanho do corpo (px)" min={12} max={22} value={design.bodySize} onChange={(v) => set('bodySize', v)} />
                <Field label="Alinhamento">
                  <Select value={design.align} onValueChange={(v: any) => set('align', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Esquerda</SelectItem>
                      <SelectItem value="center">Centro</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <ColorField label="Cor do texto" value={design.textColor} onChange={(v) => set('textColor', v)} />
            </SectionItem>

            <SectionItem value="card" title="Card de dados do CNPJ">
              <ToggleField label="Mostrar card" value={design.showCard} onChange={(v) => set('showCard', v)} />
              <Field label="Título do card">
                <Input value={design.cardTitle} onChange={(e) => set('cardTitle', e.target.value)} />
              </Field>
              <ColorField label="Fundo do card" value={design.cardBg} onChange={(v) => set('cardBg', v)} />
            </SectionItem>

            <SectionItem value="warning" title="Bloco de aviso">
              <ToggleField label="Mostrar aviso" value={design.showWarning} onChange={(v) => set('showWarning', v)} />
              <Field label="Título do aviso">
                <Input value={design.warningTitle} onChange={(e) => set('warningTitle', e.target.value)} />
              </Field>
              <Field label="Itens (um por linha)">
                <Textarea rows={4} value={design.warningItems} onChange={(e) => set('warningItems', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <ColorField label="Fundo" value={design.warningBg} onChange={(v) => set('warningBg', v)} />
                <ColorField label="Borda" value={design.warningBorder} onChange={(v) => set('warningBorder', v)} />
                <ColorField label="Cor do título" value={design.warningTitleColor} onChange={(v) => set('warningTitleColor', v)} />
                <ColorField label="Cor do texto" value={design.warningTextColor} onChange={(v) => set('warningTextColor', v)} />
              </div>
            </SectionItem>

            <SectionItem value="button" title="Botão de ação">
              <Field label="Texto do botão">
                <Input value={design.buttonLabel} onChange={(e) => set('buttonLabel', e.target.value)} />
              </Field>
              <Field label="Link (padrão {{LINK_PUBLICO}})">
                <Input value={design.buttonHref} onChange={(e) => set('buttonHref', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <ColorField label="Fundo" value={design.buttonBg} onChange={(v) => set('buttonBg', v)} />
                <ColorField label="Texto" value={design.buttonText} onChange={(v) => set('buttonText', v)} />
                <SliderField label="Tamanho texto (px)" min={12} max={22} value={design.buttonSize} onChange={(v) => set('buttonSize', v)} />
                <SliderField label="Raio das bordas (px)" min={0} max={999} value={design.buttonRadius} onChange={(v) => set('buttonRadius', v)} />
                <SliderField label="Padding vertical (px)" min={8} max={28} value={design.buttonPaddingY} onChange={(v) => set('buttonPaddingY', v)} />
                <SliderField label="Padding horizontal (px)" min={16} max={80} value={design.buttonPaddingX} onChange={(v) => set('buttonPaddingX', v)} />
              </div>
            </SectionItem>

            <SectionItem value="signature" title="Assinatura">
              <ToggleField label="Mostrar assinatura" value={design.showSignature} onChange={(v) => set('showSignature', v)} />
              <Field label="Texto (use ** para negrito)">
                <Textarea rows={3} value={design.signature} onChange={(e) => set('signature', e.target.value)} />
              </Field>
            </SectionItem>

            <SectionItem value="footer" title="Rodapé">
              <ToggleField label="Mostrar rodapé" value={design.showFooter} onChange={(v) => set('showFooter', v)} />
              <Field label="Aviso do rodapé">
                <Textarea rows={2} value={design.disclaimer} onChange={(e) => set('disclaimer', e.target.value)} />
              </Field>
            </SectionItem>

            <SectionItem value="avatar" title="Avatar circular (topo)">
              <ToggleField label="Mostrar avatar" value={!!design.showAvatar} onChange={(v) => set('showAvatar', v)} />
              <ImageField label="Imagem do avatar" value={design.avatarUrl || ''} onChange={(v) => set('avatarUrl', v)} />
              <SliderField label="Tamanho (px)" min={40} max={110} value={design.avatarSize || 64} onChange={(v) => set('avatarSize', v)} />
            </SectionItem>

            <SectionItem value="govbar" title="Faixa superior (breadcrumb)">
              <ToggleField label="Mostrar faixa" value={!!design.showGovBar} onChange={(v) => set('showGovBar', v)} />
              <Field label="Texto">
                <Input value={design.govBarText || ''} onChange={(e) => set('govBarText', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <ColorField label="Fundo" value={design.govBarBg || '#071d40'} onChange={(v) => set('govBarBg', v)} />
                <ColorField label="Texto" value={design.govBarColor || '#c9d5ec'} onChange={(v) => set('govBarColor', v)} />
              </div>
            </SectionItem>

            <SectionItem value="badges" title="Selos de confiança (rodapé)">
              <ToggleField label="Mostrar selos" value={!!design.showBadges} onChange={(v) => set('showBadges', v)} />
              <Field label="Texto (separe por · )">
                <Input value={design.badgesText || ''} onChange={(e) => set('badgesText', e.target.value)} />
              </Field>
            </SectionItem>

            <SectionItem value="layout" title="Layout geral">
              <div className="grid grid-cols-2 gap-3">
                <SliderField label="Largura (px)" min={480} max={800} step={20} value={design.containerWidth} onChange={(v) => set('containerWidth', v)} />
                <SliderField label="Padding lateral (px)" min={16} max={60} value={design.contentPaddingX} onChange={(v) => set('contentPaddingX', v)} />
                <ColorField label="Fundo do conteúdo" value={design.bodyBg} onChange={(v) => set('bodyBg', v)} />
                <ColorField label="Fundo da página" value={design.pageBg} onChange={(v) => set('pageBg', v)} />
              </div>
            </SectionItem>
          </Accordion>

          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded border border-emerald-200 p-2">
            <Save className="h-3 w-3" /> Alterações salvas automaticamente no navegador.
          </div>
        </div>

        {/* ===== Painel de variáveis ===== */}
        <div className="space-y-3">
          <Card className="lg:sticky lg:top-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4 text-brand-navy" />
                Variáveis disponíveis
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Clique em uma variável para copiar. Cole em qualquer campo de texto acima.
                No envio, cada variável é substituída pelos dados reais do destinatário.
              </p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="max-h-[520px] overflow-auto space-y-1.5 pr-1">
                {VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => copyVar(v.key)}
                    className="w-full text-left rounded-md border border-slate-200 bg-white p-2 hover:border-brand-navy hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-[11px] font-mono font-bold text-brand-navy break-all">
                        {`{{${v.key}}}`}
                      </code>
                      <Copy className="h-3 w-3 text-slate-400 group-hover:text-brand-navy shrink-0" />
                    </div>
                    <div className="text-[11px] text-slate-700 mt-0.5 leading-snug">{v.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 italic truncate">
                      ex: {v.example}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== Prévia ao vivo (largura total, embaixo) ===== */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Prévia ao vivo</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant={viewport === 'desktop' ? 'default' : 'outline'} onClick={() => setViewport('desktop')}>
              <Monitor className="h-4 w-4 mr-1" /> Desktop
            </Button>
            <Button size="sm" variant={viewport === 'mobile' ? 'default' : 'outline'} onClick={() => setViewport('mobile')}>
              <Smartphone className="h-4 w-4 mr-1" /> Mobile
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-xs mb-3 space-y-0.5 rounded border bg-slate-50 p-2">
            <div><strong>Assunto:</strong> {renderedSubject}</div>
            <div className="text-muted-foreground italic"><strong>Preheader:</strong> {renderedPreheader}</div>
          </div>
          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">Prévia</TabsTrigger>
              <TabsTrigger value="html">HTML</TabsTrigger>
              <TabsTrigger value="text">Texto</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <div className="bg-slate-100 p-4 rounded border flex justify-center overflow-auto">
                {viewport === 'desktop' ? (
                  <div className="relative bg-white shadow-sm" style={{ width: design.containerWidth, height: 1000, maxWidth: '100%' }}>
                    <iframe title="prévia" srcDoc={html} className="border-none bg-white w-full h-full" />
                  </div>
                ) : (
                  <div className="bg-white rounded-[32px] shadow-xl overflow-hidden border-[8px] border-slate-800 w-[380px] h-[720px] relative">
                    <div className="h-6 w-32 bg-slate-800 absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xl z-10" />
                    <iframe title="prévia-mobile" srcDoc={html} className="w-full h-full border-none pt-6" />
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="html">
              <Textarea readOnly value={html} className="h-[600px] font-mono text-xs" />
            </TabsContent>
            <TabsContent value="text">
              <Textarea readOnly value={text} className="h-[600px] font-mono text-xs" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionItem({ value, title, children }: { value: string; title: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={value} className="border rounded-md bg-white px-3">
      <AccordionTrigger className="text-sm font-semibold">{title}</AccordionTrigger>
      <AccordionContent className="space-y-3 pt-2">{children}</AccordionContent>
    </AccordionItem>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded border p-2 bg-slate-50">
      <Label className="text-xs cursor-pointer">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 rounded border cursor-pointer" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}

function SliderField({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast.error('Imagem muito grande. Use até 500KB (para não pesar no e-mail).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(String(reader.result || ''));
      toast.success('Imagem carregada');
    };
    reader.onerror = () => toast.error('Falha ao ler a imagem');
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        {value ? (
          <img src={value} alt="" className="h-12 w-12 rounded border object-cover bg-slate-50" />
        ) : (
          <div className="h-12 w-12 rounded border bg-slate-50 flex items-center justify-center text-[10px] text-muted-foreground">sem imagem</div>
        )}
        <div className="flex-1 flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" type="button" onClick={() => inputRef.current?.click()} className="h-8 text-xs">
              <Upload className="h-3 w-3 mr-1" /> Enviar
            </Button>
            {value && (
              <Button size="sm" variant="outline" type="button" onClick={() => onChange('')} className="h-8 text-xs text-red-600">
                Remover
              </Button>
            )}
          </div>
        </div>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ou cole uma URL: https://..."
        className="text-xs"
      />
    </div>
  );
}
