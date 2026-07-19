import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import {
  History,
  Calendar,
  FileText,
  Download,
  ArrowLeft,
  Search,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const Route = createFileRoute('/_authenticated/painel/gerador-links/historico')({
  component: HistoricoGeracoesPage,
});

function HistoricoGeracoesPage() {
  const [generations, setGenerations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchGenerations = async () => {
    try {
      const { data, error } = await supabase
        .from('link_generations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGenerations(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar histórico');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGenerations();
  }, []);

  const downloadGeneration = async (id: string, fileName: string) => {
    try {
      toast.info('Preparando download...');
      const { data, error } = await supabase
        .from('company_links')
        .select('company_data, public_token, public_url, checkout_url, created_at')
        .eq('generation_id', id);

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error('Nenhum dado encontrado para esta geração');
        return;
      }

      // Format data for CSV
      const csvData = data.map(item => ({
        ...(typeof item.company_data === 'object' ? item.company_data : {}),
        TOKEN: item.public_token,
        LINK_PUBLICO: item.public_url,
        LINK_CHECKOUT: item.checkout_url,
        DATA_GERACAO: format(new Date(item.created_at), 'dd/MM/yyyy HH:mm:ss')
      }));

      // In a real scenario, we might need PapaParse here too, but for simplicity:
      const { default: Papa } = await import('papaparse');
      const csv = Papa.unparse(csvData);
      const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `links_${fileName}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Download iniciado!');
    } catch (error: any) {
      toast.error('Erro ao baixar arquivo');
      console.error(error);
    }
  };

  const deleteAll = async () => {
    try {
      toast.info('Apagando todos os links...');
      const emptyUuid = '00000000-0000-0000-0000-000000000000';
      const { error: e1 } = await supabase.from('company_links').delete().neq('id', emptyUuid);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('link_generations').delete().neq('id', emptyUuid);
      if (e2) throw e2;
      setGenerations([]);
      toast.success('Todos os links foram apagados');
    } catch (error: any) {
      toast.error(`Erro ao apagar: ${error.message}`);
      console.error(error);
    }
  };

  const filteredGenerations = generations.filter(gen =>
    gen.arquivo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/painel/gerador-links">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Histórico de Gerações</h1>
            <p className="text-slate-500">Visualize e baixe links gerados anteriormente.</p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" disabled={generations.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" /> Apagar todos os links
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar todos os links gerados?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove permanentemente todas as gerações e todos os links já criados. Os links públicos deixarão de funcionar. Não pode ser desfeito.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={deleteAll} className="bg-red-600 hover:bg-red-700">
                Apagar tudo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Buscar por nome do arquivo..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="text-sm text-slate-500">
              {filteredGenerations.length} gerações encontradas
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <div className="animate-spin mb-4">
                <History className="h-8 w-8" />
              </div>
              <p>Carregando histórico...</p>
            </div>
          ) : filteredGenerations.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
              <History className="h-12 w-12 mb-4 opacity-20" />
              <p>Nenhuma geração encontrada.</p>
              <Button variant="link" asChild className="mt-2">
                <Link to="/painel/gerador-links">Gerar novos links agora</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="px-6 py-3">Arquivo</th>
                    <th className="px-6 py-3">Data/Hora</th>
                    <th className="px-6 py-3 text-center">Empresas</th>
                    <th className="px-6 py-3 text-center">Links</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGenerations.map((gen) => (
                    <tr key={gen.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-blue-50 text-brand-blue rounded flex items-center justify-center">
                            <FileText className="h-4 w-4" />
                          </div>
                          <span className="font-medium text-slate-900">{gen.arquivo}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(gen.created_at), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-medium text-slate-700">
                        {gen.total_empresas}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-50 text-green-700 text-xs font-bold">
                          {gen.total_links} ATIVOS
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="hover:bg-brand-blue hover:text-white border-slate-200"
                          onClick={() => downloadGeneration(gen.id, gen.arquivo)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Baixar CSV
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}