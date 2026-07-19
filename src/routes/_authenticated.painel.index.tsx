import { createFileRoute, Link } from '@tanstack/react-router';
import { Filter, FileText, LayoutDashboard, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authenticated/painel/')({
  component: DashboardIndex,
});

function DashboardIndex() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Bem-vindo ao Painel</h1>
        <p className="text-slate-500">Selecione uma ferramenta para começar.</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-2 hover:border-brand-blue transition-colors group">
          <CardHeader>
            <div className="h-12 w-12 rounded-lg bg-blue-50 text-brand-blue flex items-center justify-center mb-4 group-hover:bg-brand-blue group-hover:text-white transition-colors">
              <Filter className="h-6 w-6" />
            </div>
            <CardTitle>Filtrar Empresas MEI</CardTitle>
            <CardDescription>
              Importe um CSV de empresas e gere um novo arquivo contendo apenas Microempreendedores Individuais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full bg-brand-navy hover:bg-brand-blue">
              <Link to="/painel/filtrar-mei" className="flex items-center gap-2">
                Abrir Ferramenta
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 opacity-60">
          <CardHeader>
            <div className="h-12 w-12 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center mb-4">
              <FileText className="h-6 w-6" />
            </div>
            <CardTitle>Relatórios Adicionais</CardTitle>
            <CardDescription>
              Módulo em desenvolvimento para análises personalizadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled variant="outline" className="w-full">
              Em breve
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}