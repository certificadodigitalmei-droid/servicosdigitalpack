import { createFileRoute, Outlet, Link, useNavigate, useLocation } from '@tanstack/react-router';
import { 
  LayoutDashboard, 
  LogOut, 
  Building2, 
  ChevronRight,
  Filter,
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
  SidebarFooter
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/painel')({
  component: PanelLayout,
});

function PanelLayout() {
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('admin_auth_code');
    toast.success('Sessão encerrada');
    window.location.href = '/';
  };

  const menuItems = [
    { title: 'Dashboard', icon: LayoutDashboard, to: '/painel' },
    { title: 'Filtrar Empresas MEI', icon: Filter, to: '/painel/filtrar-mei' },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50">
        <Sidebar className="border-r border-slate-200">
          <SidebarHeader className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-brand-navy">Central MEI</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <Link to={item.to} className="flex items-center gap-3">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-slate-200 p-4">
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 text-slate-600 hover:text-red-600"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-auto p-8">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="lg:hidden" />
              <div className="h-6 w-px bg-slate-200 lg:hidden" />
              <nav className="flex items-center text-sm text-slate-500">
                <span>Painel</span>
                <ChevronRight className="mx-2 h-4 w-4" />
                <span className="font-medium text-slate-900 capitalize">
                  {location.pathname === '/painel' ? 'Dashboard' : 'Filtrar Empresas MEI'}
                </span>
              </nav>
            </div>
            
            <div className="flex items-center gap-4">
              <Avatar className="h-8 w-8 border border-slate-200">
                <AvatarFallback className="bg-brand-blue text-xs text-white">AD</AvatarFallback>
              </Avatar>
            </div>
          </div>
          
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}