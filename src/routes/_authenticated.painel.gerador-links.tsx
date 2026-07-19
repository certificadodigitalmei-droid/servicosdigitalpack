import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import {
  Link2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Loader2,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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

function GeradorLinksPage() {
  const [step, setStep] = useState<'idle' | 'processing' | 'result' | 'error'>('idle');
  const [companiesCount, setCompaniesCount] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [linksCreated, setLinksCreated] = useState(0);
  const [remainingTime, setRemainingTime] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finalRows, setFinalRows] = useState<any[]>([]);
  const [errorDetails, setErrorDetails] = useState<{ step: string; message: string; stack?: string } | null>(null);
  const [genId, setGenId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('companies')
        .select('id', { count: 'exact', head: true });
      setCompaniesCount(count || 0);
    })();
  }, []);

  async function generate() {
    setErrorDetails(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');

      // 1. Load all companies
      const { data: companies, error: cErr } = await supabase
        .from('companies')
        .select('id, cnpj, nome_titular_exibicao, razao_social_original, nome_fantasia, email, inicio_atividade, uf, municipio_descricao');
      if (cErr) throw new Error(`Ao carregar empresas: ${cErr.message}`);
      if (!companies || companies.length === 0) {
        throw new Error('Nenhuma empresa importada. Use a aba "Importar Empresas" primeiro.');
      }

      setStep('processing');
      setStartedAt(Date.now());
      setProcessed(0);
      setLinksCreated(0);

      // 2. Create generation record
      const { data: gen, error: gErr } = await supabase
        .from('link_generations')
        .insert({
          arquivo: `empresas_${new Date().toISOString().slice(0, 10)}`,
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

        if (startedAt) {
          const elapsed = Date.now() - startedAt;
          const perItem = elapsed / created;
          const remaining = (companies.length - created) * perItem;
          const seconds = Math.round(remaining / 1000);
          setRemainingTime(seconds > 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`);
        }
      }

      await supabase.from('link_generations').update({ total_links: created }).eq('id', gen.id);
      setFinalRows(results);
      setStep('result');
      toast.success(`${created} links gerados`);

      // Auto-download
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
          <p className="text-slate-500">Gera um link exclusivo para cada empresa já importada.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/painel/gerador-links/historico" className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Histórico
          </Link>
        </Button>
      </div>

      {step === 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Empresas disponíveis</CardTitle>
            <CardDescription>
              {companiesCount === null
                ? 'Carregando...'
                : `${companiesCount.toLocaleString('pt-BR')} empresas prontas para geração de links.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {companiesCount === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <div className="flex-1 text-sm text-amber-900">
                  Nenhuma empresa importada ainda.{' '}
                  <Link to="/painel/importar-empresas" className="font-semibold underline">
                    Ir para Importar Empresas
                  </Link>
                </div>
              </div>
            ) : (
              <Button
                onClick={generate}
                disabled={!companiesCount}
                className="bg-brand-navy hover:bg-brand-blue"
              >
                <Link2 className="mr-2 h-4 w-4" /> Gerar Links
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'processing' && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Gerando links exclusivos</CardTitle>
            <CardDescription>Processando {companiesCount} empresas.</CardDescription>
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
              <Button className="bg-brand-navy hover:bg-brand-blue" onClick={() => setStep('idle')}>
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
              <Button variant="outline" onClick={() => setStep('idle')}>Voltar</Button>
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
