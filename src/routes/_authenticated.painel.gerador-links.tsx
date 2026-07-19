import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { 
  Upload, 
  FileText, 
  ArrowRight, 
  CheckCircle2, 
  Loader2, 
  Download, 
  AlertCircle,
  Clock,
  ExternalLink,
  Table as TableIcon
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/_authenticated/painel/gerador-links')({
  component: GeradorLinksPage,
});

function GeradorLinksPage() {
  const [step, setStep] = useState<'upload' | 'processing' | 'result'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState<string>('');
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [finalData, setFinalData] = useState<any[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      Papa.parse(selectedFile, {
        header: true,
        preview: 5,
        skipEmptyLines: true,
        complete: (results) => {
          setPreviewData(results.data);
          setColumns(results.meta.fields || []);
        },
      });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  const generateToken = () => {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const processFile = async () => {
    if (!file) return;

    setStep('processing');
    setStartTime(Date.now());
    
    // 1. Create generation record
    const { data: gen, error: genError } = await supabase
      .from('link_generations')
      .insert({
        arquivo: file.name,
        total_empresas: 0,
        total_links: 0
      })
      .select('id')
      .single();

    if (genError) {
      toast.error('Erro ao criar registro de geração');
      setStep('upload');
      return;
    }

    setGenerationId(gen.id);

    // 2. Process CSV in chunks
    const domain = window.location.origin;
    const allResults: any[] = [];
    let processed = 0;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      chunk: async (results, parser) => {
        parser.pause();
        const chunk = results.data as any[];
        const inserts = chunk.map(row => {
          const token = generateToken();
          const public_url = `${domain}/certificado-mei/${token}`;
          const checkout_url = `${domain}/checkout/${token}`;
          
          const resultRow = {
            ...row,
            TOKEN: token,
            LINK_PUBLICO: public_url,
            LINK_CHECKOUT: checkout_url,
            DATA_GERACAO: new Date().toLocaleString('pt-BR'),
          };
          allResults.push(resultRow);

          return {
            generation_id: gen.id,
            token,
            public_url,
            checkout_url,
            company_data: row,
            status: 'active'
          };
        });

        const { error: insertError } = await supabase
          .from('company_links')
          .insert(inserts);

        if (insertError) {
          console.error('Insert error:', insertError);
          toast.error('Erro ao salvar links no banco');
        }

        processed += chunk.length;
        setProcessedCount(processed);
        
        // Update progress
        if (totalToProcess > 0) {
          const p = Math.round((processed / totalToProcess) * 100);
          setProgress(p);

          // Calculate remaining time
          if (startTime) {
            const elapsed = Date.now() - startTime;
            const perItem = elapsed / processed;
            const remaining = (totalToProcess - processed) * perItem;
            const seconds = Math.round(remaining / 1000);
            setRemainingTime(seconds > 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`);
          }
        }

        parser.resume();
      },
      beforeFirstChunk: () => {
        // We need total count first to show progress
        // PapaParse doesn't provide total count in chunk mode easily without reading twice
        // For a quick estimate, we'll just show the processed count if total is unknown
      },
      complete: async () => {
        // Update generation totals
        await supabase
          .from('link_generations')
          .update({
            total_empresas: processed,
            total_links: processed
          })
          .eq('id', gen.id);

        setFinalData(allResults);
        setStep('result');
        toast.success('Links gerados com sucesso!');
      }
    });
  };

  // Effect to get total count before processing if file changes
  useEffect(() => {
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setTotalToProcess(results.data.length);
        }
      });
    }
  }, [file]);

  const downloadCSV = () => {
    const csv = Papa.unparse(finalData);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `links_${file?.name || 'gerados'}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gerador de Links</h1>
          <p className="text-slate-500">Importe empresas e gere links exclusivos de acesso e checkout.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/painel/gerador-links/historico" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Ver Histórico
          </Link>
        </Button>
      </div>

      {step === 'upload' && (
        <Card className="border-2 border-dashed border-slate-200 shadow-none">
          <CardContent className="pt-10 pb-10">
            {!file ? (
              <div 
                {...getRootProps()} 
                className={`flex flex-col items-center justify-center p-12 cursor-pointer transition-colors rounded-xl ${isDragActive ? 'bg-blue-50 border-brand-blue' : 'hover:bg-slate-50'}`}
              >
                <input {...getInputProps()} />
                <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                  <Upload className="h-8 w-8 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Arraste seu arquivo CSV</h3>
                <p className="text-slate-500 text-center max-w-sm mt-2">
                  O sistema identificará automaticamente colunas e separadores (vírgula ou ponto e vírgula).
                </p>
                <Button className="mt-6 bg-brand-navy hover:bg-brand-blue">Selecionar Arquivo</Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="h-12 w-12 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                    <FileText className="h-6 w-6 text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-500">
                      {totalToProcess} empresas encontradas • {columns.length} colunas detectadas
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setFile(null); setPreviewData([]); }} className="text-slate-400 hover:text-red-500">
                    Remover
                  </Button>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <TableIcon className="h-4 w-4" />
                    Pré-visualização
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {columns.slice(0, 4).map(col => (
                            <th key={col} className="px-4 py-2 font-semibold text-slate-700">{col}</th>
                          ))}
                          {columns.length > 4 && <th className="px-4 py-2 font-semibold text-slate-700">...</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0">
                            {columns.slice(0, 4).map(col => (
                              <td key={col} className="px-4 py-2 text-slate-600 truncate max-w-[150px]">{row[col]}</td>
                            ))}
                            {columns.length > 4 && <td className="px-4 py-2 text-slate-400">...</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => { setFile(null); setPreviewData([]); }}>Cancelar</Button>
                  <Button onClick={processFile} className="bg-brand-navy hover:bg-brand-blue px-8">
                    Gerar Links Agora
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'processing' && (
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="text-center pb-2">
            <CardTitle>Gerando Links Exclusivos</CardTitle>
            <CardDescription>Processando {totalToProcess} registros em lote para máxima performance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 py-8 text-center">
            <div className="flex justify-center">
              <div className="relative h-24 w-24">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-brand-blue">{progress}%</span>
                </div>
                <svg className="h-24 w-24 -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-slate-100"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * progress) / 100}
                    className="text-brand-blue transition-all duration-300"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-600 mb-1">
                <span>Progresso</span>
                <span>{processedCount} de {totalToProcess} empresas</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500 uppercase font-bold">Links Criados</p>
                <p className="text-xl font-bold text-slate-900">{processedCount}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500 uppercase font-bold">Tempo Restante</p>
                <p className="text-xl font-bold text-slate-900">{remainingTime || 'Calculando...'}</p>
              </div>
            </div>
            
            <p className="text-sm text-slate-500 animate-pulse">
              Não feche esta página enquanto o processamento estiver ativo.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 'result' && (
        <Card className="border-slate-200 shadow-xl overflow-hidden">
          <div className="bg-green-50 border-b border-green-100 p-8 text-center">
            <div className="inline-flex h-16 w-16 bg-green-100 rounded-full items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Processamento Concluído!</h2>
            <p className="text-green-700 mt-1">
              Todos os {totalToProcess} links foram gerados e salvos com sucesso.
            </p>
          </div>
          
          <CardContent className="p-8 space-y-8">
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center space-y-1">
                <p className="text-sm text-slate-500">Total de Empresas</p>
                <p className="text-2xl font-bold text-slate-900">{totalToProcess}</p>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm text-slate-500">Links Gerados</p>
                <p className="text-2xl font-bold text-slate-900">{processedCount}</p>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm text-slate-500">Tempo Total</p>
                <p className="text-2xl font-bold text-slate-900">
                  {startTime ? `${Math.round((Date.now() - startTime) / 1000)}s` : '-'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Arquivo de Links Gerado</h3>
                  <p className="text-sm text-slate-500">Contém todas as colunas originais + TOKEN e LINKS.</p>
                </div>
                <Button onClick={downloadCSV} className="bg-green-600 hover:bg-green-700 px-6">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar CSV Final
                </Button>
              </div>
            </div>

            <Alert className="bg-blue-50 border-blue-100 text-blue-800">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertTitle>Importante</AlertTitle>
              <AlertDescription className="text-blue-700">
                Os links já estão ativos. Você pode testar qualquer link clicando no botão abaixo para ver um exemplo de como o cliente visualizará a página.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="bg-slate-50 border-t border-slate-200 p-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep('upload')}>
              Gerar Novos Links
            </Button>
            <Button variant="outline" asChild>
              <Link to="/painel/gerador-links/historico">
                Ver Histórico de Gerações
              </Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}