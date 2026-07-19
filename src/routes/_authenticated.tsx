import { useState, useEffect } from 'react';
import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [code, setCode] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth_code');
    if (auth === '117711') {
      setIsAuthorized(true);
      checkSupabaseAuth();
    }
  }, [location.pathname]);

  const checkSupabaseAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('Autorizado localmente mas sem sessão Supabase. Tentando login anônimo...');
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error('Erro ao estabelecer sessão anônima:', error);
        } else {
          console.log('Sessão anônima estabelecida com sucesso');
        }
      }
    } catch (e) {
      console.error('Erro na verificação de auth:', e);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code === '117711') {
      console.log('Verificando código 117711...');
      localStorage.setItem('admin_auth_code', '117711');
      setIsAuthorized(true);
      toast.success('Acesso autorizado');
      
      try {
        console.log('Iniciando signInAnonymously...');
        const { data: authData, error: loginError } = await supabase.auth.signInAnonymously();
        if (loginError) {
          console.error('Supabase Login Error:', loginError);
          toast.error('Erro ao iniciar sessão no banco de dados');
        } else {
          console.log('Sessão Supabase estabelecida:', authData.session?.user?.id);
        }
      } catch (err) {
        console.error('Erro inesperado no login Supabase:', err);
      }
    } else {
      toast.error('Código incorreto');
    }
  };

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-navy p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">Acesso Restrito</CardTitle>
            <CardDescription>
              Insira o código de acesso para continuar
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleVerify}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Código de acesso"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="text-center text-2xl tracking-widest"
                  autoFocus
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-brand-blue hover:bg-brand-navy">
                Acessar Painel
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}