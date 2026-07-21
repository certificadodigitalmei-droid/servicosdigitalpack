import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
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
import { Copy, Download, RotateCcw, Save, Smartphone, Monitor, Check, Sparkles } from 'lucide-react';
import {
  DEFAULT_DESIGN,
  DEFAULT_SUBJECT,
  DEFAULT_PREHEADER,
  renderHtml,
  renderText,
  substitute,
  type CampaignDesign,
} from '@/lib/email-campaign/template';
import { PRESETS } from '@/lib/email-campaign/presets';


export const Route = createFileRoute('/_authenticated/painel/modelo-mensagem')({
  component: ModeloMensagem,
});

const STORAGE_KEY = 'campanha:design:v1';
const SUBJECT_KEY = 'campanha:subject:v1';
const PREHEADER_KEY = 'campanha:preheader:v1';

// Dados fictícios para prévia
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
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setDesign({ ...DEFAULT_DESIGN, ...p.design });
    setSubject(p.subject);
    setPreheader(p.preheader);
    setSelectedPreset(id);
    toast.success(`Modelo "${p.name}" aplicado — clique em Salvar para usar nos envios`);
  };


  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(design)); } catch {}
  }, [design]);
  useEffect(() => {
    try { window.localStorage.setItem(SUBJECT_KEY, subject); } catch {}
  }, [subject]);
  useEffect(() => {
    try { window.localStorage.setItem(PREHEADER_KEY, preheader); } catch {}
  }, [preheader]);

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

  const copyHtml = async () => {
    await navigator.clipboard.writeText(html);
    toast.success('HTML copiado');
  };

  const downloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-email.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">Modelo de Mensagem</h1>
          <p className="text-sm text-muted-foreground">
            Editor completo do e-mail. Cada mudança é salva automaticamente no navegador
            e aplicada em <strong>Campanhas de E-mail</strong> e <strong>Envio em Massa</strong>.
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

      {/* ===== Galeria de Modelos Prontos ===== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-navy" />
            Galeria de modelos prontos
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Clique em um modelo para aplicar. Depois clique em <strong>Salvar modelo</strong> para usar nos envios.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRESETS.map((p) => {
              const previewHtml = renderHtml(p.design, PREVIEW_VARS);
              const active = selectedPreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`group text-left rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg ${active ? 'border-brand-navy ring-2 ring-brand-navy/30' : 'border-slate-200 hover:border-slate-400'}`}
                >
                  <div className="relative bg-slate-100 h-[260px] overflow-hidden">
                    <iframe
                      title={p.name}
                      srcDoc={previewHtml}
                      className="border-none pointer-events-none absolute top-0 left-0"
                      style={{ width: '900px', height: '1100px', transform: 'scale(0.42)', transformOrigin: 'top left' }}
                    />
                    {active && (
                      <div className="absolute top-2 right-2 bg-brand-navy text-white rounded-full p-1.5 shadow-lg">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-white border-t">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: p.accent }} />
                      <div className="font-semibold text-sm">{p.name}</div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{p.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        {/* ===== Editor ===== */}
        <div className="space-y-3">
          <Accordion type="multiple" defaultValue={['assunto', 'header', 'hero', 'body']} className="space-y-2">


            <SectionItem value="assunto" title="Assunto e preheader">
              <Field label="Assunto (aparece no Gmail)">
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Preheader (prévia)">
                <Input value={preheader} onChange={(e) => setPreheader(e.target.value)} />
              </Field>
              <p className="text-[11px] text-muted-foreground">
                Use variáveis como <code>{'{{NOME_TITULAR}}'}</code>, <code>{'{{CNPJ}}'}</code>, <code>{'{{LINK_PUBLICO}}'}</code>.
              </p>
            </SectionItem>

            <SectionItem value="header" title="Cabeçalho (topo azul)">
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
              <Field label="URL da imagem hero (opcional, abaixo do cabeçalho)">
                <Input value={design.heroImageUrl || ''} onChange={(e) => set('heroImageUrl', e.target.value)} placeholder="https://..." />
              </Field>
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

            <SectionItem value="warning" title="Bloco de aviso (vermelho)">
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

            <SectionItem value="avatar" title="Foto de perfil (avatar circular no topo)">
              <ToggleField label="Mostrar avatar" value={!!design.showAvatar} onChange={(v) => set('showAvatar', v)} />
              <Field label="URL da imagem (PNG/JPG quadrada)">
                <Input value={design.avatarUrl || ''} onChange={(e) => set('avatarUrl', e.target.value)} placeholder="https://..." />
              </Field>
              <SliderField label="Tamanho (px)" min={40} max={110} value={design.avatarSize || 64} onChange={(v) => set('avatarSize', v)} />
            </SectionItem>

            <SectionItem value="govbar" title="Faixa gov.br (topo)">
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
              <p className="text-[11px] text-muted-foreground">Ex.: Portal gov.br · Site Seguro (SSL) · Receita Federal · LGPD</p>
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

        {/* ===== Prévia ao vivo ===== */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
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
              <div className="text-xs mb-2 space-y-0.5">
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
                  <div className="bg-slate-100 p-4 rounded border flex justify-center overflow-hidden">
                    {viewport === 'desktop' ? (
                      <div
                        className="relative bg-white shadow-sm"
                        style={{
                          width: design.containerWidth,
                          height: 900,
                          maxWidth: '100%',
                        }}
                      >
                        <iframe
                          title="prévia"
                          srcDoc={html}
                          className="border-none bg-white"
                          style={{ width: design.containerWidth, height: 1400, transformOrigin: 'top left' }}
                        />
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
      </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
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
