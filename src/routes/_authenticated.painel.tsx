import { createFileRoute, Outlet, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { cleanupUnsentCompanies } from '@/lib/automation/cleanup.functions';
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
  CheckCircle2,
  DollarSign,
  KeyRound,
  MessageSquare,
  Cloud,
  CloudDownload,
  ClipboardList,
  Loader2,
  BellRing,
  Trash2,
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
import { getCloudState, saveCloudState } from '@/lib/cloud-state.functions';
import { SidebarPlanInfo } from '@/components/painel/SidebarPlanInfo';
import { getAutomationStatus, toggleGlobalAutomation } from '@/lib/automation/global-status.functions';
import { Power, PowerOff } from 'lucide-react';

// Chaves de localStorage que compõem o "estado do painel" salvo na nuvem.
const CLOUD_PREFIXES = ['automation:', 'campanha:', 'envio:', 'consulta:', 'monitor:', 'painel:'];

function collectLocalSnapshot(): Record<string, string> {
  const snap: Record<string, string> = {};
  if (typeof window === 'undefined') return snap;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (CLOUD_PREFIXES.some((p) => key.startsWith(p))) {
      const val = window.localStorage.getItem(key);
      if (val != null) snap[key] = val;
    }
  }
  return snap;
}

function applyLocalSnapshot(snap: Record<string, string> | null) {
  if (!snap || typeof window === 'undefined') return;
  for (const [k, v] of Object.entries(snap)) {
    try { window.localStorage.setItem(k, v); } catch { /* quota */ }
  }
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

  // Salvar tudo na nuvem (todas as configurações do painel).
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [hydrated, setHydrated] = useState(false);
  const doSave = useServerFn(saveCloudState);
  const doLoad = useServerFn(getCloudState);
  const doCleanup = useServerFn(cleanupUnsentCompanies);
  const [cleaning, setCleaning] = useState(false);

  // Status da automação global na nuvem
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null);
  const [loadingAuto, setLoadingAuto] = useState(true);
  const fetchAuto = useServerFn(getAutomationStatus);
  const doToggleAuto = useServerFn(toggleGlobalAutomation);

  const refreshAutoStatus = async (isInitial = false) => {
    try {
      const status = await fetchAuto();
      setAutoEnabled(status.isAutoEnabled);
      if (isInitial) {
        console.log('Status inicial da nuvem carregado:', status.isAutoEnabled);
      }
    } catch (e) { 
      console.error('Erro ao buscar status da nuvem:', e);
    } finally { 
      setLoadingAuto(false); 
    }
  };

  useEffect(() => {
    refreshAutoStatus(true);
    const id = setInterval(() => refreshAutoStatus(), 15000);
    return () => clearInterval(id);
  }, []);

  const handleToggleAuto = async () => {
    const next = !autoEnabled;
    setAutoEnabled(next);
    try {
      await doToggleAuto({ data: { enabled: next } });
      if (next) {
        toast.success('Automação 24/7 ativada na nuvem.');
      } else {
        toast.info('Envios pausados pelo usuário.');
      }
    } catch (e: any) {
      setAutoEnabled(!next);
      toast.error('Erro ao mudar status: ' + (e?.message || 'erro'));
    }
  };

  const lastSnapshotJsonRef = useRef<string>('');
  const persistNow = async () => {
    const snapshot = collectLocalSnapshot();
    const json = JSON.stringify(snapshot);
    if (json === lastSnapshotJsonRef.current) {
      return lastSavedAt; // nada mudou, não gasta upsert
    }
    const r = await doSave({ data: { snapshot } });
    lastSnapshotJsonRef.current = json;
    setLastSavedAt(r.savedAt);
    try { window.localStorage.setItem('painel:cloudSyncedAt', r.savedAt); } catch {}
    return r.savedAt;
  };


  const saveAll = async () => {
    setSaving(true);
    try {
      await persistNow();
      toast.success('Configurações do site salvas na nuvem.');
    } catch (e: any) {
      toast.error('Falha ao salvar: ' + (e?.message ?? 'erro'));
    } finally {
      setSaving(false);
    }
  };

  const handleCleanup = async () => {

    if (!confirm('Deseja apagar TODOS os dados (empresas, links, pedidos pendentes, clientes sem compra) e deixar o painel limpo? Apenas vendas confirmadas serão preservadas.')) return;
    
    setCleaning(true);
    try {
      const result = await doCleanup({ data: { confirm: true } });
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error('Erro na limpeza: ' + (result.message || result.error));
      }
    } catch (e: any) {
      toast.error('Falha ao executar limpeza: ' + (e?.message ?? 'erro'));
    } finally {
      setCleaning(false);
    }
  };

  // Lê apenas a data do último backup no mount. O snapshot não é aplicado
  // automaticamente: alterar localStorage durante a inicialização fazia as
  // sub-rotas remontarem e dava a impressão de F5 repetido. A restauração
  // continua disponível somente pelo botão "Restaurar".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await doLoad();
        if (cancelled) return;
        if (r.updatedAt) setLastSavedAt(r.updatedAt);
      } catch { /* silencioso */ }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AUTO-SAVE: intercepta writes em localStorage nas chaves do painel e
  // agenda um upload debounced (2,5s). Também salva ao sair da aba.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    const isTracked = (k: string) =>
      CLOUD_PREFIXES.some((p) => k.startsWith(p)) &&
      k !== 'painel:cloudSyncedAt' &&
      !k.startsWith('painel:cloudReloaded:');
    let timer: number | null = null;
    let dirty = false;
    const schedule = () => {
      dirty = true;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        timer = null;
        if (!dirty) return;
        dirty = false;
        try { await persistNow(); } catch { /* silencioso; próximo write tentará de novo */ }
      }, 15000);
    };


    const origSet = window.localStorage.setItem.bind(window.localStorage);
    const origRemove = window.localStorage.removeItem.bind(window.localStorage);
    window.localStorage.setItem = function (k: string, v: string) {
      origSet(k, v);
      if (isTracked(k)) schedule();
    } as typeof window.localStorage.setItem;
    window.localStorage.removeItem = function (k: string) {
      origRemove(k);
      if (isTracked(k)) schedule();
    } as typeof window.localStorage.removeItem;

    const flush = () => {
      if (dirty) {
        dirty = false;
        // Envio síncrono não é possível; dispara sem aguardar.
        persistNow().catch(() => {});
      }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (timer) window.clearTimeout(timer);
      window.localStorage.setItem = origSet as typeof window.localStorage.setItem;
      window.localStorage.removeItem = origRemove as typeof window.localStorage.removeItem;
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);




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
        { title: 'E-mails Enviados', icon: CheckCircle2, to: '/painel/enviados' },
      ],
    },
    {
      label: 'Configurações',
      items: [
        { title: 'Configurações de Pagamento', icon: DollarSign, to: '/painel/configuracoes-pagamento' },
        { title: 'Preços', icon: DollarSign, to: '/painel/precos' },

        
        { title: 'Exibição do Site', icon: LayoutDashboard, to: '/painel/exibicao-site' },
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

    
    if (path === '/painel/google-workspace') return 'Google Workspace';
    if (path === '/painel/exibicao-site') return 'Exibição do Site';
    if (path === '/painel/pop-up-site') return 'Pop-up do Site';
    if (path === '/painel/api-casa-dos-dados') return 'API Casa dos Dados';
    if (path === '/painel/importar-empresas') return 'Importar Empresas';
    if (path === '/painel/filtrar-mei') return 'Filtrar Empresas MEI';
    if (path === '/painel/gerador-links') return 'Gerador de Links';
    
    if (path === '/painel/modelos-email') return 'Modelos de E-mail';
    if (path === '/painel/remetente-email') return 'Remetente de E-mail';

    if (path === '/painel/envio-massa') return 'Envio em Massa';
    if (path === '/painel/workspace-envio') return 'Envio Google Workspace';
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
                <div className="flex items-center gap-2 mr-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                  <div className={cn(
                    "h-2 w-2 rounded-full animate-pulse",
                    autoEnabled ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300"
                  )} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">
                    {autoEnabled === null ? "Nuvem: Carregando..." : autoEnabled ? "Nuvem: Ativo" : "Nuvem: Pausado"}
                  </span>
                  <Button
                    size="icon"
                    variant={autoEnabled ? "default" : "outline"}
                    className={cn(
                      "h-8 w-8 rounded-md transition-all",
                      autoEnabled ? "bg-red-500 hover:bg-red-600 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white border-none"
                    )}
                    onClick={handleToggleAuto}
                    disabled={loadingAuto}
                    title={autoEnabled ? "Pausar envios na nuvem" : "Retomar envios na nuvem"}
                  >
                    {loadingAuto ? <Loader2 className="h-4 w-4 animate-spin" /> : (autoEnabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />)}
                  </Button>
                </div>

                <Button
                  size="sm"
                  onClick={saveAll}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm"
                  title="Salva TODAS as configurações (modelos, intervalos, filtros) para que o servidor use no automático."
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                  <span className="hidden sm:inline">Salvar Configurações</span>
                  <span className="sm:hidden">Salvar</span>
                </Button>
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
                {lastSavedAt && (
                  <span className="hidden lg:inline text-[10px] text-emerald-600">
                    ☁ Sync auto · {new Date(lastSavedAt).toLocaleString('pt-BR')}
                  </span>
                )}

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