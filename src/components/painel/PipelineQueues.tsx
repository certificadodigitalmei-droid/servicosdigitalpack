import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCNPJ } from '@/lib/format';
import { getPendingSendTargets, getCompaniesWithoutLink } from '@/lib/pipeline/pipeline.functions';
import { Inbox, Link2 } from 'lucide-react';

/** Empresas importadas que ainda aguardam a geração do link. */
export function AguardandoLinkCard({ limit = 20 }: { limit?: number }) {
  const fetchRows = useServerFn(getCompaniesWithoutLink);
  const { data } = useQuery({
    queryKey: ['pipeline-sem-link', limit],
    queryFn: () => fetchRows({ data: { limit } }),
    refetchInterval: 20_000,
  });
  const rows = data ?? [];

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-brand-blue" />
          Aguardando geração de link
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <CardDescription>
          Empresas já importadas cujo link público ainda não foi criado. Elas são processadas
          automaticamente antes de qualquer nova importação.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma pendência — todas as empresas têm link.</p>
        ) : (
          <ol className="divide-y divide-slate-100 text-sm">
            {rows.map((r, i) => (
              <li key={r.companyId} className="flex items-center gap-3 py-2">
                <span className="w-6 shrink-0 text-xs font-semibold text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{r.nome}</span>
                <span className="shrink-0 font-mono text-xs text-slate-500">
                  {formatCNPJ(r.cnpj)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Links já gerados que ainda não entraram na fila de envio. */
export function AguardandoEnvioCard({ limit = 20 }: { limit?: number }) {
  const fetchRows = useServerFn(getPendingSendTargets);
  const { data } = useQuery({
    queryKey: ['pipeline-sem-envio', limit],
    queryFn: () => fetchRows({ data: { limit } }),
    refetchInterval: 20_000,
  });
  const rows = data ?? [];

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-amber-600" />
          Fila de espera do envio
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <CardDescription>
          Links já gerados que ainda não entraram na fila de disparo. Enquanto houver itens aqui, a
          importação de novas empresas fica travada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma pendência — todos os links foram enfileirados.</p>
        ) : (
          <ol className="divide-y divide-slate-100 text-sm">
            {rows.map((r, i) => (
              <li key={r.companyId} className="flex items-center gap-3 py-2">
                <span className="w-6 shrink-0 text-xs font-semibold text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{r.nome}</span>
                <span className="shrink-0 font-mono text-xs text-slate-500">
                  {formatCNPJ(r.cnpj)}
                </span>
                <span className="hidden shrink-0 truncate text-xs text-slate-400 sm:block sm:max-w-[200px]">
                  {r.email ?? 'sem e-mail'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
