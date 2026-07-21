import { createFileRoute, Outlet, Link, useLocation, useNavigate } from '@tanstack/react-router';
import {
  LayoutDashboard,
  LogOut,
  Building2,
  ChevronRight,
  Filter,
  Link2,
  Upload,
  Mail,
  Bot,
  Database,
  LinkIcon,
  Send,
  Palette,
  CheckCircle2,

} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { GlobalFloatingPanels } from '@/components/painel/GlobalFloatingPanels';

export const Route = createFileRoute('/_authenticated/painel')({
  component: PanelLayout,
});

function PanelLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Sessão encerrada');
    navigate({ to: '/auth' });
  };

  const menuItems = [
    { title: 'Dashboard', icon: LayoutDashboard, to: '/painel' },
    { title: 'Consulta Automática', icon: Bot, to: '/painel/consulta-automatica' },
    { title: 'Empresas Importadas', icon: Database, to: '/painel/empresas-importadas' },
    { title: 'Links Gerados', icon: LinkIcon, to: '/painel/links-gerados' },
    { title: 'Campanhas de E-mail', icon: Mail, to: '/painel/campanhas-email' },
    { title: 'Modelo de Mensagem', icon: Palette, to: '/painel/modelo-mensagem' },
    { title: 'Envio em Massa', icon: Send, to: '/painel/envio-massa' },
    { title: 'E-mails Enviados', icon: CheckCircle2, to: '/painel/enviados' },
  ];



  const getBreadcrumbLabel = (path: string) => {
    if (path === '/painel') return 'Dashboard';
    if (path === '/painel/consulta-automatica') return 'Consulta Automática';
    if (path === '/painel/empresas-importadas') return 'Empresas Importadas';
    if (path.startsWith('/painel/empresas-importadas/')) return 'Detalhes da Empresa';
    if (path === '/painel/links-gerados') return 'Links Gerados';
    if (path === '/painel/importar-empresas') return 'Importar Empresas';
    if (path === '/painel/filtrar-mei') return 'Filtrar Empresas MEI';
    if (path === '/painel/gerador-links') return 'Gerador de Links';
    if (path === '/painel/campanhas-email') return 'Campanhas de E-mail';
    if (path === '/painel/modelo-mensagem') return 'Modelo de Mensagem';

    if (path === '/painel/envio-massa') return 'Envio em Massa';
    if (path === '/painel/enviados') return 'E-mails Enviados';
    if (path.startsWith('/painel/gerador-links/historico')) return 'Histórico de Gerações';
    return 'Painel';
  };


  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gradient-to-br from-slate-50 via-slate-100/60 to-slate-50">
        <Sidebar className="border-r border-slate-200/70 bg-white/90 backdrop-blur">
          <SidebarHeader className="border-b border-slate-200/70 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-navy to-slate-800 shadow-md shadow-brand-navy/20 ring-1 ring-white/10">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-brand-navy leading-tight">Central MEI</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Painel Admin</div>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="px-2 py-3">
            <SidebarGroup>
              <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Navegação
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => {
                    const isActive = location.pathname === item.to;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className={cn(
                            'rounded-lg transition-all',
                            isActive
                              ? 'bg-gradient-to-r from-brand-navy to-slate-800 text-white shadow-sm hover:from-brand-navy hover:to-slate-800 hover:text-white'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-brand-navy',
                          )}
                        >
                          <Link to={item.to} className="flex items-center gap-3">
                            <item.icon className={cn('h-4 w-4', isActive ? 'text-white' : 'text-slate-500')} />
                            <span className="text-sm font-medium">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-slate-200/70 p-3">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 rounded-lg text-slate-600 transition hover:bg-red-50 hover:text-red-600"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-medium">Sair</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <div className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 px-6 py-3 backdrop-blur-md md:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger className="lg:hidden" />
                <div className="h-6 w-px bg-slate-200 lg:hidden" />
                <nav className="flex min-w-0 items-center text-sm text-slate-500">
                  <span className="hidden sm:inline">Painel</span>
                  <ChevronRight className="mx-1.5 hidden h-4 w-4 sm:inline" />
                  <span className="truncate font-semibold text-slate-900">
                    {getBreadcrumbLabel(location.pathname)}
                  </span>
                </nav>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <div className="hidden text-right sm:block">
                  <div className="text-xs font-semibold text-slate-700">Administrador</div>
                  <div className="text-[10px] text-slate-400">Sessão ativa</div>
                </div>
                <Avatar className="h-9 w-9 border-2 border-white shadow-sm ring-1 ring-slate-200">
                  <AvatarFallback className="bg-gradient-to-br from-brand-blue to-brand-navy text-xs font-bold text-white">AD</AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-7xl px-6 py-8 md:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}