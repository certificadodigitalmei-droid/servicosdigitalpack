import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Trash2, Search, Download, Copy, ExternalLink } from 'lucide-react';
import { useStore } from '@/lib/automation/store';
import { envioStore, removeSentEmail, removeSentEmailsInRange } from '@/lib/automation/envio-engine';
import { formatCnpj } from '@/lib/email-campaign/template';
import { toast } from 'sonner';
import { DateRangeFilter, computeDateRange, type DatePreset } from '@/components/painel/DateRangeFilter';

export const Route = createFileRoute('/_authenticated/painel/enviados')({
  component: EnviadosPage,
});

function EnviadosPage() {
  const sent = useStore(envioStore, (s) => s.sentEmails);
  const [q, setQ] = useState('');
  const [preset, setPreset] = useState<DatePreset>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const range = useMemo(() => computeDateRange(preset, from, to), [preset, from, to]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const fromMs = range.from?.getTime();
    const toMs = range.to?.getTime();
    return sent.filter((e) => {
      const t = new Date(e.sentAt).getTime();
      if (fromMs !== undefined && t < fromMs) return false;
      if (toMs !== undefined && t > toMs) return false;
      if (!term) return true;
      return (
        e.email.toLowerCase().includes(term) ||
        e.cnpj.toLowerCase().includes(term) ||
        e.company_name.toLowerCase().includes(term) ||
        e.subject.toLowerCase().includes(term)
      );
    });
  }, [sent, q, range.from, range.to]);

  const stats = useMemo(() => {
    const startHour = Date.now() - 60 * 60 * 1000;
    let lastHour = 0;
    let test = 0;
    for (const e of filtered) {
      const t = new Date(e.sentAt).getTime();
      if (t >= startHour) lastHour++;
      if (e.testMode) test++;
    }
    // O usuário quer que o total do período mostre o valor exato selecionado
    return { total: sent.length, lastHour, test, inRange: filtered.length };
  }, [sent, filtered]);

  const exportCsv = () => {
    const header = ['data_envio', 'email', 'cnpj', 'empresa', 'assunto', 'modo_teste', 'link'];
    const rows = filtered.map((e) => [
      e.sentAt,
      e.email,
      formatCnpj(e.cnpj),
      e.company_name,
      e.subject,
      e.testMode ? 'sim' : 'não',
      e.publicUrl || '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enviados-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          E-mails Enviados
        </h1>
        <p className="text-sm text-slate-500">
          Registro histórico de todos os e-mails confirmados como enviados. Assim que um envio é confirmado, o destinatário sai da fila e aparece aqui automaticamente.
        </p>
      </div>

      <DateRangeFilter
        preset={preset}
        onPresetChange={setPreset}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="No período selecionado" value={stats.inRange} color="text-indigo-600" />
        <StatCard label="Última hora (do período)" value={stats.lastHour} color="text-blue-600" />
        <StatCard label="Em modo teste (do período)" value={stats.test} color="text-amber-600" />
        <StatCard label="Total registrado (todos)" value={stats.total} color="text-slate-500" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Histórico</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="w-64 pl-8"
                placeholder="Buscar por e-mail, CNPJ, empresa ou assunto..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (filtered.length === 0) return;
                const label =
                  preset === 'all'
                    ? 'TODO o histórico'
                    : `${filtered.length} registro(s) do período selecionado`;
                if (
                  confirm(
                    `Apagar ${label}?\n\nSó remove deste registro local. Não afeta a caixa de saída real nem o histórico do servidor.`,
                  )
                ) {
                  const fromISO = range.from?.toISOString();
                  const toISO = range.to?.toISOString();
                  const removed = removeSentEmailsInRange(fromISO, toISO);
                  toast.success(`${removed} registro(s) apagado(s) do período.`);
                }
              }}
              disabled={filtered.length === 0}
              title="Apaga apenas os registros dentro do período selecionado no filtro acima"
            >
              <Trash2 className="h-4 w-4" /> Apagar do período
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              {sent.length === 0
                ? 'Nenhum e-mail enviado ainda. Após confirmar um envio na aba "Envio em Massa", ele aparecerá aqui automaticamente.'
                : 'Nenhum resultado para a busca.'}
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-2">Data / Hora</th>
                    <th className="pr-2">Destinatário</th>
                    <th className="pr-2">CNPJ</th>
                    <th className="pr-2">Empresa</th>
                    <th className="pr-2">Assunto</th>
                    <th className="pr-2">Modo</th>
                    <th className="pr-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 align-top hover:bg-slate-50">
                      <td className="py-2 pr-2 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(e.sentAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="pr-2">
                        <div className="font-medium text-slate-900">{e.email}</div>
                      </td>
                      <td className="pr-2 whitespace-nowrap font-mono text-xs text-slate-700">
                        {formatCnpj(e.cnpj)}
                      </td>
                      <td className="pr-2 max-w-[220px] truncate">{e.company_name}</td>
                      <td className="pr-2 max-w-[260px] truncate text-slate-700">{e.subject}</td>
                      <td className="pr-2">
                        {e.testMode ? (
                          <Badge className="bg-amber-100 text-amber-800">Teste</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700">Real</Badge>
                        )}
                      </td>
                      <td className="pr-2 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(e.email);
                            toast.success('E-mail copiado.');
                          }}
                          title="Copiar e-mail"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {e.publicUrl && (
                          <Button size="sm" variant="ghost" asChild title="Abrir link enviado">
                            <a href={e.publicUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeSentEmail(e.id)}
                          title="Remover do histórico"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value.toLocaleString('pt-BR')}</div>
    </div>
  );
}
