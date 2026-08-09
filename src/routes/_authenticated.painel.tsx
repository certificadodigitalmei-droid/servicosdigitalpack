import { createFileRoute, Outlet, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { cleanupUnsentCompanies } from '@/lib/automation/cleanup.functions';
import {
  LayoutDashboard,
  LogOut,
  Building2,
  ChevronRight,
  LinkIcon,
  Database,
  Send,
  CheckCircle2,
  DollarSign,
  KeyRound,
  MessageSquare,
  CloudDownload,
  ClipboardList,
  Mail,
  Bot,
  Loader2,
  Trash2,
  Monitor,
  Activity,
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

type CleanupReport = {
  success: boolean;
  message: string;
  removed: Record<string, number>;
  remaining: Record<string, number>;
  error?: string;
};

const CLEANUP_LABELS: Record<string, string> = {
  companies: 'Empresas',
  company_links: 'Links',
  email_send_queue: 'Fila/histórico de e-mail',
  contact_queue: 'Fila antiga de contato',
  automatic_company_queue: 'Fila de importação',
  automatic_company_query_runs: 'Execuções de importação',
  email_campaign_recipients: 'Destinatários de campanha',
  email_campaigns: 'Campanhas de e-mail',
  whatsapp_queue: 'Fila WhatsApp',
  whatsapp_campaign_items: 'Itens WhatsApp',
  whatsapp_campaigns: 'Campanhas WhatsApp',
  orders: 'Pedidos não pagos',
  orders_paid: 'Vendas pagas preservadas',
  customers: 'Clientes preservados',
  unprotected_companies: 'Empresas não protegidas',
  unprotected_company_links: 'Links não protegidos',
};

function formatCleanupCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts).filter(([, count]) => count !== 0);
  if (entries.length === 0) return 'Nenhum registro.';
  return entries.map(([key, count]) => `• ${CLEANUP_LABELS[key] ?? key}: ${count.toLocaleString('pt-BR')}`).join('\n');
}

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

  const [hydrated, setHydrated] = useState(false);
  const doCleanup = useServerFn(cleanupUnsentCompanies);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);

  const handleCleanup = async () => {

    if (
      !confirm(
        'Limpeza total para recomeçar do zero.\n\nSerá APAGADO:\n' +
          '• empresas importadas, links gerados e execuções de importação\n' +
          '• filas e históricos de e-mail (envios, destinatários, campanhas)\n' +
          '• filas, campanhas e itens de WhatsApp\n' +
          '• pedidos não pagos, clientes sem compra, eventos e registros\n\n' +
          'Será MANTIDO:\n' +
          '• vendas pagas e tudo ligado a elas\n' +
          '• configurações, chaves e modelos sincronizados\n' +
          '• a lista permanente de números bloqueados\n\nConfirmar?',
      )
    )
      return;
    
    setCleaning(true);
    try {
      const result = await doCleanup({ data: { confirm: true } });
      const report = result as CleanupReport;
      setCleanupReport(report);
      if (result.success) {
        const total = Object.values(report.removed).reduce((a, b) => a + b, 0);
        toast.success(`${result.message} ${total.toLocaleString('pt-BR')} registro(s) removido(s).`);
      } else {
        toast.error('Erro na limpeza: ' + (report.error || result.message));
      }
    } catch (e: any) {
      toast.error('Falha ao executar limpeza: ' + (e?.message ?? 'erro'));
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    setHydrated(true);
  }, []);




  const menuGroups: { label: string; items: { title: string; icon: typeof LayoutDashboard; to: string }[] }[] = [
    {
      label: 'Principal',
      items: [
        { title: 'Dashboard', icon: LayoutDashboard, to: '/painel' },
      ],
    },
    {
      label: 'Automações',
      items: [
        { title: 'Consulta Automática', icon: Bot, to: '/painel/consulta-automatica' },
        { title: 'Importação Automática', icon: CloudDownload, to: '/painel/importacao-automatica' },
        { title: 'Empresas Importadas', icon: Database, to: '/painel/empresas-importadas' },
        { title: 'Links Gerados', icon: LinkIcon, to: '/painel/links-gerados' },
        { title: 'Pagamentos', icon: DollarSign, to: '/painel/pagamentos' },
        
        { title: 'Envio em Massa', icon: Send, to: '/painel/envio-massa' },
        { title: 'WhatsApp em Massa', icon: MessageSquare, to: '/painel/whatsapp-massa' },
        { title: 'E-mails Enviados', icon: CheckCircle2, to: '/painel/enviados' },
        { title: 'Entregabilidade', icon: Activity, to: '/painel/entregabilidade' },
      ],
    },
    {
      label: 'Configurações',
      items: [
        { title: 'Configurações de Pagamento', icon: DollarSign, to: '/painel/configuracoes-pagamento' },
        { title: 'Preços', icon: DollarSign, to: '/painel/precos' },

        
        { title: 'Exibição do Site', icon: LayoutDashboard, to: '/painel/exibicao-site' },
        { title: 'Visual da Página', icon: Monitor, to: '/painel/visual-pagina' },
        { title: 'Pop-up do Site', icon: MessageSquare, to: '/painel/pop-up-site' },
        { title: 'API Casa dos Dados', icon: KeyRound, to: '/painel/api-casa-dos-dados' },
        { title: 'Auditoria de Fluxo', icon: ClipboardList, to: '/painel/auditoria' },
        { title: 'Modelos de E-mail', icon: Mail, to: '/painel/modelos-email' },
        { title: 'Remetente de E-mail', icon: Send, to: '/painel/remetente-email' },
      ],
    },
  ];



  const getBreadcrumbLabel = (path: string) => {
    if (path === '/painel') return 'Dashboard';
    if (path === '/painel/consulta-automatica') return 'Consulta Automática';
    if (path === '/painel/importacao-automatica') return 'Importação Automática';
    if (path === '/painel/empresas-importadas') return 'Empresas Importadas';
    if (path.startsWith('/painel/empresas-importadas/')) return 'Detalhes da Empresa';
    if (path === '/painel/links-gerados') return 'Links Gerados';
    if (path === '/painel/pagamentos') return 'Pagamentos';
    if (path === '/painel/configuracoes-pagamento') return 'Configurações de Pagamento';
    if (path === '/painel/precos') return 'Preços';
    if (path === '/painel/exibicao-site') return 'Exibição do Site';
    if (path === '/painel/visual-pagina') return 'Visual da Página';
    if (path === '/painel/pop-up-site') return 'Pop-up do Site';
    if (path === '/painel/api-casa-dos-dados') return 'API Casa dos Dados';
    if (path === '/painel/auditoria') return 'Auditoria de Fluxo';
    if (path === '/painel/modelos-email') return 'Modelos de E-mail';
    if (path === '/painel/remetente-email') return 'Remetente de E-mail';
    if (path === '/painel/envio-massa') return 'Envio em Massa';
    if (path === '/painel/enviados') return 'E-mails Enviados';
    if (path === '/painel/whatsapp-massa') return 'WhatsApp em Massa';
    if (path === '/painel/entregabilidade') return 'Entregabilidade';
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
            {menuGroups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
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
            ))}
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

              <div className="flex shrink-0 items-center gap-2">
                <Button

                  size="sm"
                  variant="ghost"
                  onClick={handleCleanup}
                  disabled={cleaning}
                  className="text-slate-400 hover:text-red-600 gap-2"
                  title="Limpeza total: apaga tudo exceto vendas pagas."
                >
                  {cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  <span className="hidden lg:inline text-xs">Limpar Banco</span>
                </Button>

                <div className="hidden text-right sm:block ml-2">
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
            {cleanupReport && (
              <div className={cn(
                'mb-6 border p-4 shadow-sm',
                cleanupReport.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      {cleanupReport.success ? 'Limpeza concluída e verificada' : 'Limpeza não concluída'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-700">{cleanupReport.error ?? cleanupReport.message}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setCleanupReport(null)}>Fechar</Button>
                </div>
                <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <div className="font-semibold text-slate-800">Removido</div>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-700">{formatCleanupCounts(cleanupReport.removed)}</pre>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">Restante após verificação</div>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-700">{formatCleanupCounts(cleanupReport.remaining)}</pre>
                  </div>
                </div>
              </div>
            )}
            {hydrated ? (
              <Outlet />
            ) : (
              <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
                Carregando configurações…
              </div>
            )}
          </div>

        </main>
        <GlobalFloatingPanels />
      </div>
    </SidebarProvider>
  );
}