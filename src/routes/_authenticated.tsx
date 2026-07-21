import { useState, useEffect } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

const PANEL_PASSWORD = '117711';
const STORAGE_KEY = 'panel_auth_v1';

function AuthenticatedLayout() {
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'ok') {
        setIsAuthorized(true);
      }
    } catch {}
    setHydrated(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim() === PANEL_PASSWORD) {
      try {
        localStorage.setItem(STORAGE_KEY, 'ok');
      } catch {}
      setIsAuthorized(true);
      toast.success('Acesso autorizado');
    } else {
      toast.error('Senha incorreta');
    }
  };

  if (!hydrated) {
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
            <CardDescription>Digite a senha para acessar o painel</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Senha</label>
                <Input
                  type="password"
                  placeholder="******"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-brand-blue hover:bg-brand-navy">
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
