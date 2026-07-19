import { useState } from 'react';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { z } from 'zod';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: (search) => loginSearchSchema.parse(search),
  component: Login,
});

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const navigate = useNavigate();
  const search = useSearch({ from: '/login' });

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: 'coringa@gmail.com',
        password: 'SenhaMuitoForte117711!',
      });
      if (error) {
        if (error.message.includes('already registered')) {
          toast.info('Usuário já existe, pode logar.');
        } else {
          throw error;
        }
      } else {
        toast.success('Usuário de demonstração criado com sucesso!');
      }
    } catch (error: any) {
      toast.error('Erro ao criar usuário: ' + error.message);
    } finally {
      setSeeding(false);
    }
  };


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast.success('Bem-vindo de volta!');

      if (search.redirect) {
        window.location.href = search.redirect;
      } else {
        navigate({ to: '/painel' });
      }
    } catch (error: any) {
      toast.error(error.message || 'Falha ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Acesso Administrativo</CardTitle>
          <CardDescription>
            Entre com suas credenciais para gerenciar a Central MEI Digital
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full bg-brand-blue hover:bg-brand-navy" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </CardFooter>
        </form>
        <div className="px-6 pb-6 text-center">
          <Button 
            variant="link" 
            onClick={handleSeed} 
            disabled={seeding}
            className="text-xs text-muted-foreground"
          >
            {seeding ? 'Criando...' : 'Não consegue logar? Clique aqui para preparar o acesso de demonstração'}
          </Button>
        </div>
      </Card>
    </div>


  );
}
