import { useEffect, useState } from 'react';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { bootConsultaEngine } from '@/lib/automation/consulta-engine';
import { bootEnvioEngine } from '@/lib/automation/envio-engine';

export const Route = createFileRoute('/_authenticated')({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [state, setState] = useState<'checking' | 'ok' | 'no_user' | 'no_admin'>('checking');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data: userRes } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!userRes.user) {
        setState('no_user');
        return;
      }
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userRes.user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (cancelled) return;
      if (!roleRow) {
        setState('no_admin');
        return;
      }
      setState('ok');
    }
    check();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setState('no_user');
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') check();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state === 'no_user') navigate({ to: '/auth', replace: true });
  }, [state, navigate]);

  if (state === 'checking' || state === 'no_user') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-navy">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (state === 'no_admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-navy p-6">
        <div className="max-w-md rounded-lg bg-white p-6 text-center shadow">
          <h1 className="mb-2 text-xl font-bold text-brand-navy">Acesso negado</h1>
          <p className="mb-4 text-sm text-slate-600">
            Sua conta está autenticada, mas não possui a permissão de administrador necessária para acessar o painel.
          </p>
          <button
            type="button"
            className="rounded bg-brand-blue px-4 py-2 text-white hover:bg-brand-navy"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: '/auth', replace: true });
            }}
          >
            Sair e trocar de conta
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
