import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Loader2, Mail, Save, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadCampaignVariantSelection,
  saveCampaignVariantSelection,
} from '@/lib/email-campaign/variants.functions';
import { CAMPAIGN_VARIANTS } from '@/lib/email-campaign/variants';
import { SpamScorePanel } from '@/components/painel/SpamScorePanel';
import { SubjectAuditPanel } from '@/components/painel/SubjectAuditPanel';
import { renderHtml, renderText, substitute } from '@/lib/email-campaign/template';
import { analyzeSpamScore, type SpamReport } from '@/lib/email-campaign/spam-score';

export const Route = createFileRoute('/_authenticated/painel/modelos-email')({
  component: ModelosEmailPage,
  head: () => ({
    meta: [
      { title: 'Modelos de E-mail | Painel' },
      { name: 'description', content: 'Pré-visualize os e-mails enviados aos clientes.' },
    ],
  }),
});

const PREVIEW_VARS: Record<string, string> = {
  NOME_EMPRESARIAL: 'RAFAEL VALE DA SILVA',
  RAZAO_SOCIAL: 'RAFAEL VALE DA SILVA',
  NOME_TITULAR: 'RAFAEL VALE DA SILVA',
  CNPJ: '68087737000127',
  DATA_ABERTURA: '15/03/2024',
  DATA_SITUACAO: '15/03/2024',
  SITUACAO: 'CNPJ sem certificado pendente',
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

function ModelosEmailPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" /> Modelos de E-mail
        </h1>
        <p className="text-muted-foreground text-sm">
          Visualize os e-mails enviados aos clientes e escolha quais modelos entram na rotação do
          envio em massa.
        </p>
      </div>

      <Tabs defaultValue="rotacao">
        <TabsList>
          <TabsTrigger value="rotacao">Modelos de campanha (rotação)</TabsTrigger>
          <TabsTrigger value="spam">Teste de spam</TabsTrigger>
        </TabsList>

        <TabsContent value="rotacao" className="mt-4">
          <RotacaoModelos />
        </TabsContent>

        <TabsContent value="spam" className="mt-4">
          <SpamScorePanel vars={PREVIEW_VARS} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RotacaoModelos() {
  const load = useServerFn(loadCampaignVariantSelection);
  const save = useServerFn(saveCampaignVariantSelection);
  const [active, setActive] = useState<string[] | null>(null);
  const [preview, setPreview] = useState(CAMPAIGN_VARIANTS[0].id);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['campaign-variant-selection'],
    queryFn: () => load(),
  });

  useEffect(() => {
    if (data && active === null) setActive(data.variantIds ?? []);
  }, [data, active]);

  const selected = active ?? [];
  const current = CAMPAIGN_VARIANTS.find((v) => v.id === preview)!;
  const html = useMemo(() => renderHtml(current.design, PREVIEW_VARS), [current]);

  const toggle = (id: string) =>
    setActive((prev) => {
      const list = prev ?? [];
      return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ data: { variantIds: selected } });
      toast.success(
        selected.length === 0
          ? 'Nenhum modelo marcado — a rotação usará todos os modelos de campanha.'
          : `${selected.length} modelo(s) na rotação do envio em massa.`,
      );
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao salvar a seleção.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && active === null) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando modelos…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shuffle className="h-4 w-4" /> Rotação automática de modelos
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Selecione os modelos que podem ser usados. No envio em massa, cada empresa recebe um
            modelo diferente da lista — assunto e visual variam, o que reduz o risco de spam. Sem
            nenhum marcado, todos os modelos entram na rotação.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAMPAIGN_VARIANTS.map((v) => {
              const on = selected.includes(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => toggle(v.id)}
                  className={`text-left rounded-lg border p-3 transition ${
                    on ? 'border-primary ring-1 ring-primary bg-accent/40' : 'hover:bg-accent/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded-full border"
                        style={{ backgroundColor: v.accent }}
                      />
                      <span className="font-medium text-sm">{v.name}</span>
                    </div>
                    {on && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{v.description}</p>
                  <p className="text-xs mt-2">
                    <span className="text-muted-foreground">Assunto: </span>
                    {v.subject}
                  </p>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreview(v.id);
                    }}
                    className="inline-block mt-3 text-xs underline text-muted-foreground hover:text-foreground"
                  >
                    Pré-visualizar
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar seleção
            </Button>
            <Badge variant="secondary">{selected.length} ativo(s)</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActive(CAMPAIGN_VARIANTS.map((v) => v.id))}
            >
              Selecionar todos
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setActive([])}>
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <SubjectAuditPanel activeIds={selected} />



      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pré-visualização: {current.name}</CardTitle>
          <p className="text-sm">
            <span className="text-muted-foreground">Assunto: </span>
            <span className="font-medium">{substitute(current.subject, PREVIEW_VARS)}</span>
          </p>
        </CardHeader>
        <CardContent>
          <iframe
            title={`preview-variant-${current.id}`}
            srcDoc={html}
            className="w-full h-[700px] rounded-md border bg-white"
          />
        </CardContent>
      </Card>
    </div>
  );
}
