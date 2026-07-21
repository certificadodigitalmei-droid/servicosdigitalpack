import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatCNPJ, formatDateBR } from '@/lib/format';
import { toast } from 'sonner';
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


export const Route = createFileRoute('/_authenticated/painel/empresas-importadas/$companyId')({
  head: () => ({ meta: [{ title: 'Detalhes da Empresa | Painel' }] }),
  component: DetalhesEmpresa,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  const isEmpty = value === null || value === undefined || value === '' || value === '—';
  return (
    <div className="border-b border-slate-100 py-2 last:border-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm text-slate-900">{isEmpty ? <span className="text-slate-400">Não informado</span> : value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function DetalhesEmpresa() {
  const { companyId } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [company, setCompany] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [runs, setRuns] = useState<Record<string, any>>({});


  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [{ data: c, error: e1 }, { data: l }, { data: q }] = await Promise.all([
          supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
          supabase.from('company_links').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
          supabase.from('automatic_company_queue').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
        ]);
        if (e1) throw e1;
        setCompany(c);
        setLinks(l ?? []);
        setQueue(q ?? []);
        const runIds = Array.from(new Set((q ?? []).map((x: any) => x.run_id).filter(Boolean)));
        if (runIds.length) {
          const { data: rs } = await supabase.from('automatic_company_query_runs').select('id,started_at,status,trigger').in('id', runIds);
          const map: Record<string, any> = {};
          (rs ?? []).forEach((r: any) => { map[r.id] = r; });
          setRuns(map);
        }
      } catch (e: any) {
        toast.error('Erro ao carregar: ' + (e?.message ?? 'desconhecido'));
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const { error: e1 } = await supabase.from('company_links').delete().eq('company_id', companyId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('automatic_company_queue').delete().eq('company_id', companyId);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from('companies').delete().eq('id', companyId);
      if (e3) throw e3;
      toast.success('Empresa, links e histórico de importação excluídos');
      navigate({ to: '/painel/empresas-importadas' });
    } catch (e: any) {
      toast.error('Erro ao excluir: ' + (e?.message ?? 'desconhecido'));
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;
  }
  if (!company) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: '/painel/empresas-importadas' })}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Voltar
        </Button>
        <p className="text-sm text-slate-500">Empresa não encontrada.</p>
      </div>
    );
  }

  const cnpjFmt = formatCNPJ(company.cnpj);
  const nome = (company.nome_titular_exibicao || company.razao_social_original || '').replace(/^\d+[.\-/\s]*/, '').trim() || '—';
  const phone = Array.isArray(company.telefones) && company.telefones.length > 0
    ? (company.telefones[0]?.numero || null)
    : null;
  const origem = queue.length > 0 ? 'Consulta Automática' : 'Manual / Planilha';

  const isTest = !!company.is_test_record;
  const quality: string = company.data_quality_status ?? 'complete';
  const missing: string[] = Array.isArray(company.missing_fields) ? company.missing_fields : [];
  const qualityLabel =
    quality === 'complete' ? 'Completa'
    : quality === 'pending_enrichment' ? 'Pendente de complementação'
    : quality === 'test_partial' ? 'Registro de teste (dados parciais)'
    : quality;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: '/painel/empresas-importadas' })}>
            <ArrowLeft className="mr-1 h-3 w-3" /> Voltar
          </Button>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">{nome}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
            <span className="font-mono">{cnpjFmt}</span>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(cnpjFmt); toast.success('CNPJ copiado'); }}>
              <Copy className="mr-1 h-3 w-3" /> Copiar CNPJ
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-col items-end gap-1">
            <Badge variant="secondary">{origem}</Badge>
            {isTest
              ? <Badge className="bg-amber-500 text-white">REGISTRO DE TESTE — DADOS INCOMPLETOS</Badge>
              : quality === 'pending_enrichment'
                ? <Badge className="bg-orange-500 text-white">Pendente de complementação</Badge>
                : <Badge className="bg-emerald-600 text-white">Completa</Badge>}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={deleting}>
                {deleting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
                Excluir empresa
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir esta empresa?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação vai remover permanentemente a empresa <strong>{nome}</strong> ({cnpjFmt}), todos os <strong>{links.length}</strong> link(s) associados e <strong>{queue.length}</strong> registro(s) de importação. Não é possível desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  Sim, excluir tudo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

      </div>

      {(isTest || quality === 'pending_enrichment' || missing.length > 0) && (
        <Card className={isTest ? 'border-amber-300 bg-amber-50' : 'border-orange-300 bg-orange-50'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Qualidade dos dados: {qualityLabel}</CardTitle>
            <CardDescription>
              {isTest
                ? 'Este registro foi criado em modo TESTE e pode estar incompleto. Não deve ser usado em campanhas, envios automáticos, exportações ou automações comerciais.'
                : 'Alguns campos obrigatórios não vieram da API. Enquanto o registro não for complementado, nenhum link normal será gerado.'}
            </CardDescription>
          </CardHeader>
          {missing.length > 0 && (
            <CardContent>
              <div className="text-xs font-semibold uppercase text-slate-600">Campos ausentes</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {missing.map((f) => <Badge key={f} variant="outline" className="border-orange-400 text-orange-700">{f}</Badge>)}
              </div>
              {!isTest && (
                <p className="mt-3 text-xs text-slate-600">
                  Motivo pelo qual o link normal não foi gerado: dados obrigatórios ausentes acima.
                </p>
              )}
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Identificação">
          <Field label="Razão Social" value={company.razao_social_original} />
          <Field label="Nome Fantasia" value={company.nome_fantasia} />
          <Field label="CNPJ" value={cnpjFmt} />
          <Field label="Porte" value={company.porte} />
          <Field label="Natureza Jurídica" value={company.natureza_id} />
          <Field label="Matriz/Filial" value={company.is_matriz ? 'Matriz' : company.is_filial ? 'Filial' : '—'} />
        </Section>

        <Section title="Situação Cadastral">
          <Field label="Situação" value={company.situacao_cadastral_desc} />
          <Field label="Data da Situação" value={company.situacao_cadastral_data ? formatDateBR(company.situacao_cadastral_data) : null} />
          <Field label="Data de Abertura" value={company.inicio_atividade ? formatDateBR(company.inicio_atividade) : null} />
          <Field label="Última Atualização" value={company.updated_at ? formatDateBR(company.updated_at.slice(0, 10)) : null} />
          <Field label="Data de Importação" value={company.created_at ? formatDateBR(company.created_at.slice(0, 10)) : null} />
        </Section>

        <Section title="Informações MEI">
          <Field label="Opção pelo MEI" value={company.is_mei ? 'Sim' : 'Não'} />
          <Field label="Opção pelo Simples" value={company.is_simples ? 'Sim' : 'Não'} />
          <Field label="Capital Social" value={company.capital_social != null ? `R$ ${Number(company.capital_social).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null} />
        </Section>

        <Section title="Atividades">
          <Field label="CNAE Principal" value={company.cnae_principal_codigo ? `${company.cnae_principal_codigo} — ${company.cnae_principal_descricao ?? ''}` : null} />
          <Field label="CNAEs Secundários" value={
            Array.isArray(company.cnaes_secundarios) && company.cnaes_secundarios.length > 0
              ? <ul className="list-disc pl-5">{company.cnaes_secundarios.map((c: any, i: number) => (
                  <li key={i} className="text-xs">{typeof c === 'string' ? c : `${c.codigo ?? ''} — ${c.descricao ?? ''}`}</li>
                ))}</ul>
              : null
          } />
        </Section>

        <Section title="Endereço">
          <Field label="Logradouro" value={[company.tipo_logradouro, company.logradouro].filter(Boolean).join(' ') || null} />
          <Field label="Número" value={company.numero} />
          <Field label="Complemento" value={company.complemento} />
          <Field label="Bairro" value={company.bairro} />
          <Field label="Município/UF" value={company.municipio_descricao || company.uf ? `${company.municipio_descricao ?? '—'} / ${company.uf ?? '—'}` : null} />
          <Field label="CEP" value={company.cep} />
        </Section>

        <Section title="Contatos">
          <Field label="E-mail" value={company.email} />
          <Field label="Telefone" value={phone ? (company.ddd ? `(${company.ddd}) ${phone}` : phone) : company.ddd} />
        </Section>

        <Section title="Origem da Importação">
          {queue.length === 0 ? (
            <p className="text-sm text-slate-500">Não veio da Consulta Automática.</p>
          ) : (
            <div className="space-y-3">
              {queue.map((q: any) => (
                <div key={q.id} className="rounded border border-slate-200 p-3 text-sm">
                  <div><span className="font-semibold">Data consultada:</span> {q.query_date ? formatDateBR(q.query_date) : '—'}</div>
                  <div><span className="font-semibold">Descoberta em:</span> {q.created_at ? new Date(q.created_at).toLocaleString('pt-BR') : '—'}</div>
                  <div><span className="font-semibold">Empresa nova:</span> {q.was_new_company ? 'Sim' : 'Não'}</div>
                  <div><span className="font-semibold">Link novo:</span> {q.was_new_link ? 'Sim' : 'Não'}</div>
                  {q.run_id && runs[q.run_id] && (
                    <div className="mt-1 text-xs text-slate-600">
                      Execução: {new Date(runs[q.run_id].started_at).toLocaleString('pt-BR')} · {runs[q.run_id].trigger} · {runs[q.run_id].status}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Links associados">
          {links.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum link.</p>
          ) : (
            <div className="space-y-3">
              {links.map((l: any) => {
                const pub = l.public_url || (l.public_token ? `/c/${l.public_token}` : null);
                const chk = l.checkout_url || (l.public_token ? `/checkout/${l.public_token}` : null);
                return (
                  <div key={l.id} className="rounded border border-slate-200 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      {l.active ? <Badge className="bg-green-600">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                      {l.is_test_record
                        ? <Badge className="bg-amber-500 text-white">Link de teste</Badge>
                        : <Badge variant="outline">Link normal</Badge>}
                      <span className="text-xs text-slate-500">{new Date(l.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                    {l.is_test_record && (
                      <p className="mt-1 text-xs text-amber-700">
                        Este link foi gerado apenas para teste e os dados da empresa podem estar incompletos.
                      </p>
                    )}
                    <div className="mt-2 font-mono text-xs">Token: {l.public_token}</div>
                    {pub && (
                      <div className="mt-1 flex items-center gap-2">
                        <a className="truncate text-brand-blue underline" href={pub} target="_blank" rel="noreferrer">{pub}</a>
                        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(pub); toast.success('Link público copiado'); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {chk && (
                      <div className="mt-1 flex items-center gap-2">
                        <a className="truncate text-brand-blue underline" href={chk} target="_blank" rel="noreferrer">{chk}</a>
                        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(chk); toast.success('Checkout copiado'); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="pt-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/painel/links-gerados"><ExternalLink className="mr-1 h-3 w-3" /> Ver todos os links</Link>
                </Button>
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
