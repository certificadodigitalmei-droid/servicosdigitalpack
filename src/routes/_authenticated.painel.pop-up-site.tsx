import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, Save, Plus, Trash2, FileText, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CertificatePopup } from '@/components/CertificatePopup';
import { PaymentInfoPopup } from '@/components/checkout/PaymentInfoPopup';
import { getSitePopup, saveSitePopup, POPUP_DEFAULTS, type SitePopupSettings } from '@/lib/site-popup.functions';

export const Route = createFileRoute('/_authenticated/painel/pop-up-site')({
  component: PopupSitePage,
});

function PopupSitePage() {
  const [s, setS] = useState<SitePopupSettings>(POPUP_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewCert, setPreviewCert] = useState(false);
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
    <div className="space-y-6">
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

      <Tabs defaultValue="certificado" className="space-y-4">
        <TabsList className="w-full justify-start bg-slate-100 p-1">
          <TabsTrigger value="certificado" className="gap-2 data-[state=active]:bg-white">
            <FileText className="h-4 w-4" /> Pop-up Certificado
          </TabsTrigger>
          <TabsTrigger value="pagamento" className="gap-2 data-[state=active]:bg-white">
            <CreditCard className="h-4 w-4" /> Pop-up Pagamento
          </TabsTrigger>
        </TabsList>

        {/* =============== POP-UP 1: CERTIFICADO =============== */}
        <TabsContent value="certificado" className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Pop-up antes do checkout</h2>
                <p className="text-xs text-slate-500">
                  Aparece quando o cliente clica em <strong>Emitir Certificado Digital</strong>.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5">
                  <Switch checked={s.enabled} onCheckedChange={(v) => set('enabled', v)} id="cert-enabled" />
                  <Label htmlFor="cert-enabled" className="text-sm">Ativo</Label>
                </div>
                <Button variant="outline" onClick={() => setPreviewCert(true)}>
                  <Eye className="mr-2 h-4 w-4" /> Prévia
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Cabeçalho e título</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Selo do topo" value={s.badge_text} onChange={(v) => set('badge_text', v)} />
                <Field label="Título principal" value={s.title} onChange={(v) => set('title', v)} textarea />
                <Field label="Destaque (pendência)" value={s.highlight_text} onChange={(v) => set('highlight_text', v)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Blocos informativos</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Título — Obrigatório por lei" value={s.law_title} onChange={(v) => set('law_title', v)} />
                <Field label="Texto legal" value={s.law_text} onChange={(v) => set('law_text', v)} textarea />
                <Field label="Texto do emissor/parceiros" value={s.provider_text} onChange={(v) => set('provider_text', v)} textarea />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Riscos (bloco escuro)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Título dos riscos" value={s.risks_title} onChange={(v) => set('risks_title', v)} />
                <div className="space-y-2">
                  <Label className="text-sm">Itens</Label>
                  {s.risks.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={r}
                        onChange={(e) => {
                          const next = [...s.risks];
                          next[i] = e.target.value;
                          set('risks', next);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => set('risks', s.risks.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => set('risks', [...s.risks, 'Novo risco'])}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar risco
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Preços e validade</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Label principal" value={s.price_main_label} onChange={(v) => set('price_main_label', v)} />
                  <Field label="Valor principal" value={s.price_main} onChange={(v) => set('price_main', v)} />
                  <Field label="Nota (valor principal)" value={s.price_main_note} onChange={(v) => set('price_main_note', v)} />
                  <Field label="Label parcelamento" value={s.price_installment_label} onChange={(v) => set('price_installment_label', v)} />
                  <Field label="Valor parcela" value={s.price_installment} onChange={(v) => set('price_installment', v)} />
                  <Field label="Nota (parcela)" value={s.price_installment_note} onChange={(v) => set('price_installment_note', v)} />
                  <Field label="Título validade" value={s.validity_title} onChange={(v) => set('validity_title', v)} />
                  <Field label="Subtítulo validade" value={s.validity_subtitle} onChange={(v) => set('validity_subtitle', v)} />
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Rodapé e botões</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">Itens do rodapé (ícone + texto)</Label>
                  <p className="text-xs text-slate-500">Ícones disponíveis: lock, key, headset, shield, file</p>
                  {s.footer_items.map((f, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        className="max-w-[140px]"
                        placeholder="ícone"
                        value={f.icon}
                        onChange={(e) => {
                          const next = [...s.footer_items];
                          next[i] = { ...f, icon: e.target.value };
                          set('footer_items', next);
                        }}
                      />
                      <Input
                        value={f.text}
                        onChange={(e) => {
                          const next = [...s.footer_items];
                          next[i] = { ...f, text: e.target.value };
                          set('footer_items', next);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => set('footer_items', s.footer_items.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => set('footer_items', [...s.footer_items, { icon: 'shield', text: 'Novo item' }])}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar item
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Botão continuar" value={s.continue_button_text} onChange={(v) => set('continue_button_text', v)} />
                  <Field label="Botão cancelar" value={s.cancel_button_text} onChange={(v) => set('cancel_button_text', v)} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* =============== POP-UP 2: PAGAMENTO =============== */}
        <TabsContent value="pagamento" className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
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

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Cabeçalho e título</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Selo do topo" value={s.payment_badge_text} onChange={(v) => set('payment_badge_text', v)} />
                <Field label="Título principal" value={s.payment_title} onChange={(v) => set('payment_title', v)} textarea />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Animação de carregamento</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Título do carregamento" value={s.payment_loading_title} onChange={(v) => set('payment_loading_title', v)} />
                <Field label="Subtítulo do carregamento" value={s.payment_loading_subtitle} onChange={(v) => set('payment_loading_subtitle', v)} textarea />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Blocos informativos</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Empresas parceiras (bloco cinza)" value={s.payment_partner_text} onChange={(v) => set('payment_partner_text', v)} textarea />
                <Field label="Alerta do banco (bloco amarelo)" value={s.payment_alert_text} onChange={(v) => set('payment_alert_text', v)} textarea />
                <Field label="Confirmação/emissão (bloco verde)" value={s.payment_confirmation_text} onChange={(v) => set('payment_confirmation_text', v)} textarea />
                <Field label="Validade do certificado" value={s.payment_validity_text} onChange={(v) => set('payment_validity_text', v)} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Botões</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Field label="Botão continuar" value={s.payment_continue_button_text} onChange={(v) => set('payment_continue_button_text', v)} />
                <Field label="Botão cancelar" value={s.payment_cancel_button_text} onChange={(v) => set('payment_cancel_button_text', v)} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <CertificatePopup
        open={previewCert}
        onClose={() => setPreviewCert(false)}
        onContinue={() => setPreviewCert(false)}
        cnpj="00000000000100"
        settings={s}
      />

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
