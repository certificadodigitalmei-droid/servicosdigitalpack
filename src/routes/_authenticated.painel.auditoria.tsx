import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getAuditLogs } from '@/lib/automation/audit.functions';
import { 
  ClipboardList, 
  Search, 
  ArrowRight, 
  CheckCircle2, 
  Mail, 
  Link2, 
  AlertCircle,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authenticated/painel/auditoria')({
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const [searchCnpj, setSearchCnpj] = useState('');
  
  const { data: logs } = useSuspenseQuery({
    queryKey: ['audit-logs', searchCnpj],
    queryFn: () => getAuditLogs({ data: { cnpj: searchCnpj, limit: 200 } }),
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'import': return <FileText className="h-4 w-4 text-blue-500" />;
      case 'link_created': return <Link2 className="h-4 w-4 text-amber-500" />;
      case 'email_queued': return <Mail className="h-4 w-4 text-slate-500" />;
      case 'email_sent': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'email_failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <ClipboardList className="h-4 w-4 text-slate-400" />;
    }
  };

  const getEventLabel = (type: string) => {
    switch (type) {
      case 'import': return 'Empresa Importada';
      case 'link_created': return 'Link Gerado';
      case 'email_queued': return 'E-mail na Fila';
      case 'email_sent': return 'E-mail Enviado';
      case 'email_failed': return 'Falha no Envio';
      default: return type;
    }
  };

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-brand-navy" />
            Auditoria de Fluxo
          </h1>
          <p className="text-sm text-slate-500">Rastreie o histórico completo de cada CNPJ no sistema.</p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por CNPJ..."
            className="pl-9 bg-white"
            value={searchCnpj}
            onChange={(e) => setSearchCnpj(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-slate-200/60 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">Momento</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">Evento</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">CNPJ</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                      {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getEventIcon(log.event_type)}
                        <span className="text-sm font-medium text-slate-700">
                          {getEventLabel(log.event_type)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-600">
                      {log.cnpj || '---'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      <div className="max-w-xs truncate">
                        {JSON.stringify(log.details)}
                      </div>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-blue-50/50 border-blue-100 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-blue-700 uppercase">Total Importado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{logs.filter((l:any) => l.event_type === 'import').length}</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50/50 border-emerald-100 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-emerald-700 uppercase">E-mails Enviados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-900">{logs.filter((l:any) => l.event_type === 'email_sent').length}</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/50 border-amber-100 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-amber-700 uppercase">Links Criados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900">{logs.filter((l:any) => l.event_type === 'link_created').length}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
