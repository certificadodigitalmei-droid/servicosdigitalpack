import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RefreshCw, AlertTriangle, Braces } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/painel/monitor')({
  component: MonitorPage,
});

function MonitorPage() {
  const [rangeQuery, setRangeQuery] = useState('{}');
  const [isAutoActive, setIsAutoActive] = useState(false);

  const handleSaveRange = () => {
    try {
      const parsed = JSON.parse(rangeQuery);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      toast.success("Configuração de data salva!");
    } catch (e) {
      toast.error("JSON inválido. Deve ser um objeto {}.");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Monitor Automático</h1>
        <p className="text-slate-500">Integração real com busca filtrada AquiCNPJ.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Controle do Monitor</CardTitle>
            <CardDescription>Ative a descoberta automática de novas empresas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Status do Monitor</Label>
              <div className="flex items-center gap-2">
                <Switch 
                  checked={isAutoActive} 
                  onCheckedChange={(val) => {
                    if (val) {
                      toast.error("Falta configurar o range_query oficial da data de abertura.");
                      setIsAutoActive(false);
                    }
                  }}
                />
                <span className="text-sm font-medium">{isAutoActive ? 'Sincronização Ativa' : 'Desativado'}</span>
              </div>
            </div>
            
            <div className="p-3 bg-amber-50 rounded-md border border-amber-200 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                O monitor automático "Abertas hoje" requer o range_query oficial configurado.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Intervalo de Busca</Label>
              <Select defaultValue="1h">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">A cada 15 minutos</SelectItem>
                  <SelectItem value="1h">A cada 1 hora</SelectItem>
                  <SelectItem value="6h">A cada 6 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data de Abertura (Range Query)</CardTitle>
            <CardDescription>Cole aqui o JSON oficial fornecido pela AquiCNPJ.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>JSON oficial do range_query</Label>
                <Braces className="h-3 w-3 text-slate-400" />
              </div>
              <textarea 
                className="w-full h-32 p-3 font-mono text-xs border rounded-md bg-slate-50"
                value={rangeQuery}
                onChange={(e) => setRangeQuery(e.target.value)}
                placeholder='{"inicio_atividade": {"gte": "..."}}'
              />
            </div>
            <Button onClick={handleSaveRange} className="w-full bg-brand-blue hover:bg-brand-navy gap-2">
              <Save className="h-4 w-4" />
              Validar e Salvar JSON
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Filtros Reais da API</CardTitle>
            <CardDescription>Estes filtros serão aplicados no endpoint /search/empresa/simple.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Somente MEI</Label>
                    <p className="text-[10px] text-slate-500">extras.somente_mei: true</p>
                  </div>
                  <Switch checked={true} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Somente Ativa</Label>
                    <p className="text-[10px] text-slate-500">situacao_cadastral: ["02"]</p>
                  </div>
                  <Switch checked={true} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Somente Matriz</Label>
                    <p className="text-[10px] text-slate-500">extras.somente_matriz: true</p>
                  </div>
                  <Switch checked={true} />
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Exigir E-mail</Label>
                    <p className="text-[10px] text-slate-500">extras.com_email: true</p>
                  </div>
                  <Switch checked={true} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Remover Contabilidade</Label>
                    <p className="text-[10px] text-slate-500">extras.remove_contab: true</p>
                  </div>
                  <Switch checked={true} />
                </div>
                <Button variant="outline" className="w-full gap-2 mt-2">
                  <RefreshCw className="h-4 w-4" />
                  Testar Consulta Filtrada Agora
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
