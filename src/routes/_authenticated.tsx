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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Erro de login:', error);
        toast.error('Credenciais inválidas ou erro de conexão');
      } else if (data.session) {
        setIsAuthorized(true);
        toast.success('Acesso autorizado');
      }
    } catch (err) {
      console.error('Erro inesperado no login:', err);
      toast.error('Ocorreu um erro inesperado');
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
              {/* Removidos dados de demonstração hardcoded */}
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