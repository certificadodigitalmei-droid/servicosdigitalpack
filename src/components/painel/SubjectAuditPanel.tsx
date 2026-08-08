import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { auditSubjects } from '@/lib/email-campaign/subject-audit';

/** Verificação automática dos assuntos dos modelos de campanha (rotação). */
export function SubjectAuditPanel({ activeIds }: { activeIds: string[] }) {
  const audit = useMemo(() => auditSubjects(activeIds), [activeIds]);

  const errors = audit.issues.filter((i) => i.level === 'error');
  const warns = audit.issues.filter((i) => i.level === 'warn');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Verificação automática dos assuntos
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Checa a cada carregamento se os modelos em rotação têm assuntos diferentes entre si, sem
          variáveis quebradas e sem gatilhos de spam. Assuntos repetidos são descartados
          automaticamente na hora do envio.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {audit.ok ? (
            <Badge className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Assuntos válidos
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" /> {errors.length} problema(s)
            </Badge>
          )}
          <Badge variant="secondary">
            {audit.uniqueSubjects}/{audit.total} assuntos únicos
          </Badge>
          {warns.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {warns.length} aviso(s)
            </Badge>
          )}
        </div>

        {audit.issues.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma repetição ou risco detectado nos assuntos em rotação.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {audit.issues.map((i, idx) => (
              <li key={`${i.variantId}-${idx}`} className="text-xs flex items-start gap-2">
                {i.level === 'error' ? (
                  <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span>
                  <span className="font-medium">{i.variantName}:</span>{' '}
                  <span className="text-muted-foreground">{i.message}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
