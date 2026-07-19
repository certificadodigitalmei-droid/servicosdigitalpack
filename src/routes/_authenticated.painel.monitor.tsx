import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RefreshCw } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/painel/monitor')({
  component: MonitorPage,
});

function MonitorPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Monitor Automático</h1>
        <p className="text-slate-500">Configure a sincronização com a API AquiCNPJ.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configurações da API</CardTitle>
            <CardDescription>Configure suas credenciais e limites de consulta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Status do Monitor</Label>
              <div className="flex items-center gap-2">
                <Switch checked={true} />
                <span className="text-sm font-medium">Sincronização Ativa</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Intervalo de Sincronização</Label>
              <Select defaultValue="1h">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">A cada 15 minutos</SelectItem>
                  <SelectItem value="30m">A cada 30 minutos</SelectItem>
                  <SelectItem value="1h">A cada 1 hora</SelectItem>
                  <SelectItem value="6h">A cada 6 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="pt-4">
              <Button className="w-full bg-brand-blue hover:bg-brand-navy gap-2">
                <Save className="h-4 w-4" />
                Salvar Configurações
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Filtros de Monitoramento</CardTitle>
            <CardDescription>Defina quais empresas serão importadas automaticamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Apenas MEI</Label>
              <Switch checked={true} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Apenas Ativa</Label>
              <Switch checked={true} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Somente Matriz</Label>
              <Switch checked={false} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Exigir E-mail</Label>
              <Switch checked={true} />
            </div>
            <div className="pt-4">
              <Button variant="outline" className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Testar Filtros Agora
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
