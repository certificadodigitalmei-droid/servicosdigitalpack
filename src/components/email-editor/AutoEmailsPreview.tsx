import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { previewEmailTemplate } from '@/lib/emails/recovery.functions';

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

/** Pré-visualização (somente leitura) dos e-mails automáticos disparados pelo site. */
export function AutoEmailsPreview() {
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
        if (!cancelled) {
          setHtml('<p style="font-family:sans-serif;padding:24px">Falha ao carregar o modelo.</p>');
          setSubject('');
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, doPreview]);

  const current = MODELOS.find((m) => m.name === selected)!;

  return (
    <div className="w-full max-w-3xl rounded-lg border bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Mail className="h-4 w-4" /> Modelos disparados automaticamente
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Somente visualização — é exatamente assim que cada e-mail automático chega para o cliente.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {MODELOS.map((m) => (
          <Button
            key={m.name}
            variant={m.name === selected ? 'default' : 'outline'}
            size="sm"
            className="text-xs"
            onClick={() => setSelected(m.name)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      <div className="mt-3 text-xs text-muted-foreground">{current.when}</div>
      <div className="mt-1 text-xs">
        <span className="text-muted-foreground">Assunto: </span>
        <span className="font-medium text-slate-800">{subject || '—'}</span>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando modelo…
          </div>
        ) : (
          <iframe
            title={`preview-${selected}`}
            srcDoc={html}
            className="h-[600px] w-full rounded-md border bg-white"
          />
        )}
      </div>
    </div>
  );
}
