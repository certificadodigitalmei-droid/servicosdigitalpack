import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { resolveCompanyLink } from '@/lib/company-links.functions';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/certificado-mei/$token')({
  component: TokenResolutionPage,
});

function TokenResolutionPage() {
  const { token } = useParams({ from: '/certificado-mei/$token' });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resolve = async () => {
      try {
        const data = await resolveCompanyLink({ data: { token } });

        if (data) {
          // Add the token to pass it to the home page so it can wire up the checkout button
          const search: Record<string, string> = {
            cnpj: data.cnpj,
            nome: data.nome,
            abertura: data.abertura,
            token: token
          };

          navigate({ to: '/', search, replace: true });
        } else {
          setError('Link inválido ou indisponível.');
        }
      } catch (err) {
        console.error('Error resolving token:', err);
        setError('Link inválido ou indisponível.');
      }
    };

    resolve();
  }, [token, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <div className="inline-flex h-16 w-16 bg-red-50 rounded-full items-center justify-center mb-2">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">{error}</h2>
            <p className="text-slate-500">
              O link que você tentou acessar não existe ou já expirou. Verifique se a URL está correta.
            </p>
            <Button asChild className="mt-4 bg-brand-navy hover:bg-brand-blue">
              <a href="/">Ir para a Página Inicial</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-4">
        <Loader2 className="h-10 w-10 text-brand-blue animate-spin mx-auto" />
        <p className="text-slate-600 font-medium animate-pulse">Carregando dados da empresa...</p>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>{children}</div>;
}

function CardContent({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}
