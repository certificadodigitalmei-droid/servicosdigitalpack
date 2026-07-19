import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Save, Globe } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/painel/configuracoes')({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações do Sistema</h1>
        <p className="text-slate-500">Personalize o site e gerencie o checkout.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identidade Visual</CardTitle>
            <CardDescription>Logo e cores da Central MEI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Logo do Site</Label>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50">
                  <Upload className="h-6 w-6 text-slate-400" />
                </div>
                <div className="space-y-1">
                  <Button variant="outline" size="sm">Alterar Logo</Button>
                  <p className="text-xs text-slate-500">PNG ou SVG, máx 2MB.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nome da Central</Label>
              <Input defaultValue="Central MEI Digital" />
            </div>
            <Button className="w-full bg-brand-blue hover:bg-brand-navy gap-2">
              <Save className="h-4 w-4" />
              Salvar Identidade
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configurações de Venda</CardTitle>
            <CardDescription>Gerencie produtos e taxas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Valor do Serviço (R$)</Label>
              <Input type="number" defaultValue="97.00" />
            </div>
            <div className="space-y-2">
              <Label>Nome do Produto no Checkout</Label>
              <Input defaultValue="Emissão de Certificado Digital" />
            </div>
            <div className="space-y-2">
              <Label>Link de Redirecionamento Pós-Pagamento</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-10" placeholder="https://..." />
              </div>
            </div>
            <Button className="w-full bg-brand-blue hover:bg-brand-navy gap-2">
              <Save className="h-4 w-4" />
              Salvar Checkout
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
