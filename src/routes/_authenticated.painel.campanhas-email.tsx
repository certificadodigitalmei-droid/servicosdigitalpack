import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Smartphone, Monitor, Eye } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/painel/campanhas-email')({
  component: CampanhasEmail,
});

function CampanhasEmail() {
  const [template, setTemplate] = useState({
    subject: 'Informações sobre sua empresa {{NOME_EMPRESARIAL}}',
    preheader: 'Confira os detalhes cadastrais do seu CNPJ {{CNPJ}}',
    html: `
<div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ccc; padding: 20px;">
  <h1 style="color: #001a33;">Certificado Digital MEI</h1>
  <p>Olá, {{NOME_TITULAR}}.</p>
  <div style="border: 1px solid #ddd; padding: 15px; margin: 20px 0; border-radius: 8px;">
    <p><strong>Empresa:</strong> {{NOME_EMPRESARIAL}}</p>
    <p><strong>CNPJ:</strong> {{CNPJ}}</p>
    <p><strong>Data de abertura:</strong> {{DATA_ABERTURA}}</p>
    <p><strong>Situação:</strong> {{SITUACAO}}</p>
  </div>
  <a href="{{LINK_PUBLICO}}" style="background: #001a33; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Conhecer o serviço</a>
  <p style="font-size: 12px; color: #666; margin-top: 30px;">
    Mensagem enviada por uma empresa privada. Não possuímos vínculo com Receita Federal, Gov.br ou órgãos públicos.
  </p>
</div>`
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-brand-navy">Editor de Campanhas</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle>Configuração do E-mail</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <Label>Assunto</Label>
              <Input 
                value={template.subject}
                onChange={(e) => setTemplate({ ...template, subject: e.target.value })}
              />
            </div>
            <div>
              <Label>Preheader</Label>
              <Input 
                value={template.preheader}
                onChange={(e) => setTemplate({ ...template, preheader: e.target.value })}
              />
            </div>
            <div>
              <Label>Conteúdo HTML</Label>
              <Textarea 
                className="h-64 font-mono text-sm"
                value={template.html}
                onChange={(e) => setTemplate({ ...template, html: e.target.value })}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <CardHeader className="px-0 pt-0 flex flex-row items-center justify-between">
            <CardTitle>Pré-visualização</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm"><Monitor className="h-4 w-4 mr-2" /> Desktop</Button>
              <Button variant="outline" size="sm"><Smartphone className="h-4 w-4 mr-2" /> Celular</Button>
            </div>
          </CardHeader>
          <div className="border rounded-lg bg-white p-4 overflow-hidden min-h-[400px]">
            <div dangerouslySetInnerHTML={{ __html: template.html }} />
          </div>
        </Card>
      </div>
    </div>
  );
}
