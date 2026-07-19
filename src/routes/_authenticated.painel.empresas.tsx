import { createFileRoute, useNavigate } from '@tanstack/react-router';
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
  Phone,
  Plus
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

export const Route = createFileRoute('/_authenticated/painel/empresas')({
  component: CompaniesPage,
});

function CompaniesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies', searchTerm],
    queryFn: async () => {
      let query = supabase.from('companies').select('*');
      
      if (searchTerm) {
        query = query.or(`cnpj.ilike.%${searchTerm}%,razao_social_original.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empresas Reais</h1>
          <p className="text-slate-500">Gerencie a lista de empresas capturadas via API.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button 
            size="sm" 
            className="bg-brand-blue hover:bg-brand-navy gap-2"
            onClick={() => navigate({ to: '/painel' })}
          >
            <Plus className="h-4 w-4" />
            Nova Consulta
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input 
                placeholder="Buscar por CNPJ, Razão Social ou E-mail..." 
                className="pl-10" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-20 text-center text-slate-500">Carregando empresas...</div>
          ) : companies && companies.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900 line-clamp-1">{company.razao_social_original}</span>
                        <span className="text-xs text-slate-500">{company.nome_titular_exibicao}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm whitespace-nowrap">{company.cnpj}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {company.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <span className="text-xs truncate max-w-[150px]">{company.email}</span>
                          </div>
                        )}
                        {Array.isArray(company.telefones) && (company.telefones as string[]).length > 0 && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-slate-400" />
                            <span className="text-xs">{(company.telefones as string[])[0]}</span>
                          </div>
                        )}
                        {!company.email && (!Array.isArray(company.telefones) || (company.telefones as string[]).length === 0) && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={company.situacao_cadastral === '02' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>
                        {company.situacao_cadastral === '02' ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {company.nivel_dados || 'simples'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => navigate({ 
                          to: '/', 
                          search: { 
                            cnpj: company.cnpj, 
                            nome: company.nome_titular_exibicao || undefined 
                          } 
                        })}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-20 text-center space-y-4">
              <p className="text-slate-500">Nenhuma empresa real encontrada ainda.</p>
              <Button 
                variant="outline" 
                onClick={() => navigate({ to: '/painel' })}
              >
                Realizar primeira consulta
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
