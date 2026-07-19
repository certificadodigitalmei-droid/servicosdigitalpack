import { createFileRoute } from '@tanstack/react-router';
import { 
  Building2, 
  Users, 
  TrendingUp, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Search
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/_authenticated/painel/')({
  component: DashboardIndex,
});

function DashboardIndex() {
  const stats = [
    { 
      label: 'Empresas Monitoradas', 
      value: '1.284', 
      change: '+12.5%', 
      trend: 'up', 
      icon: Building2,
      color: 'blue'
    },
    { 
      label: 'Novas Hoje', 
      value: '42', 
      change: '+4.3%', 
      trend: 'up', 
      icon: Clock,
      color: 'green'
    },
    { 
      label: 'Créditos AquiCNPJ', 
      value: '4.850', 
      change: '-120', 
      trend: 'down', 
      icon: TrendingUp,
      color: 'orange'
    },
    { 
      label: 'Leads Gerados', 
      value: '856', 
      change: '+18.2%', 
      trend: 'up', 
      icon: Users,
      color: 'purple'
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Visão Geral</h1>
        <p className="text-slate-500">Acompanhe o monitoramento e estatísticas do sistema.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 text-${stat.color}-600`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="mt-1 flex items-center text-xs">
                {stat.trend === 'up' ? (
                  <ArrowUpRight className="mr-1 h-3 w-3 text-emerald-500" />
                ) : (
                  <ArrowDownRight className="mr-1 h-3 w-3 text-red-500" />
                )}
                <span className={stat.trend === 'up' ? 'text-emerald-500' : 'text-red-500'}>
                  {stat.change}
                </span>
                <span className="ml-1 text-slate-400 font-normal">em relação ao período anterior</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Busca Rápida</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input placeholder="Buscar por CNPJ ou Razão Social..." className="pl-10" />
              </div>
              <Button className="bg-brand-blue hover:bg-brand-navy">Consultar</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status do Monitor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Estado atual</span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                Ativo
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Próxima execução</span>
              <span className="text-sm font-medium text-slate-900">Em 14 minutos</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Última sincronização</span>
              <span className="text-sm font-medium text-slate-900">Hoje, às 14:30</span>
            </div>
            <Button variant="outline" className="w-full">Ver logs</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
