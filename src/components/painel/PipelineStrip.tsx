import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPipelineState } from '@/lib/pipeline/pipeline.functions';
import { Database, Link2, Inbox, Send, Lock, Unlock, ChevronRight, AlertTriangle } from 'lucide-react';

function Step({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  sub?: string;
  tone: 'slate' | 'blue' | 'amber' | 'emerald';
}) {
  const tones: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-100',
    blue: 'text-brand-blue bg-brand-blue/10',
    amber: 'text-amber-600 bg-amber-100',
    emerald: 'text-emerald-600 bg-emerald-100',
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-lg font-bold leading-tight text-slate-900">{value.toLocaleString('pt-BR')}</div>
        {sub && <div className="truncate text-[11px] text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

/**
 * Faixa do fluxo único do painel.
 * Mesma fonte de dados em todas as abas: Importadas → Links → Fila → Enviados.
 */
export function PipelineStrip() {
  const fetchState = useServerFn(getPipelineState);
  const { data } = useQuery({
    queryKey: ['pipeline-state'],
    queryFn: () => fetchState(),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  if (!data) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-4 text-sm text-slate-500">Carregando fluxo…</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Step
            icon={Database}
            label="Empresas importadas"
            value={data.importadas}
            sub={data.semLink > 0 ? `${data.semLink} sem link` : 'todas com link'}
            tone="slate"
          />
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 md:block" />
          <Step
            icon={Link2}
            label="Links gerados"
            value={data.links}
            sub={data.linksSemEnvio > 0 ? `${data.linksSemEnvio} sem envio` : 'todos enfileirados'}
            tone="blue"
          />
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 md:block" />
          <Step
            icon={Inbox}
            label="Fila de envio"
            value={data.fila}
            sub="aguardando disparo"
            tone="amber"
          />
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 md:block" />
          <Step
            icon={Send}
            label="E-mails enviados"
            value={data.enviados}
            sub={data.falhas > 0 ? `${data.falhas} falha(s)` : 'sem falhas'}
            tone="emerald"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {data.importacaoLiberada ? (
            <Badge className="gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <Unlock className="h-3 w-3" />
              Importação liberada
            </Badge>
          ) : (
            <Badge className="gap-1.5 bg-amber-100 text-amber-800 hover:bg-amber-100">
              <Lock className="h-3 w-3" />
              Importação travada
            </Badge>
          )}
          <span className="text-xs text-slate-600">
            {data.importacaoLiberada
              ? 'Nada pendente — o próximo lote pode ser importado.'
              : data.motivoBloqueio}
          </span>
          {data.linksSemEnvio > 0 && (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {data.linksSemEnvio} link(s) ainda precisam ser enviados antes de importar mais
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
