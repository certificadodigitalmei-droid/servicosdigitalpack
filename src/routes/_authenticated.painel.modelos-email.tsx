import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mail } from 'lucide-react';
import { previewEmailTemplate } from '@/lib/emails/recovery.functions';

export const Route = createFileRoute('/_authenticated/painel/modelos-email')({
  component: ModelosEmailPage,
  head: () => ({
    meta: [
      { title: 'Modelos de E-mail | Painel' },
      { name: 'description', content: 'Pré-visualize os e-mails automáticos enviados aos clientes.' },
    ],
  }),
});

const MODELOS = [
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

function ModelosEmailPage() {
  const [selected, setSelected] = useState(MODELOS[0].name);
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(false);
  const doPreview = useServerFn(previewEmailTemplate);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    doPreview({ data: { name: selected } })
      .then((r) => {
        if (cancelled) return;
        setHtml(r.html);
        setSubject(r.subject);
      })
      .catch(() => {
        if (!cancelled) setHtml('<p style="font-family:sans-serif;padding:24px">Falha ao carregar o modelo.</p>');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, doPreview]);

  const current = MODELOS.find((m) => m.name === selected)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" /> Modelos de E-mail
        </h1>
        <p className="text-muted-foreground text-sm">
          Visualize exatamente como cada e-mail automático chega para o cliente.
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
          {loading ? (
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
