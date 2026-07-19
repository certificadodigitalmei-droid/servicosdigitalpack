import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { 
  FileUp, 
  Filter, 
  Download, 
  Trash2, 
  Table as TableIcon, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Alert, 
  AlertDescription, 
  AlertTitle 
} from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute('/_authenticated/painel/filtrar-mei')({
  component: FilterMeiPage,
});

function FilterMeiPage() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [meiColumn, setMeiColumn] = useState<string>('');
  const [possibleMeiColumns, setPossibleMeiColumns] = useState<string[]>([]);
  const [processStatus, setProcessStatus] = useState<'idle' | 'processing' | 'completed'>('idle');
  const [progress, setProgress] = useState(0);
  
  // Filters
  const [filterActive, setFilterActive] = useState(false);
  const [filterEmail, setFilterEmail] = useState(false);
  
  // Results
  const [results, setResults] = useState<{
    kept: any[];
    removed: any[];
    unknown: any[];
    invalid: any[];
    summary: {
      total: number;
      kept: number;
      removedNonMei: number;
      removedInactive: number;
      removedNoEmail: number;
      unknown: number;
      invalid: number;
      startTime: number;
      endTime: number;
    } | null;
  }>({
    kept: [],
    removed: [],
    unknown: [],
    invalid: [],
    summary: null
  });

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

  const normalizeString = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const isMeiValue = (val: any) => {
    const s = String(val || '').trim().toLowerCase();
    const meiValues = ['sim', 's', 'true', '1', 'yes', 'mei', 'optante', 'optante mei', 'microempreendedor individual'];
    return meiValues.includes(s);
  };

  const isNotMeiValue = (val: any) => {
    const s = String(val || '').trim().toLowerCase();
    const notMeiValues = ['nao', 'n', 'false', '0', 'no', 'nao optante', '', 'null', 'undefined'];
    return notMeiValues.includes(s) || s === '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error('O arquivo excede o limite de 20MB');
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      toast.error('Por favor, envie um arquivo CSV');
      return;
    }

    setFile(selectedFile);
    
    Papa.parse(selectedFile, {
      header: true,
      preview: 100, // Preview first 100 rows to detect columns
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<any>) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          toast.error('Erro ao ler o arquivo CSV');
          return;
        }

        const cols = Object.keys(results.data[0] || {});
        setHeaders(cols);

        // Identify possible MEI columns
        const candidates = cols.filter(h => {
          const n = normalizeString(h);
          return n.includes('mei') || n.includes('optante') || n.includes('is_mei') || n.includes('microempreendedorindividual') || n.includes('opcaopelomei') || n.includes('simplesmei') || n.includes('opcao_mei');
        });

        setPossibleMeiColumns(candidates);
        if (candidates.length === 1) {
          setMeiColumn(candidates[0]);
        }
        
        setStep(2);
      }
    });
  };

  const startProcessing = () => {
    if (!file || !meiColumn) return;
    
    setStep(4);
    setProcessStatus('processing');
    setProgress(0);
    const startTime = Date.now();

    // Reset results before starting
    setResults({ kept: [], removed: [], unknown: [], invalid: [], summary: null });

    // Use a small timeout to let the UI update to "Processing"
    setTimeout(() => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (results: Papa.ParseResult<any>) => {
        const raw = results.data;
        const total = raw.length;
        
        const kept: any[] = [];
        const removed: any[] = [];
        const unknown: any[] = [];
        const invalid: any[] = [];
        
        let removedNonMei = 0;
        let removedInactive = 0;
        let removedNoEmail = 0;

        raw.forEach((row: any) => {
          if (!row || Object.keys(row).length < 2) {
            invalid.push(row);
            return;
          }

          const val = row[meiColumn];
          const isMei = isMeiValue(val);
          const isNotMei = isNotMeiValue(val);

          if (!isMei && !isNotMei) {
            unknown.push(row);
            return;
          }

          if (!isMei) {
            removedNonMei++;
            removed.push({ ...row, motivo_remocao: 'NAO_MEI' });
            return;
          }

          // Additional filters
          if (filterActive) {
            const sitCol = headers.find(h => {
              const n = normalizeString(h);
              return n.includes('situacaocadastral') || n.includes('status') || n.includes('situacao');
            });
            if (sitCol) {
              const sitVal = String(row[sitCol] || '').toUpperCase();
              if (sitVal !== '02' && !sitVal.includes('ATIVA')) {
                removedInactive++;
                removed.push({ ...row, motivo_remocao: 'SITUACAO_INATIVA' });
                return;
              }
            }
          }

          if (filterEmail) {
            const emailCol = headers.find(h => {
              const n = normalizeString(h);
              return n.includes('email') || n.includes('eletronico');
            });
            if (emailCol) {
              const emailVal = String(row[emailCol] || '').trim();
              if (!emailVal || !emailVal.includes('@') || emailVal.split('@')[1].length < 3) {
                removedNoEmail++;
                removed.push({ ...row, motivo_remocao: 'SEM_EMAIL' });
                return;
              }
            }
          }

          kept.push(row);
        });

        setResults({
          kept,
          removed,
          unknown,
          invalid,
          summary: {
            total,
            kept: kept.length,
            removedNonMei,
            removedInactive,
            removedNoEmail,
            unknown: unknown.length,
            invalid: invalid.length,
            startTime,
            endTime: Date.now()
          }
        });

        setProcessStatus('completed');
        setProgress(100);
        setStep(5);
        toast.success('Processamento concluído!');
      }
    });
    }, 500);
  };

  const downloadFile = (data: any[], filename: string) => {
    const csv = Papa.unparse(data);
    // Add BOM for Excel UTF-8 compatibility
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setRawData([]);
    setHeaders([]);
    setMeiColumn('');
    setPossibleMeiColumns([]);
    setResults({ kept: [], removed: [], unknown: [], invalid: [], summary: null });
    setProcessStatus('idle');
    setProgress(0);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-brand-navy flex items-center gap-2">
          <Filter className="h-8 w-8 text-brand-blue" />
          Filtrar Empresas MEI
        </h1>
        <p className="text-slate-500">
          Ferramenta administrativa para higienização de base de dados empresariais.
        </p>
      </div>

      {/* Steps Indicator */}
      <div className="grid grid-cols-6 gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <div 
            key={s} 
            className={`h-2 rounded-full transition-colors ${s <= step ? 'bg-brand-blue' : 'bg-slate-200'}`}
          />
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card className="border-dashed border-2 border-slate-300">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="h-20 w-20 rounded-full bg-slate-100 flex items-center justify-center">
              <FileUp className="h-10 w-10 text-slate-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Envie o arquivo CSV</h3>
              <p className="text-sm text-slate-500 max-w-md">
                O sistema analisará as colunas e permitirá filtrar apenas os registros optantes pelo MEI.
              </p>
            </div>
            <label className="cursor-pointer">
              <Input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                onChange={handleFileChange}
              />
              <Button asChild>
                <span>Selecionar Arquivo CSV</span>
              </Button>
            </label>
            <p className="text-xs text-slate-400">Limite de 20MB • Formato .csv</p>
            
            <Alert className="mt-8 max-w-2xl bg-slate-50 border-slate-200">
              <Info className="h-4 w-4" />
              <AlertTitle>Privacidade e Segurança</AlertTitle>
              <AlertDescription>
                Os arquivos são utilizados apenas para processamento local e geração do CSV filtrado. Nenhum dado é armazenado permanentemente.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Confirm Columns */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Identificação da Coluna MEI</CardTitle>
            <CardDescription>
              Selecione a coluna que indica se a empresa é optante pelo Simples Nacional / MEI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Coluna MEI</Label>
              <Select value={meiColumn} onValueChange={setMeiColumn}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a coluna..." />
                </SelectTrigger>
                <SelectContent>
                  {headers.map(h => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {possibleMeiColumns.length > 0 && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Coluna detectada automaticamente: <strong>{meiColumn || 'Nenhuma'}</strong>
                </p>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-lg">
              <h4 className="text-sm font-semibold mb-2">Resumo do Arquivo</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Arquivo:</span> {file?.name}
                </div>
                <div>
                  <span className="text-slate-500">Tamanho:</span> {(file?.size || 0 / 1024).toFixed(1)} KB
                </div>
                <div>
                  <span className="text-slate-500">Colunas:</span> {headers.length}
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={reset}>Cancelar</Button>
              <Button onClick={() => setStep(3)}>Continuar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Optional Filters */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Filtros Adicionais (Opcional)</CardTitle>
            <CardDescription>
              Por padrão, apenas o filtro de MEI será aplicado. Você pode ativar filtros extras.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2 border p-4 rounded-lg bg-emerald-50 border-emerald-100">
                <Checkbox id="mei-only" checked disabled />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="mei-only" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Manter somente MEI
                  </label>
                  <p className="text-xs text-slate-500">Obrigatório</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 border p-4 rounded-lg">
                <Checkbox id="active-only" checked={filterActive} onCheckedChange={(c) => setFilterActive(!!c)} />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="active-only" className="text-sm font-medium leading-none">
                    Somente empresas ATIVAS
                  </label>
                  <p className="text-xs text-slate-500">Remove baixadas, suspensas, etc.</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 border p-4 rounded-lg">
                <Checkbox id="email-only" checked={filterEmail} onCheckedChange={(c) => setFilterEmail(!!c)} />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="email-only" className="text-sm font-medium leading-none">
                    Somente com E-MAIL
                  </label>
                  <p className="text-xs text-slate-500">Remove registros sem endereço eletrônico válido.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>Voltar</Button>
              <Button onClick={startProcessing} className="bg-brand-navy">Processar e Filtrar MEIs</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Processing */}
      {step === 4 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-6">
            <div className="h-16 w-16 relative">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-brand-blue animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold">Processando dados...</h3>
              <p className="text-slate-500">Analisando registros e aplicando filtros selecionados.</p>
            </div>
            <div className="w-full max-w-md space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-center text-xs text-slate-400">Progresso: {progress}% - Isso pode levar alguns segundos para arquivos grandes.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Review Results */}
      {step === 5 && results.summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-brand-navy text-white">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-300">Total Recebido</CardDescription>
                <CardTitle className="text-3xl">{results.summary.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="bg-emerald-600 text-white">
              <CardHeader className="pb-2">
                <CardDescription className="text-emerald-100">MEIs Mantidos</CardDescription>
                <CardTitle className="text-3xl">{results.summary.kept}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="bg-red-600 text-white">
              <CardHeader className="pb-2">
                <CardDescription className="text-red-100">Removidos</CardDescription>
                <CardTitle className="text-3xl">{results.removed.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="bg-slate-100">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-500">Percentual MEI</CardDescription>
                <CardTitle className="text-3xl">
                  {((results.summary.kept / results.summary.total) * 100).toFixed(1)}%
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Alert className="bg-blue-50 border-blue-100 text-blue-800">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Filtro concluído</AlertTitle>
            <AlertDescription>
              {results.summary.kept} empresas foram mantidas e {results.removed.length + results.unknown.length} registros foram removidos do arquivo final.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="kept" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="kept">MEIs Mantidos ({results.kept.length})</TabsTrigger>
              <TabsTrigger value="removed">Removidos ({results.removed.length})</TabsTrigger>
              <TabsTrigger value="unknown">Desconhecidos ({results.unknown.length})</TabsTrigger>
              <TabsTrigger value="invalid">Erros ({results.invalid.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="kept">
              <Card>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.slice(0, 8).map(h => <TableHead key={h}>{h}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.kept.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          {headers.slice(0, 8).map(h => (
                            <TableCell key={h} className="text-xs truncate max-w-[150px]">
                              {String(row[h] || '')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </Card>
            </TabsContent>
            <TabsContent value="removed">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Registros Removidos</CardTitle>
                  <CardDescription>Empresas que não atendem aos critérios de MEI ou filtros adicionais.</CardDescription>
                </CardHeader>
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Motivo</TableHead>
                        {headers.slice(0, 5).map(h => <TableHead key={h}>{h}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.removed.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell><Badge variant="outline">{row.motivo_remocao}</Badge></TableCell>
                          {headers.slice(0, 5).map(h => (
                            <TableCell key={h} className="text-xs">{String(row[h] || '')}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </Card>
            </TabsContent>
            <TabsContent value="unknown">
              <Card>
                <CardHeader>
                  <Alert className="bg-amber-50 border-amber-200 text-amber-800">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Valores não reconhecidos</AlertTitle>
                    <AlertDescription>
                      Estes registros possuem valores na coluna MEI que não foram identificados como 'Sim' ou 'Não'. Por padrão, foram removidos.
                    </AlertDescription>
                  </Alert>
                </CardHeader>
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableBody>
                      {results.unknown.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-red-500">{row[meiColumn] || '(vazio)'}</TableCell>
                          {headers.slice(0, 5).map(h => (
                            <TableCell key={h} className="text-xs">{String(row[h] || '')}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </Card>
            </TabsContent>
            <TabsContent value="invalid">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Linhas Inválidas</CardTitle>
                  <CardDescription>Registros corrompidos ou com falta de dados estruturais.</CardDescription>
                </CardHeader>
                <div className="p-8 text-center text-slate-500 italic">
                  {results.invalid.length === 0 ? "Nenhuma linha inválida encontrada." : `${results.invalid.length} linhas com erro.`}
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex flex-col md:flex-row gap-4 justify-between pt-6 border-t">
            <Button variant="ghost" onClick={reset} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Limpar e Novo Arquivo
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => downloadFile(results.removed, `relatorio_removidos_${new Date().toISOString().slice(0, 10)}.csv`)}>
                Baixar Relatório de Removidos
              </Button>
              <Button onClick={() => downloadFile(results.kept, `${file?.name.replace('.csv', '')}_MEI_filtrado_${new Date().toISOString().slice(0, 10)}.csv`)} className="bg-brand-navy gap-2">
                <Download className="h-4 w-4" />
                Baixar CSV somente com MEIs
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}