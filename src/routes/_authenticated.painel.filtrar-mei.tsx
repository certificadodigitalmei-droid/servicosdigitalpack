import { createFileRoute } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/painel/filtrar-mei')({
  component: FilterMeiPage,
});

function FilterMeiPage() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      toast.info(`Arquivo selecionado: ${selectedFile.name}`);
    }
  };

  const processFile = () => {
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawData = results.data;
        
        // Simple logic: find column that looks like MEI
        const headers = Object.keys(rawData[0] || {});
        const meiColumn = headers.find(h => 
          h.toLowerCase().includes('mei') || h.toLowerCase().includes('optante')
        );

        if (!meiColumn) {
          toast.error('Coluna MEI não identificada automaticamente.');
          return;
        }

        const filtered = rawData.filter(row => {
          const val = String(row[meiColumn] || '').toLowerCase().trim();
          return ['sim', 's', 'true', '1', 'yes', 'mei', 'optante'].includes(val);
        });

        setData(filtered);
        setSummary({
          total: rawData.length,
          kept: filtered.length,
          removed: rawData.length - filtered.length,
          meiColumn
        });
        toast.success('Arquivo processado com sucesso!');
      }
    });
  };

  const downloadFiltered = () => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `empresas_mei_filtrado_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filtrar Empresas MEI</CardTitle>
          <CardDescription>Envie um arquivo CSV de empresas. O sistema manterá somente os registros identificados como Microempreendedor Individual — MEI.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept=".csv" onChange={handleFileChange} />
          <div className="flex gap-2">
            <Button onClick={processFile} disabled={!file}>Processar e filtrar MEIs</Button>
            <Button variant="outline" onClick={() => { setFile(null); setData([]); setSummary(null); }}>Limpar</Button>
          </div>
          
          {summary && (
            <div className="mt-6 space-y-2">
              <p>Total recebido: {summary.total}</p>
              <p>Empresas MEI mantidas: {summary.kept}</p>
              <p>Empresas não MEI eliminadas: {summary.removed}</p>
              <Button onClick={downloadFiltered} className="mt-4">Baixar CSV somente com MEIs</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}