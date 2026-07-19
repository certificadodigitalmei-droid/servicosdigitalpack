import { createFileRoute } from '@tanstack/react-router';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Filter, 
  Download, 
  ExternalLink, 
  Mail,
  Phone
} from 'lucide-react';

export const Route = createFileRoute('/_authenticated/painel/empresas')({
  component: CompaniesPage,
});

function CompaniesPage() {
  const dummyCompanies = [
    { 
      cnpj: '12.345.678/0001-90', 
      razao: 'EMPRESA EXEMPLO LTDA', 
      titular: 'JOÃO SILVA', 
      email: 'joao@exemplo.com', 
      status: 'Ativa', 
      data: '19/07/2026' 
    },
    { 
      cnpj: '98.765.432/0001-10', 
      razao: 'CENTRO MEI ME', 
      titular: 'MARIA SOUZA', 
      email: 'maria@test.com', 
      status: 'Ativa', 
      data: '18/07/2026' 
    },
    // ... mais itens
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empresas</h1>
          <p className="text-slate-500">Gerencie a lista de empresas capturadas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button size="sm" className="bg-brand-blue hover:bg-brand-navy gap-2">
            Adicionar Empresa
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Buscar por CNPJ, Razão Social ou E-mail..." className="pl-10" />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Captura</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dummyCompanies.map((company) => (
                <TableRow key={company.cnpj}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900">{company.razao}</span>
                      <span className="text-xs text-slate-500">{company.titular}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{company.cnpj}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <span className="text-sm">{company.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      {company.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">{company.data}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
