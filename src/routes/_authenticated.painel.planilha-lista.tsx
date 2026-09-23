import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Download, Loader2, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { formatCNPJ } from '@/lib/format';
import { listPlanilhaLista, type PlanilhaRow } from '@/lib/planilha/lista.functions';

export const Route = createFileRoute('/_authenticated/painel/planilha-lista')({
  head: () => ({
    meta: [
      { title: 'Planilha Lista | Painel' },
      {
        name: 'description',
        content: 'Baixe a planilha das empresas importadas por data com razão social, CNPJ, celular e link.',
      },
      { property: 'og:title', content: 'Planilha Lista | Painel' },
      {
        property: 'og:description',
        content: 'Exporte razão social, CNPJ, celular e link das empresas importadas no dia escolhido.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: PlanilhaListaPage,
});

function todayBR(): string {
  const now = new Date();
  const br = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return br.toISOString().slice(0, 10);
}

function csvEscape(v: string): string {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function capitalize(v: string): string {
  const s = String(v ?? '').trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function shortCNPJ(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length !== 14) return raw;
  return `${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const storageKey = (d: string) => `planilha-baixadas-${d}`;

function loadDownloaded(d: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(d));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveDownloaded(d: string, set: Set<string>) {
  try {
    localStorage.setItem(storageKey(d), JSON.stringify([...set]));
  } catch {
    /* sem espaço no navegador: segue sem gravar */
  }
}

function PlanilhaListaPage() {
  const [date, setDate] = useState(todayBR());
  const [rows, setRows] = useState<PlanilhaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloaded, setDownloaded] = useState<Set<string>>(() => loadDownloaded(todayBR()));
  const fetchList = useServerFn(listPlanilhaLista);

  const load = useCallback(
    async (d: string) => {
      setLoading(true);
      try {
        const r = await fetchList({ data: { date: d } });
        setRows(r.rows);
        if (!r.rows.length) toast.info('Nenhuma empresa importada nessa data.');
      } catch (e: any) {
        toast.error(e?.message ?? 'Falha ao carregar a lista.');
      } finally {
        setLoading(false);
      }
    },
    [fetchList],
  );

  useEffect(() => {
    void load(todayBR());
  }, [load]);

  const pickDate = (d: string) => {
    setDate(d);
    setDownloaded(loadDownloaded(d));
  };

  // O que já foi baixado fica marcado e não se mistura com o que falta.
  const remaining = rows.filter((r) => !downloaded.has(r.cnpj));
  const downloadedRows = rows.filter((r) => downloaded.has(r.cnpj));

  const download = (mode: 'all' | 'batch') => {
    const slice = mode === 'all' ? remaining : remaining.slice(0, 1000);
    if (!slice.length) {
      toast.error(remaining.length ? 'Nada para baixar.' : 'Tudo dessa data já foi baixado.');
      return;
    }
    const toNumero = (p: string) => {
      const d = String(p || '').replace(/\D/g, '');
      if (!d) return '';
      return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
    };
    const header = ['numero', 'nome', 'link'];
    const lines = [
      header.join(','),
      ...slice.map((r) =>
        [csvEscape(toNumero(r.celular)), csvEscape(capitalize(r.razaoSocial)), csvEscape(r.link)].join(','),
      ),
    ];
    void shortCNPJ;
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      mode === 'all'
        ? `lista-empresas-${date}-completa.csv`
        : `lista-empresas-${date}-lote-${Math.floor(downloaded.size / 1000) + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    const next = new Set(downloaded);
    for (const r of slice) next.add(r.cnpj);
    setDownloaded(next);
    saveDownloaded(date, next);
    toast.success(
      mode === 'all'
        ? `Baixou tudo: ${slice.length} empresa(s).`
        : `Baixou ${slice.length}. Faltam ${remaining.length - slice.length}.`,
    );
  };

  const resetDownloaded = () => {
    setDownloaded(new Set());
    saveDownloaded(date, new Set());
    toast.info('Marcação de baixadas limpa para essa data.');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Planilha Lista
          </CardTitle>
          <CardDescription>
            Escolha a data de importação e baixe a planilha com razão social, CNPJ, celular e link do site.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="data">Data</Label>
            <Input
              id="data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <Button variant="outline" onClick={() => void load(date)} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Buscar
          </Button>
          <Button onClick={download} disabled={loading || !rows.length}>
            <Download className="mr-2 h-4 w-4" /> Baixar planilha
          </Button>
          <Badge variant="secondary">{rows.length} empresa(s)</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prévia</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Número Celular</TableHead>
                <TableHead>Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    {loading ? 'Carregando...' : 'Nenhuma empresa nessa data.'}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.cnpj}>
                    <TableCell className="max-w-[280px] truncate">{r.razaoSocial || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{formatCNPJ(r.cnpj) || r.cnpj}</TableCell>
                    <TableCell className="font-mono text-xs">{r.celular}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-xs text-blue-600">{r.link || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
