import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Link2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Loader2,
  Upload,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/_authenticated/painel/gerador-links')({
  component: GeradorLinksPage,
});

const generateToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const norm = (s: string) =>
  s.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const CNPJ_ALIASES = ['cnpj', 'cnpjbasico', 'numerocnpj', 'cnpjcompleto'];

function cleanCNPJ(v: any): string | null {
  if (!v) return null;
  const digits = String(v).replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.padStart(14, '0').slice(0, 14);
}

function detectCnpjColumn(headers: string[]): string | null {
  for (const h of headers) if (CNPJ_ALIASES.includes(norm(h))) return h;
  return null;
}

function GeradorLinksPage() {
  const [step, setStep] = useState<'upload' | 'ready' | 'processing' | 'result' | 'error'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [cnpjColumn, setCnpjColumn] = useState<string | null>(null);
  const [cnpjsFromCsv, setCnpjsFromCsv] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [linksCreated, setLinksCreated] = useState(0);
  const [notFoundCount, setNotFoundCount] = useState(0);
  const [remainingTime, setRemainingTime] = useState('');
  const [finalRows, setFinalRows] = useState<any[]>([]);
  const [errorDetails, setErrorDetails] = useState<{ step: string; message: string; stack?: string } | null>(null);
  const [genId, setGenId] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    setCnpjColumn(null);
    setCnpjsFromCsv([]);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = (results.meta.fields || []) as string[];
        const col = detectCnpjColumn(headers);
        setCnpjColumn(col);
        if (!col) {
          setStep('upload');
          return;
        }
        const set = new Set<string>();
        for (const raw of results.data as any[]) {
          const c = cleanCNPJ(raw[col]);
          if (c) set.add(c);
        }
        setCnpjsFromCsv(Array.from(set));
        setStep('ready');
      },
      error: (err) => {
        setErrorDetails({ step: 'Leitura do CSV', message: err.message });
        setStep('error');
      },
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  function resetAll() {
    setStep('upload');
    setFile(null);
    setCnpjColumn(null);
    setCnpjsFromCsv([]);
    setProgress(0);
    setProcessed(0);
    setLinksCreated(0);
    setNotFoundCount(0);
    setRemainingTime('');
    setFinalRows([]);
    setErrorDetails(null);
    setGenId(null);
  }

  async function generate() {
    setErrorDetails(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');
      if (cnpjsFromCsv.length === 0) throw new Error('Nenhum CNPJ válido no CSV.');

      setStep('processing');
      const startedAt = Date.now();
      setProcessed(0);
      setLinksCreated(0);
      setNotFoundCount(0);
      setProgress(0);

      // Fetch matching companies in chunks (avoid huge IN clauses)
      const QCHUNK = 500;
      const companies: any[] = [];
      for (let i = 0; i < cnpjsFromCsv.length; i += QCHUNK) {
        const slice = cnpjsFromCsv.slice(i, i + QCHUNK);
        const { data, error } = await supabase
          .from('companies')
          .select('id, cnpj, nome_titular_exibicao, razao_social_original, nome_fantasia, email, inicio_atividade, uf, municipio_descricao')
          .in('cnpj', slice);
        if (error) throw new Error(`Ao consultar empresas: ${error.message}`);
        if (data) companies.push(...data);
      }

      const foundSet = new Set(companies.map((c) => c.cnpj));
      const missing = cnpjsFromCsv.filter((c) => !foundSet.has(c));
      setNotFoundCount(missing.length);

      if (companies.length === 0) {
        throw new Error(
          `Nenhum dos ${cnpjsFromCsv.length} CNPJs do CSV foi encontrado no banco. Importe as empresas primeiro em "Importar Empresas".`,
        );
      }

      // Create generation record
      const { data: gen, error: gErr } = await supabase
        .from('link_generations')
        .insert({
          arquivo: file?.name || `upload_${new Date().toISOString().slice(0, 10)}`,
          total_empresas: companies.length,
          total_links: 0,
        })
        .select('id')
        .single();
      if (gErr) throw new Error(`Ao criar registro de geração: ${gErr.message}`);
      setGenId(gen.id);

      const domain = typeof window !== 'undefined' ? window.location.origin : '';
      const BATCH = 500;
      const results: any[] = [];
      let created = 0;

      for (let i = 0; i < companies.length; i += BATCH) {
        const chunk = companies.slice(i, i + BATCH);
        const inserts = chunk.map((c: any) => {
          const token = generateToken();
          const public_url = `${domain}/c/${token}`;
          const checkout_url = `${domain}/checkout/${token}`;
          results.push({
            CNPJ: c.cnpj,
            NOME: c.nome_titular_exibicao || c.razao_social_original || '',
            RAZAO_SOCIAL: c.razao_social_original || '',
            NOME_FANTASIA: c.nome_fantasia || '',
            EMAIL: c.email || '',
            UF: c.uf || '',
            MUNICIPIO: c.municipio_descricao || '',
            INICIO_ATIVIDADE: c.inicio_atividade || '',
            TOKEN: token,
            LINK_PUBLICO: public_url,
            LINK_CHECKOUT: checkout_url,
            DATA_GERACAO: new Date().toISOString(),
          });
          return {
            generation_id: gen.id,
            company_id: c.id,
            public_token: token,
            public_url,
            checkout_url,
            company_data: {
              cnpj: c.cnpj,
              nome: c.nome_titular_exibicao || c.razao_social_original,
              razao_social: c.razao_social_original,
            },
            active: true,
            status: 'active',
          };
        });

        const { error: insErr } = await supabase.from('company_links').insert(inserts);
        if (insErr) throw new Error(`Ao salvar links: ${insErr.message}`);

        created += chunk.length;
        setProcessed(created);
        setLinksCreated(created);
        setProgress(Math.round((created / companies.length) * 100));

        const elapsed = Date.now() - startedAt;
        const perItem = elapsed / created;
        const remaining = (companies.length - created) * perItem;
        const seconds = Math.round(remaining / 1000);
        setRemainingTime(seconds > 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`);
      }

      await supabase.from('link_generations').update({ total_links: created }).eq('id', gen.id);
      setFinalRows(results);
      setStep('result');
      toast.success(`${created} links gerados`);
      setTimeout(() => downloadCSV(results), 300);
    } catch (err: any) {
      console.error('Generation error', err);
      setErrorDetails({ step: 'Geração de Links', message: err.message, stack: err.stack });
      setStep('error');
    }
  }

  function downloadCSV(rows: any[] = finalRows) {
    const csv = Papa.unparse(rows);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `links_gerados_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gerador de Links</h1>
          <p className="text-slate-500">Faça upload de um CSV com CNPJs. Os links são gerados apenas para os CNPJs enviados.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/painel/gerador-links/historico" className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Histórico
          </Link>
        </Button>
      </div>

      {step === 'upload' && (
        <Card className="border-2 border-dashed border-slate-200 shadow-none">
          <CardContent className="pt-10 pb-10">
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center p-12 cursor-pointer transition-colors rounded-xl ${isDragActive ? 'bg-blue-50 border-brand-blue' : 'hover:bg-slate-50'}`}
            >
              <input {...getInputProps()} />
              <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <Upload className="h-8 w-8 text-brand-blue" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Arraste o CSV com os CNPJs</h3>
              <p className="text-slate-500 text-center max-w-sm mt-2">
                O sistema identifica automaticamente a coluna CNPJ e gera um link exclusivo para cada empresa da lista.
              </p>
              <Button className="mt-6 bg-brand-navy hover:bg-brand-blue">Selecionar Arquivo</Button>
            </div>
            {file && !cnpjColumn && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Coluna CNPJ não encontrada</AlertTitle>
                <AlertDescription>
                  Nenhuma coluna reconhecível como CNPJ foi encontrada em <b>{file.name}</b>. Ajuste o cabeçalho e envie novamente.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'ready' && file && (
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="h-12 w-12 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                <FileText className="h-6 w-6 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{file.name}</p>
                <p className="text-sm text-slate-500">
                  {cnpjsFromCsv.length.toLocaleString('pt-BR')} CNPJs únicos • coluna detectada: <span className="font-mono">{cnpjColumn}</span>
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={resetAll} className="text-slate-400 hover:text-red-500">
                Remover
              </Button>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Empresas precisam estar importadas</AlertTitle>
              <AlertDescription>
                Só serão gerados links para CNPJs já cadastrados em "Importar Empresas". CNPJs não encontrados serão ignorados.
              </AlertDescription>
            </Alert>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={resetAll}>Cancelar</Button>
              <Button onClick={generate} className="bg-brand-navy hover:bg-brand-blue">
                <Link2 className="mr-2 h-4 w-4" /> Gerar Links
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'processing' && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Gerando links exclusivos</CardTitle>
            <CardDescription>Processando {cnpjsFromCsv.length} CNPJs do CSV.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 py-8 text-center">
            <div className="flex justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-brand-blue" />
            </div>
            <div className="text-3xl font-bold text-brand-blue">{progress}%</div>
            <Progress value={progress} className="h-3" />
            <div className="grid grid-cols-3 gap-4 pt-4">
              <Stat label="Processadas" value={processed} />
              <Stat label="Links Criados" value={linksCreated} />
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500 uppercase font-bold">Tempo restante</p>
                <p className="text-lg font-bold text-slate-900">{remainingTime || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'result' && (
        <Card>
          <div className="bg-green-50 border-b border-green-100 p-8 text-center">
            <div className="inline-flex h-16 w-16 bg-green-100 rounded-full items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Links gerados com sucesso</h2>
            <p className="text-green-700 mt-1">
              {linksCreated.toLocaleString('pt-BR')} links criados. O CSV foi baixado automaticamente.
            </p>
            {notFoundCount > 0 && (
              <p className="text-amber-700 mt-2 text-sm">
                {notFoundCount.toLocaleString('pt-BR')} CNPJs do arquivo não estavam importados e foram ignorados.
              </p>
            )}
          </div>
          <CardContent className="p-8">
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Empresas" value={processed} />
              <Stat label="Links Criados" value={linksCreated} />
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
                <p className="text-xs text-slate-500 uppercase font-bold">ID da Geração</p>
                <p className="text-sm font-mono text-slate-900 truncate">{genId?.slice(0, 12)}...</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => downloadCSV()}>
                <Download className="mr-2 h-4 w-4" /> Baixar CSV novamente
              </Button>
              <Button className="bg-brand-navy hover:bg-brand-blue" onClick={resetAll}>
                Nova geração
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
              <Button variant="outline" onClick={resetAll}>Voltar</Button>
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
