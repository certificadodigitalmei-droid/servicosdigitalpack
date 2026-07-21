import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Search, Copy, ExternalLink, Loader2, RefreshCw, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { WipeAllButton, EMPTY_UUID } from '@/components/painel/WipeAllButton';
import { formatCNPJ } from '@/lib/format';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/painel/links-gerados')({
  head: () => ({ meta: [{ title: 'Links Gerados | Painel' }] }),
  component: LinksGeradosPage,
});

const PAGE_SIZE = 25;

function LinksGeradosPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all'); // all|active|inactive
  const [origin, setOrigin] = useState('all'); // all|auto|manual
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [autoLinkIds, setAutoLinkIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('company_links')
        .select(
          'id,company_id,public_token,public_url,checkout_url,active,status,expires_at,access_count,created_at,generation_id,is_test_record,data_quality_status,companies(id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia)',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false });

      if (status === 'active') q = q.eq('active', true);
      if (status === 'inactive') q = q.eq('active', false);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to + 'T23:59:59');
      if (search.trim()) {
        const s = search.trim();
        const digits = s.replace(/\D/g, '');
        if (digits.length >= 3) {
          q = q.or(`public_token.ilike.%${s}%`);
        } else {
          q = q.or(`public_token.ilike.%${s}%`);
        }
      }
      q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      let list = (data ?? []) as any[];

      // client-side filter by CNPJ / empresa (join field)
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const digits = s.replace(/\D/g, '');
        list = list.filter((r) => {
          const c = r.companies;
          if (!c) return true;
          if (digits && c.cnpj?.includes(digits)) return true;
          const name = ((c.nome_titular_exibicao || c.razao_social_original || c.nome_fantasia) ?? '').toLowerCase();
          return name.includes(s) || (r.public_token ?? '').toLowerCase().includes(s);
        });
      }

      // origem: quais link_ids aparecem na fila
      if (list.length) {
        const ids = list.map((r) => r.id);
        const { data: queueRows } = await supabase
          .from('automatic_company_queue')
          .select('company_link_id')
          .in('company_link_id', ids);
        const set = new Set<string>((queueRows ?? []).map((q: any) => q.company_link_id).filter(Boolean));
        setAutoLinkIds(set);
        if (origin === 'auto') list = list.filter((r) => set.has(r.id));
        if (origin === 'manual') list = list.filter((r) => !set.has(r.id));
      } else {
        setAutoLinkIds(new Set());
      }

      setRows(list);
      setTotal(count ?? list.length);
    } catch (e: any) {
      toast.error('Erro ao carregar links: ' + (e?.message ?? 'desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Links Gerados</h1>
        <p className="text-sm text-slate-600">Todos os links públicos e de checkout já criados.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Buscar (CNPJ, empresa, token)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setPage(0), void load())}
                placeholder="Digite e pressione Enter" />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Origem</Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="auto">Consulta Automática</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Geração (de)</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>Geração (até)</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 md:col-span-3 lg:col-span-4">
            <Button onClick={() => { setPage(0); void load(); }} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Aplicar
            </Button>
            <Button variant="outline" onClick={() => {
              setSearch(''); setStatus('all'); setOrigin('all'); setFrom(''); setTo('');
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
          <CardDescription>{total} link(s) — página {page + 1} de {totalPages}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Acessos</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                  </TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-slate-500">
                    Nenhum link encontrado.
                  </TableCell></TableRow>
                ) : rows.map((r) => {
                  const c = r.companies;
                  const nome = c ? ((c.nome_titular_exibicao || c.razao_social_original || c.nome_fantasia || '').replace(/^\d+[.\-/\s]*/, '').trim() || '—') : '—';
                  const pub = r.public_url || (r.public_token ? `/c/${r.public_token}` : null);
                  const chk = r.checkout_url || (r.public_token ? `/checkout/${r.public_token}` : null);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[220px] truncate font-medium">{nome}</TableCell>
                      <TableCell className="font-mono text-xs">{c?.cnpj ? formatCNPJ(c.cnpj) : '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{r.public_token?.slice(0, 12)}…</TableCell>
                      <TableCell>
                        {r.is_test_record
                          ? <Badge className="bg-amber-500 text-white" title="Link gerado para teste, dados podem estar incompletos">Teste</Badge>
                          : <Badge variant="outline">Normal</Badge>}
                      </TableCell>
                      <TableCell>
                        {r.active ? <Badge className="bg-green-600">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                      </TableCell>
                      <TableCell>
                        {autoLinkIds.has(r.id)
                          ? <Badge variant="secondary">Automática</Badge>
                          : <Badge variant="outline">Manual</Badge>}
                      </TableCell>
                      <TableCell>{r.access_count ?? 0}</TableCell>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          {pub && (
                            <>
                              <Button size="sm" variant="ghost" title="Abrir link público" onClick={() => window.open(pub, '_blank')}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Copiar link público" onClick={() => { navigator.clipboard.writeText(pub); toast.success('Link copiado'); }}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {chk && (
                            <Button size="sm" variant="ghost" title="Copiar checkout" onClick={() => { navigator.clipboard.writeText(chk); toast.success('Checkout copiado'); }}>
                              💳
                            </Button>
                          )}
                          {r.company_id && (
                            <Button asChild size="sm" variant="ghost" title="Abrir empresa">
                              <Link to="/painel/empresas-importadas/$companyId" params={{ companyId: r.company_id }}>
                                <Building2 className="h-3 w-3" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-slate-500">Página {page + 1} de {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
