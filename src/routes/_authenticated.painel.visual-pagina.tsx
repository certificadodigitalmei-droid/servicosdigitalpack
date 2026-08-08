import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getPreviewTokens } from '@/lib/preview/page-preview.functions';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authenticated/painel/visual-pagina')({
  component: VisualPaginaPage,
});

type TabKey = 'inicial' | 'checkout' | 'pago';

function VisualPaginaPage() {
  const fetchTokens = useServerFn(getPreviewTokens);
  const { data, isLoading } = useQuery({
    queryKey: ['preview-tokens'],
    queryFn: () => fetchTokens({}),
  });

  const [tab, setTab] = useState<TabKey>('inicial');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [customToken, setCustomToken] = useState('');
  const [nonce, setNonce] = useState(0);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const pending = customToken.trim() || data?.pendingToken || '';
  const paid = customToken.trim() || data?.paidToken || data?.pendingToken || '';

  const paths: Record<TabKey, { path: string; token: string; title: string; desc: string }> = {
    inicial: {
      path: `/c/${pending}`,
      token: pending,
      title: 'Página inicial',
      desc: 'O que o cliente vê ao abrir o link enviado por e-mail.',
    },
    checkout: {
      path: `/checkout/${pending}`,
      token: pending,
      title: 'Página de checkout',
      desc: 'Tela de dados do pagador e geração do PIX.',
    },
    pago: {
      path: `/c/${paid}`,
      token: paid,
      title: 'Página após o pagamento',
      desc: 'Página inicial com o cartão do certificado ativo e vinculado.',
    },
  };

  const current = paths[tab];
  const url = current.token ? `${origin}${current.path}` : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visual da Página</h1>
          <p className="text-sm text-slate-500">Pré-visualize exatamente o que o cliente enxerga em cada etapa.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              onClick={() => setDevice('desktop')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
                device === 'desktop' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900',
              )}
            >
              <Monitor className="h-3.5 w-3.5" /> Computador
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
                device === 'mobile' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900',
              )}
            >
              <Smartphone className="h-3.5 w-3.5" /> Celular
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          {url && (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </a>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Empresa usada na pré-visualização</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Token do link (opcional — deixe vazio para usar o mais recente)"
            value={customToken}
            onChange={(e) => setCustomToken(e.target.value)}
            className="max-w-md"
          />
          <div className="text-xs text-slate-500">
            {isLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> carregando…
              </span>
            ) : (
              <>
                Pendente: <strong>{data?.pendingName || data?.pendingToken || '—'}</strong> · Pago:{' '}
                <strong>{data?.paidName || data?.paidToken || '—'}</strong>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="inicial">Página inicial</TabsTrigger>
          <TabsTrigger value="checkout">Checkout</TabsTrigger>
          <TabsTrigger value="pago">Após o pagamento</TabsTrigger>
        </TabsList>

        {(['inicial', 'checkout', 'pago'] as TabKey[]).map((key) => (
          <TabsContent key={key} value={key} className="mt-4">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-900">{paths[key].title}</div>
              <div className="text-xs text-slate-500">{paths[key].desc}</div>
            </div>

            {!paths[key].token ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                Nenhum link disponível ainda. Gere um link na aba “Links Gerados” ou informe um token acima.
              </div>
            ) : (
              <div className="flex justify-center rounded-xl border border-slate-200 bg-slate-100 p-4">
                <iframe
                  key={`${key}-${nonce}-${device}-${paths[key].token}`}
                  src={`${paths[key].path}`}
                  title={paths[key].title}
                  className={cn(
                    'rounded-lg border border-slate-200 bg-white shadow-sm',
                    device === 'mobile' ? 'w-[390px]' : 'w-full',
                  )}
                  style={{ height: 780 }}
                />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
