import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, Save, Plus, Trash2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { PaymentInfoPopup } from '@/components/checkout/PaymentInfoPopup';
import { getSitePopup, saveSitePopup, POPUP_DEFAULTS, type SitePopupSettings } from '@/lib/site-popup.functions';
import { RichField } from '@/components/admin/RichField';

export const Route = createFileRoute('/_authenticated/painel/pop-up-site')({
  component: PopupSitePage,
});

function PopupSitePage() {
  const [s, setS] = useState<SitePopupSettings>(POPUP_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewPay, setPreviewPay] = useState(false);


  useEffect(() => {
    getSitePopup()
      .then((data) => setS(data))
      .catch(() => setS(POPUP_DEFAULTS))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof SitePopupSettings>(k: K, v: SitePopupSettings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSitePopup({ data: s });
      toast.success('Pop-ups salvos com sucesso');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando…</div>;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Pop-ups do Site</h1>
          <p className="text-sm text-slate-500">
            Configure cada pop-up mostrado ao cliente durante o fluxo de emissão do certificado.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-brand-navy hover:bg-brand-blue">
          <Save className="mr-2 h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar todos'}
        </Button>
      </div>

      <FormattingHelp />

      <Tabs defaultValue="pagamento" className="flex min-h-0 flex-col">
        <TabsList className="w-full justify-start bg-slate-100 p-1">
          <TabsTrigger value="pagamento" className="gap-2 data-[state=active]:bg-white">
            <CreditCard className="h-4 w-4" /> Pop-up Pagamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pagamento" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Pop-up de informações do pagamento</h2>
                  <p className="text-xs text-slate-500">
                    Aparece após o cliente clicar em <strong>Gerar Guia</strong>, antes de mostrar o PIX.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5">
                    <Switch
                      checked={s.payment_enabled}
                      onCheckedChange={(v) => set('payment_enabled', v)}
                      id="pay-enabled"
                    />
                    <Label htmlFor="pay-enabled" className="text-sm">Ativo</Label>
                  </div>
                  <Button variant="outline" onClick={() => setPreviewPay(true)}>
                    <Eye className="mr-2 h-4 w-4" /> Prévia
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-base">Cabeçalho e título</CardTitle></CardHeader>
                <CardContent className="space-y-3 pb-4">
                  <Field label="Selo do topo" value={s.payment_badge_text} onChange={(v) => set('payment_badge_text', v)} />
                  <RichField label="Título principal" value={s.payment_title} onChange={(v) => set('payment_title', v)} rows={2} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3"><CardTitle className="text-base">Animação de carregamento</CardTitle></CardHeader>
                <CardContent className="space-y-3 pb-4">
                  <Field label="Título do carregamento" value={s.payment_loading_title} onChange={(v) => set('payment_loading_title', v)} />
                  <Field label="Subtítulo do carregamento" value={s.payment_loading_subtitle} onChange={(v) => set('payment_loading_subtitle', v)} textarea />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="py-3"><CardTitle className="text-base">Blocos informativos</CardTitle></CardHeader>
                <CardContent className="space-y-3 pb-4">
                  <RichField label="Empresas parceiras (bloco cinza)" value={s.payment_partner_text} onChange={(v) => set('payment_partner_text', v)} rows={2} />
                  <RichField label="Alerta do banco (bloco amarelo)" value={s.payment_alert_text} onChange={(v) => set('payment_alert_text', v)} rows={2} />
                  <RichField label="Confirmação/emissão (bloco verde)" value={s.payment_confirmation_text} onChange={(v) => set('payment_confirmation_text', v)} rows={2} />
                  <RichField label="Validade do certificado" value={s.payment_validity_text} onChange={(v) => set('payment_validity_text', v)} singleLine />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="py-3"><CardTitle className="text-base">Botões</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 pb-4">
                  <Field label="Botão continuar" value={s.payment_continue_button_text} onChange={(v) => set('payment_continue_button_text', v)} />
                  <Field label="Botão cancelar" value={s.payment_cancel_button_text} onChange={(v) => set('payment_cancel_button_text', v)} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <PaymentInfoPopup
        open={previewPay}
        onClose={() => setPreviewPay(false)}
        onContinue={() => setPreviewPay(false)}
        settings={s}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {textarea ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function FormattingHelp() {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-[#1351b4]/20 bg-[#1351b4]/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-[#0b1e3f]">
          <span className="grid h-6 w-6 place-items-center rounded bg-[#1351b4] text-white">?</span>
          Como formatar os textos (negrito, cor, itálico…)
        </div>
        <span className="text-xs text-slate-500">{open ? 'ocultar' : 'mostrar'}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-[#1351b4]/15 px-4 py-4 text-sm text-slate-700">
          <p className="text-slate-600">
            Você pode escrever direto no campo usando os marcadores abaixo, ou selecionar o texto e
            clicar nos botões da barrinha (<strong>B</strong>, <em>I</em>, <s>S</s>, paleta de cores).
            Use o botão <em>Prévia</em> para ver como fica.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <HelpRow code="*texto em negrito*" preview={<strong>texto em negrito</strong>} />
            <HelpRow code="_texto em itálico_" preview={<em>texto em itálico</em>} />
            <HelpRow code="~texto riscado~" preview={<s>texto riscado</s>} />
            <HelpRow
              code="{c:#d93025}texto vermelho{/c}"
              preview={<span style={{ color: '#d93025' }}>texto vermelho</span>}
            />
            <HelpRow
              code="{c:#138835}verde{/c}"
              preview={<span style={{ color: '#138835' }}>verde</span>}
            />
            <HelpRow
              code="*{c:#d93025}urgente{/c}*"
              preview={
                <strong style={{ color: '#d93025' }}>urgente</strong>
              }
            />
          </div>

          <div className="rounded-md bg-white/70 p-3 text-[13px] text-slate-600 ring-1 ring-slate-200">
            <div className="mb-1 font-semibold text-[#0b1e3f]">Exemplo real</div>
            <div className="font-mono text-[12px] text-slate-500">
              Seu CNPJ está *{'{c:#d93025}'}pendente{'{/c}'}* — regularize hoje.
            </div>
            <div className="mt-1">
              Seu CNPJ está{' '}
              <strong style={{ color: '#d93025' }}>pendente</strong> — regularize hoje.
            </div>
          </div>

          <p className="text-[12px] text-slate-500">
            Dica: você pode combinar marcadores (por exemplo, negrito + cor). As quebras de linha
            também são preservadas.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function HelpRow({ code, preview }: { code: string; preview: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-3 py-2 ring-1 ring-slate-200">
      <code className="font-mono text-[12px] text-slate-600">{code}</code>
      <span className="text-sm text-[#0b1e3f]">{preview}</span>
    </div>
  );
}

