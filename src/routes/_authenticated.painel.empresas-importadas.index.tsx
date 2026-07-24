import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState, useMemo } from 'react';
import { Search, Eye, RefreshCw, Loader2, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { WipeAllButton, EMPTY_UUID } from '@/components/painel/WipeAllButton';
import { formatCNPJ, formatDateBR } from '@/lib/format';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/painel/empresas-importadas/')({
  head: () => ({ meta: [{ title: 'Empresas Importadas | Painel' }] }),
  component: EmpresasImportadasPage,
});

type Row = {
  id: string;
  cnpj: string;
  razao_social_original: string | null;
  nome_titular_exibicao: string | null;
  nome_fantasia: string | null;
  situacao_cadastral_desc: string | null;
  inicio_atividade: string | null;
  is_mei: boolean | null;
  is_matriz: boolean | null;
  uf: string | null;
  municipio_descricao: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
  is_test_record: boolean | null;
  data_quality_status: string | null;
  missing_fields: string[] | null;
};

function QualityBadge({ status, isTest }: { status: string | null; isTest: boolean | null }) {
  if (isTest) return <Badge className="bg-amber-500 text-white">Teste</Badge>;
  if (status === 'pending_enrichment') return <Badge className="bg-orange-500 text-white">Pendente</Badge>;
  if (status === 'incomplete') return <Badge variant="destructive">Incompleta</Badge>;
  return <Badge className="bg-emerald-600 text-white">Completa</Badge>;
}

const PAGE_SIZE = 10000;

function niceName(r: Row): string {
  const raw = r.nome_titular_exibicao || r.razao_social_original || '';
  return raw.replace(/^\d+[.\-/\s]*/, '').trim() || 'Não informado';
}

function EmpresasImportadasPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [uf, setUf] = useState<string>('all');
  const [emailFilter, setEmailFilter] = useState<string>('all');
  const [quality, setQuality] = useState<string>('all'); // all | complete | pending_enrichment | test_partial | test
  const [openingFrom, setOpeningFrom] = useState('');
  const [openingTo, setOpeningTo] = useState('');
  const [importedFrom, setImportedFrom] = useState('');
  const [importedTo, setImportedTo] = useState('');
  const [dia, setDia] = useState<string>(''); // filtro rápido: um único dia

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('companies')
        .select(
          'id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia,situacao_cadastral_desc,inicio_atividade,is_mei,is_matriz,uf,municipio_descricao,email,created_at,updated_at,is_test_record,data_quality_status,missing_fields',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false });

      if (search.trim()) {
        const s = search.trim();
        const digits = s.replace(/\D/g, '');
        if (digits.length >= 3) {
          q = q.or(
            `cnpj.ilike.%${digits}%,razao_social_original.ilike.%${s}%,nome_titular_exibicao.ilike.%${s}%,nome_fantasia.ilike.%${s}%`,
          );
        } else {
          q = q.or(
            `razao_social_original.ilike.%${s}%,nome_titular_exibicao.ilike.%${s}%,nome_fantasia.ilike.%${s}%`,
          );
        }
      }
      if (uf !== 'all') q = q.eq('uf', uf);
      if (emailFilter === 'with') q = q.not('email', 'is', null).neq('email', '');
      if (emailFilter === 'without') q = q.or('email.is.null,email.eq.');
      if (quality === 'test') q = q.eq('is_test_record', true);
      else if (quality !== 'all') q = q.eq('data_quality_status', quality).eq('is_test_record', false);
      if (openingFrom) q = q.gte('inicio_atividade', openingFrom);
      if (openingTo) q = q.lte('inicio_atividade', openingTo);
      if (importedFrom) q = q.gte('created_at', importedFrom);
      if (importedTo) q = q.lte('created_at', importedTo + 'T23:59:59');

      q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      const list = (data ?? []) as Row[];

      setRows(list);
      setTotal(count ?? list.length);
    } catch (e: any) {
      toast.error('Erro ao carregar empresas: ' + (e?.message ?? 'desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const ufs = useMemo(
    () => [
      'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Empresas Importadas</h1>
          <p className="text-sm text-slate-600">
            Registros importados via Consulta Automática ou importação manual.
          </p>
        </div>
        <WipeAllButton
          label="Apagar todas as empresas"
          title="Apagar todas as empresas importadas?"
          description="Remove permanentemente todas as empresas, junto com todos os links, gerações, eventos e itens da fila da Consulta Automática. Os links públicos deixarão de funcionar. Não pode ser desfeito."
          steps={[
            { label: 'link_events', run: () => supabase.from('link_events').delete().neq('id', EMPTY_UUID) },
            { label: 'company_links', run: () => supabase.from('company_links').delete().neq('id', EMPTY_UUID) },
            { label: 'link_generations', run: () => supabase.from('link_generations').delete().neq('id', EMPTY_UUID) },
            { label: 'automatic_company_queue', run: () => supabase.from('automatic_company_queue').delete().neq('id', EMPTY_UUID) },
            { label: 'companies', run: () => supabase.from('companies').delete().neq('id', EMPTY_UUID) },
          ]}
          onDone={() => { setPage(0); load(); }}
        />
      </div>


      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Busque e refine os resultados.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Busca (CNPJ, razão, fantasia)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPage(0), void load())}
                placeholder="Digite e pressione Enter"
              />
            </div>
          </div>
          <div>
            <Label>UF</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {ufs.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>E-mail</Label>
            <Select value={emailFilter} onValueChange={setEmailFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="with">Com e-mail</SelectItem>
                <SelectItem value="without">Sem e-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Dia</Label>
            <Input
              type="date"
              value={dia}
              onChange={(e) => {
                const d = e.target.value;
                setDia(d);
                setImportedFrom(d);
                setImportedTo(d);
              }}
            />
          </div>
          <div>
            <Label>Qualidade dos dados</Label>
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="complete">Completa</SelectItem>
                <SelectItem value="pending_enrichment">Pendente de complementação</SelectItem>
                <SelectItem value="test">Registro de teste</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Abertura (de)</Label>
            <Input type="date" value={openingFrom} onChange={(e) => setOpeningFrom(e.target.value)} />
          </div>
          <div>
            <Label>Abertura (até)</Label>
            <Input type="date" value={openingTo} onChange={(e) => setOpeningTo(e.target.value)} />
          </div>
          <div>
            <Label>Importada (de)</Label>
            <Input type="date" value={importedFrom} onChange={(e) => setImportedFrom(e.target.value)} />
          </div>
          <div>
            <Label>Importada (até)</Label>
            <Input type="date" value={importedTo} onChange={(e) => setImportedTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 md:col-span-3 lg:col-span-4">
            <Button onClick={() => { setPage(0); void load(); }} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Aplicar filtros
            </Button>
            <Button variant="outline" onClick={() => {
              setSearch(''); setUf('all'); setEmailFilter('all'); setDia('');
              setOpeningFrom(''); setOpeningTo(''); setImportedFrom(''); setImportedTo('');
              setPage(0); setTimeout(load, 0);
            }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultados</CardTitle>
          <CardDescription>{total} registro(s) exibidos em uma única página</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Qualidade</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Abertura</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Importada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                  </TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-slate-500">
                    Nenhuma empresa encontrada.
                  </TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[220px] truncate font-medium">{niceName(r)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <button
                        className="inline-flex items-center gap-1 hover:text-brand-blue"
                        onClick={() => { navigator.clipboard.writeText(formatCNPJ(r.cnpj)); toast.success('CNPJ copiado'); }}
                        title="Copiar CNPJ"
                      >
                        {formatCNPJ(r.cnpj)} <Copy className="h-3 w-3" />
                      </button>
                    </TableCell>
                    <TableCell><QualityBadge status={r.data_quality_status} isTest={r.is_test_record} /></TableCell>
                    <TableCell>{r.situacao_cadastral_desc || 'Não informado'}</TableCell>
                    <TableCell>{r.inicio_atividade ? formatDateBR(r.inicio_atividade) : 'Não informado'}</TableCell>
                    <TableCell>{r.uf || '—'}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{r.email || 'Não informado'}</TableCell>
                    <TableCell>
                      {autoIds.has(r.id)
                        ? <Badge variant="secondary">Consulta Automática</Badge>
                        : <Badge variant="outline">Manual</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{formatDateBR(r.created_at.slice(0, 10))}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/painel/empresas-importadas/$companyId" params={{ companyId: r.id }}>
                          <Eye className="mr-1 h-3 w-3" /> Ver detalhes
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            {rows.length.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} empresas carregadas
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
