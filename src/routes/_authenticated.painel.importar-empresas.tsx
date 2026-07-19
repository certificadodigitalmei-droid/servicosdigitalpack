import { createFileRoute } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/_authenticated/painel/importar-empresas')({
  component: ImportarEmpresasPage,
});

// Normalize a header string for matching
const norm = (s: string) =>
  s
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

// Map of DB column → list of possible CSV header aliases (normalized)
const COLUMN_ALIASES: Record<string, string[]> = {
  cnpj: ['cnpj', 'cnpjbasico', 'numerocnpj', 'cnpjcompleto'],
  razao_social_original: ['razaosocial', 'nomeempresarial', 'nomerazaosocial', 'razao'],
  nome_titular_exibicao: ['nome', 'nometitular', 'titular', 'nomefantasia'],
  nome_fantasia: ['nomefantasia', 'fantasia'],
  email: ['email', 'correioeletronico', 'emailempresa'],
  inicio_atividade: ['dataabertura', 'datainicioatividade', 'inicioatividade', 'dataabertadaempresa', 'abertura'],
  uf: ['uf', 'estado', 'ufempresa'],
  municipio_descricao: ['municipio', 'cidade', 'municipionome', 'descricaomunicipio'],
  situacao_cadastral_desc: ['situacaocadastral', 'situacao', 'descricaosituacao'],
  natureza_id: ['codigonaturezajuridica', 'naturezajuridica', 'codnaturezajuridica'],
  ddd: ['ddd', 'ddd1'],
  logradouro: ['logradouro', 'endereco'],
  numero: ['numero'],
  bairro: ['bairro'],
  cep: ['cep'],
};

// Additional phone handling — some CSVs have "telefone1"
const PHONE_ALIASES = ['telefone', 'telefone1', 'telefone_1', 'fone', 'numerotelefone'];

function buildHeaderMap(headers: string[]) {
  const map: Record<string, string> = {}; // dbCol -> csvHeader
  const phones: string[] = [];
  for (const h of headers) {
    const n = norm(h);
    for (const [dbCol, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (!map[dbCol] && aliases.includes(n)) {
        map[dbCol] = h;
      }
    }
    if (PHONE_ALIASES.includes(n)) phones.push(h);
  }
  return { map, phones };
}

function normalizeDate(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // yyyymmdd
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return null;
}

function cleanCNPJ(v: any): string | null {
  if (!v) return null;
  const digits = String(v).replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.padStart(14, '0').slice(0, 14);
}

function ImportarEmpresasPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [phoneCols, setPhoneCols] = useState<string[]>([]);
  const [step, setStep] = useState<'upload' | 'processing' | 'result' | 'error'>('upload');
  const [progress, setProgress] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [inserted, setInserted] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [errorDetails, setErrorDetails] = useState<{ step: string; message: string; stack?: string } | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    Papa.parse(f, {
      header: true,
      preview: 5,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = (results.meta.fields || []) as string[];
        setColumns(fields);
        setPreviewData(results.data as any[]);
        const { map, phones } = buildHeaderMap(fields);
        setMapping(map);
        setPhoneCols(phones);
      },
    });
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => setTotal((results.data as any[]).length),
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  async function startImport() {
    if (!file) return;
    setErrorDetails(null);

    // Verify session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setErrorDetails({ step: 'Autenticação', message: 'Sessão expirada. Faça login novamente.' });
      setStep('error');
      return;
    }
    if (!mapping.cnpj) {
      setErrorDetails({ step: 'Mapeamento', message: 'Não foi possível identificar a coluna CNPJ no CSV.' });
      setStep('error');
      return;
    }

    setStep('processing');
    setProcessed(0);
    setInserted(0);
    setUpdated(0);
    setSkipped(0);
    setProgress(0);

    const BATCH = 200;
    let batch: any[] = [];
    let ins = 0;
    let upd = 0;
    let skp = 0;
    let done = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      // Detect which rows already exist to count inserted vs updated
      const cnpjs = batch.map((r) => r.cnpj);
      const { data: existing } = await supabase
        .from('companies')
        .select('cnpj')
        .in('cnpj', cnpjs);
      const existingSet = new Set((existing || []).map((r: any) => r.cnpj));

      const { error } = await supabase.from('companies').upsert(batch, { onConflict: 'cnpj' });
      if (error) {
        throw new Error(`Falha ao gravar lote: ${error.message}`);
      }
      for (const r of batch) {
        if (existingSet.has(r.cnpj)) upd++;
        else ins++;
      }
      batch = [];
    };

    try {
      await new Promise<void>((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          chunk: async (results, parser) => {
            parser.pause();
            try {
              for (const raw of results.data as any[]) {
                const cnpj = cleanCNPJ(raw[mapping.cnpj]);
                if (!cnpj) {
                  skp++;
                  done++;
                  continue;
                }
                const row: any = { cnpj, is_mei: true };
                for (const [dbCol, csvCol] of Object.entries(mapping)) {
                  if (dbCol === 'cnpj') continue;
                  const val = raw[csvCol];
                  if (val === undefined || val === null || val === '') continue;
                  if (dbCol === 'inicio_atividade') {
                    row.inicio_atividade = normalizeDate(val);
                  } else {
                    row[dbCol] = String(val).trim();
                  }
                }
                // Phones → jsonb
                if (phoneCols.length > 0) {
                  const nums = phoneCols
                    .map((c) => (raw[c] ? String(raw[c]).replace(/\D/g, '') : ''))
                    .filter((n) => n.length >= 8)
                    .map((n) => ({ numero: n }));
                  if (nums.length > 0) {
                    row.telefones = nums;
                    row.possui_telefone = true;
                  }
                }
                if (row.email) row.possui_email = true;
                batch.push(row);
                done++;
                if (batch.length >= BATCH) await flush();
              }
              setProcessed(done);
              setInserted(ins);
              setUpdated(upd);
              setSkipped(skp);
              setProgress(total > 0 ? Math.round((done / total) * 100) : 0);
              parser.resume();
            } catch (err: any) {
              parser.abort();
              reject(err);
            }
          },
          complete: async () => {
            try {
              await flush();
              setInserted(ins);
              setUpdated(upd);
              setSkipped(skp);
              setProgress(100);
              resolve();
            } catch (err: any) {
              reject(err);
            }
          },
          error: (err) => reject(err),
        });
      });

      setStep('result');
      toast.success('Empresas importadas com sucesso');
    } catch (err: any) {
      console.error('Import error', err);
      setErrorDetails({ step: 'Importação', message: err.message || 'Erro desconhecido', stack: err.stack });
      setStep('error');
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importar Empresas</h1>
        <p className="text-slate-500">Carregue um CSV UTF-8 com as empresas. O CNPJ é a chave — registros existentes serão atualizados.</p>
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
                  O sistema identifica automaticamente CNPJ, razão social, e-mail, telefone e demais dados.
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
                      {total} empresas encontradas • {columns.length} colunas detectadas
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setFile(null); setPreviewData([]); setColumns([]); setMapping({}); }} className="text-slate-400 hover:text-red-500">
                    Remover
                  </Button>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Mapeamento automático</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(mapping).map(([db, csv]) => (
                      <div key={db} className="flex justify-between bg-slate-50 p-2 rounded">
                        <span className="font-mono text-slate-500">{db}</span>
                        <span className="font-semibold text-slate-800">{csv}</span>
                      </div>
                    ))}
                    {phoneCols.length > 0 && (
                      <div className="flex justify-between bg-slate-50 p-2 rounded col-span-2">
                        <span className="font-mono text-slate-500">telefones</span>
                        <span className="font-semibold text-slate-800">{phoneCols.join(' + ')}</span>
                      </div>
                    )}
                  </div>
                  {!mapping.cnpj && (
                    <Alert variant="destructive" className="mt-3">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Coluna CNPJ não encontrada</AlertTitle>
                      <AlertDescription>
                        Nenhuma coluna reconhecível como CNPJ foi encontrada no CSV. Ajuste o cabeçalho e envie novamente.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => { setFile(null); setPreviewData([]); }}>Cancelar</Button>
                  <Button onClick={startImport} disabled={!mapping.cnpj} className="bg-brand-navy hover:bg-brand-blue px-8">
                    Importar Empresas
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'processing' && (
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle>Importando empresas</CardTitle>
            <CardDescription>Processando {total} registros — não feche esta página.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 py-8 text-center">
            <div className="text-4xl font-bold text-brand-blue">{progress}%</div>
            <Progress value={progress} className="h-3" />
            <div className="grid grid-cols-4 gap-4 pt-4 text-left">
              <Stat label="Processadas" value={processed} />
              <Stat label="Inseridas" value={inserted} />
              <Stat label="Atualizadas" value={updated} />
              <Stat label="Ignoradas" value={skipped} />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'result' && (
        <Card className="border-slate-200 shadow-xl">
          <div className="bg-green-50 border-b border-green-100 p-8 text-center">
            <div className="inline-flex h-16 w-16 bg-green-100 rounded-full items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Importação concluída</h2>
            <p className="text-green-700 mt-1">Prossiga para o Gerador de Links para criar as URLs personalizadas.</p>
          </div>
          <CardContent className="p-8">
            <div className="grid grid-cols-4 gap-4">
              <Stat label="Processadas" value={processed} />
              <Stat label="Inseridas" value={inserted} />
              <Stat label="Atualizadas" value={updated} />
              <Stat label="Ignoradas" value={skipped} />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setFile(null); setStep('upload'); }}>Nova importação</Button>
              <Button asChild className="bg-brand-navy hover:bg-brand-blue">
                <a href="/painel/gerador-links">Ir para o Gerador de Links</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'error' && errorDetails && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-red-900">Erro em: {errorDetails.step}</h3>
                <p className="text-red-800 mt-1">{errorDetails.message}</p>
                {errorDetails.stack && (
                  <pre className="mt-3 text-xs bg-red-100 p-3 rounded overflow-auto text-red-900 max-h-40">{errorDetails.stack}</pre>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
      <p className="text-xs text-slate-500 uppercase font-bold">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value.toLocaleString('pt-BR')}</p>
    </div>
  );
}
