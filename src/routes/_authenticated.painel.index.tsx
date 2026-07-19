import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { 
  Building2, 
  Users, 
  TrendingUp, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getUsageStats, simpleSearch, completeSearch } from '@/lib/aquicnpj/aquicnpj.functions';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/_authenticated/painel/')({
  component: DashboardIndex,
});

function DashboardIndex() {
  const [testCnpj, setTestCnpj] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: usage, isLoading: loadingUsage, refetch: refetchUsage } = useQuery({
    queryKey: ['aquicnpj-usage'],
    queryFn: () => getUsageStats(),
    retry: false
  });

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { count: companiesCount } = await supabase.from('companies').select('*', { count: 'exact', head: true });
      const { count: leadsCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
      return {
        companies: companiesCount || 0,
        leads: leadsCount || 0
      };
    }
  });

  const searchMutation = useMutation({
    mutationFn: (cnpj: string) => simpleSearch({ cnpj }),
    onSuccess: (data: any) => {
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("Empresa localizada e salva com sucesso!");
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['companies'] });
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao consultar CNPJ");
    }
  });

  const completeMutation = useMutation({
    mutationFn: (cnpj: string) => {
      if (!confirm("Esta consulta consome crédito de lead da AquiCNPJ. Deseja continuar?")) {
        throw new Error("Cancelado pelo usuário");
      }
      return completeSearch({ cnpj });
    },
    onSuccess: (data: any) => {
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("Dados completos obtidos e salvos!");
        refetchUsage();
        queryClient.invalidateQueries({ queryKey: ['companies'] });
      }
    },
    onError: (error: any) => {
      if (error.message !== "Cancelado pelo usuário") {
        toast.error(error.message || "Erro na consulta completa");
      }
    }
  });

  const dashboardStats = [
    { 
      label: 'Empresas Reais', 
      value: stats?.companies.toString() || '0', 
      icon: Building2,
      color: 'blue'
    },
    { 
      label: 'Créditos Usados', 
      value: usage?.used?.toString() || '—', 
      icon: TrendingUp,
      color: 'orange'
    },
    { 
      label: 'Créditos Restantes', 
      value: usage?.remaining?.toString() || '—', 
      icon: CheckCircle2,
      color: 'green'
    },
    { 
      label: 'Leads Reais', 
      value: stats?.leads.toString() || '0', 
      icon: Users,
      color: 'purple'
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visão Geral</h1>
          <p className="text-slate-500">Acompanhe o monitoramento e estatísticas reais do sistema.</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetchUsage()}
          disabled={loadingUsage}
          className="gap-2"
        >
          <Activity className={`h-4 w-4 ${loadingUsage ? 'animate-spin' : ''}`} />
          Atualizar Saldo
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {dashboardStats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 text-${stat.color}-600`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Teste com CNPJ Real</CardTitle>
            <CardDescription>Consulte um CNPJ diretamente na API AquiCNPJ.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input 
                  placeholder="Digite o CNPJ (apenas números)..." 
                  className="pl-10"
                  value={testCnpj}
                  onChange={(e) => setTestCnpj(e.target.value)}
                />
              </div>
              <Button 
                onClick={() => searchMutation.mutate(testCnpj)}
                disabled={searchMutation.isPending || !testCnpj}
                className="bg-brand-blue hover:bg-brand-navy"
              >
                {searchMutation.isPending ? 'Consultando...' : 'Busca Simples'}
              </Button>
            </div>

            {searchMutation.data && !searchMutation.data.error && (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Razão Social</p>
                    <p className="font-medium">{searchMutation.data.razao_social_original}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">CNPJ</p>
                    <p className="font-mono">{searchMutation.data.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Situação</p>
                    <p className="font-medium">{searchMutation.data.situacao_cadastral === '02' ? 'Ativa' : searchMutation.data.situacao_cadastral}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Início Atividade</p>
                    <p className="font-medium">{searchMutation.data.inicio_atividade || '—'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="gap-2"
                    onClick={() => completeMutation.mutate(searchMutation.data.cnpj)}
                    disabled={completeMutation.isPending || searchMutation.data.nivel_dados === 'completo'}
                  >
                    <TrendingUp className="h-4 w-4" />
                    {searchMutation.data.nivel_dados === 'completo' ? 'Dados Completos Obtidos' : 'Obter Dados Completos (1 crédito)'}
                  </Button>
                  
                  {searchMutation.data.nivel_dados === 'completo' && (
                    <Button 
                      variant="secondary" 
                      size="sm"
                      className="gap-2"
                      onClick={() => navigate({ to: '/', search: { cnpj: searchMutation.data.cnpj, nome: searchMutation.data.nome_titular_exibicao } })}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Ver Página Pública
                    </Button>
                  )}
                </div>

                {searchMutation.data.nivel_dados === 'completo' && (
                  <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-slate-200">
                    <div>
                      <p className="text-slate-500">E-mail</p>
                      <p className="font-medium">{searchMutation.data.email || 'Não encontrado'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Telefones</p>
                      <p className="font-medium">
                        {Array.isArray(searchMutation.data.telefones) && searchMutation.data.telefones.length > 0 
                          ? searchMutation.data.telefones.join(', ') 
                          : 'Não encontrados'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conexão API</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Status</span>
              {usage ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> Conectado
                </span>
              ) : loadingUsage ? (
                <span className="text-xs text-slate-500 animate-pulse">Verificando...</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                  <XCircle className="h-3 w-3" /> Desconectado
                </span>
              )}
            </div>
            {usage && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Limite Total</span>
                  <span className="text-sm font-medium text-slate-900">{usage.limit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Expira em</span>
                  <span className="text-sm font-medium text-slate-900">{usage.reset_date}</span>
                </div>
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Uso de créditos</span>
                    <span className="text-slate-900 font-medium">{usage.percentage}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-brand-blue" 
                      style={{ width: `${usage.percentage}%` }}
                    />
                  </div>
                </div>
              </>
            )}
            {!usage && !loadingUsage && (
              <div className="p-3 bg-amber-50 rounded-md border border-amber-200 flex gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Configure o AQUICNPJ_ACCESS_TOKEN nas Edge Functions para ativar.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
