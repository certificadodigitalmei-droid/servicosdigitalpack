import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mail } from 'lucide-react';
import { previewEmailTemplate } from '@/lib/emails/recovery.functions';
import { loadMessageTemplate } from '@/lib/email-campaign/template-store.functions';
import {
  DEFAULT_DESIGN,
  DEFAULT_SUBJECT,
  renderHtml,
  substitute,
  type CampaignDesign,
} from '@/lib/email-campaign/template';

export const Route = createFileRoute('/_authenticated/painel/modelos-email')({
  component: ModelosEmailPage,
  head: () => ({
    meta: [
      { title: 'Modelos de E-mail | Painel' },
      { name: 'description', content: 'Pré-visualize os e-mails enviados aos clientes.' },
    ],
  }),
});

const CAMPANHA = 'campanha';

const MODELOS = [
  {
    name: CAMPANHA,
    label: 'Modelo de mensagem (campanhas)',
    when: 'Usado no envio em massa, campanhas de e-mail e disparo por etapa.',
  },
  {
    name: 'pix-gerado',
    label: 'Guia gerada (PIX criado)',
    when: 'Enviado na hora em que o cliente gera o PIX.',
  },
  {
    name: 'pix-pendente',
    label: 'Cobrança / recuperação',
    when: 'Enviado 15 minutos após gerar o PIX e depois 1x por dia até o pagamento.',
  },
  {
    name: 'pagamento-confirmado',
    label: 'Pagamento confirmado',
    when: 'Enviado assim que o pagamento é confirmado (certificado emitido).',
  },
];

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

function ModelosEmailPage() {
  const [selected, setSelected] = useState(MODELOS[0].name);
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(false);
  const doPreview = useServerFn(previewEmailTemplate);
  const loadTemplate = useServerFn(loadMessageTemplate);

  const { data: saved, isLoading: loadingTemplate } = useQuery({
    queryKey: ['message-template'],
    queryFn: () => loadTemplate(),
  });

  const campanha = useMemo(() => {
    const design: CampaignDesign = { ...DEFAULT_DESIGN };
    return {
      html: renderHtml(design, PREVIEW_VARS),
      subject: substitute(saved?.subject || DEFAULT_SUBJECT, PREVIEW_VARS),
    };
  }, [saved]);

  useEffect(() => {
    if (selected === CAMPANHA) {
      setHtml(campanha.html);
      setSubject(campanha.subject);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    doPreview({ data: { name: selected } })
      .then((r) => {
        if (cancelled) return;
        setHtml(r.html);
        setSubject(r.subject);
      })
      .catch(() => {
        if (!cancelled) {
          setHtml('<p style="font-family:sans-serif;padding:24px">Falha ao carregar o modelo.</p>');
          setSubject('');
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, doPreview, campanha]);

  const current = MODELOS.find((m) => m.name === selected)!;
  const busy = loading || (selected === CAMPANHA && loadingTemplate);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" /> Modelos de E-mail
        </h1>
        <p className="text-muted-foreground text-sm">
          Visualize exatamente como cada e-mail chega para o cliente. Esta tela é somente leitura.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {MODELOS.map((m) => (
          <Button
            key={m.name}
            variant={m.name === selected ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelected(m.name)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{current.label}</CardTitle>
          <p className="text-xs text-muted-foreground">{current.when}</p>
          <p className="text-sm mt-2">
            <span className="text-muted-foreground">Assunto: </span>
            <span className="font-medium">{subject || '—'}</span>
          </p>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-[600px] flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando modelo…
            </div>
          ) : (
            <iframe
              title={`preview-${selected}`}
              srcDoc={html}
              className="w-full h-[700px] rounded-md border bg-white"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
