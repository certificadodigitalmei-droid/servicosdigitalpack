import { useState, useEffect } from 'react';
import { createFileRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [debugError, setDebugError] = useState<any>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    checkSession();
  }, [location.pathname]);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
    } catch (e) {
      console.error('Erro ao verificar sessão:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      setDebugError(null);
      
      const config = {
        url: (supabase as any).supabaseUrl || 'Não encontrada',
        initialized: !!supabase
      };

      console.log('Iniciando tentativa de login:', { email, config });

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Erro de login retornado pelo Supabase:', error);
        
        const sessionRes = await supabase.auth.getSession();
        const userRes = await supabase.auth.getUser();

        const errorDetails = {
          code: error.code,
          message: error.message,
          status: error.status,
          name: error.name,
          supabaseConfig: {
            url: config.url.replace(/(https:\/\/).{4}/, '$1****'),
            initialized: config.initialized
          },
          authCheck: {
            session: !!sessionRes.data.session,
            user: !!userRes.data.user
          }
        };

        setDebugError(errorDetails);
        toast.error(`Erro: ${error.message}`);
      } else if (data.session) {
        setIsAuthorized(true);
        toast.success('Acesso autorizado');
      }
    } catch (err: any) {
      console.error('Erro crítico no fluxo de login:', err);
      setDebugError({
        message: err.message,
        name: err.name,
        stack: err.stack,
        type: 'Exceção não tratada'
      });
      toast.error('Erro crítico no processamento do login');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-navy">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-navy p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">Acesso Administrativo</CardTitle>
            <CardDescription>
              Faça login com seu e-mail e senha para acessar o painel
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">E-mail</label>
                <Input
                  type="email"
                  placeholder="exemplo@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Senha</label>
                <Input
                  type="password"
                  placeholder="******"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {debugError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs font-mono overflow-auto max-h-60">
                  <p className="font-bold text-red-700 mb-1 uppercase tracking-wider text-[10px]">Diagnóstico de Erro Supabase</p>
                  <pre className="text-red-600 whitespace-pre-wrap">
                    {JSON.stringify(debugError, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isLoading} className="w-full bg-brand-blue hover:bg-brand-navy">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Entrar no Painel
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}