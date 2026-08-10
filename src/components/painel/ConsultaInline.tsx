import { useEffect } from 'react';
import { CalendarSearch, Loader2, RefreshCw, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/lib/automation/store';
import {
  bootConsultaEngine,
  changeQueryDate,
  consultaStore,
  runCountOnce,
  runListOnce,
} from '@/lib/automation/consulta-engine';

/**
 * Consulta automática embutida na aba WhatsApp em Massa.
 * Usa exatamente o mesmo motor/estado da aba Consulta Automática — trocar o
 * dia aqui reflete lá e vice-versa, sem duplicar lógica.
 */
export function ConsultaInline() {
  const dateMode = useStore(consultaStore, (s) => s.dateMode);
  const selectedDate = useStore(consultaStore, (s) => s.selectedDate);
  const countResult = useStore(consultaStore, (s) => s.countResult);
  const foundCount = useStore(consultaStore, (s) => s.foundList.length);
  const isCounting = useStore(consultaStore, (s) => s.isCounting);

  useEffect(() => {
    bootConsultaEngine();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarSearch className="h-5 w-5" /> Consulta automática (dia)
        </CardTitle>
        <CardDescription>
          Consulta grátis das aberturas do dia escolhido, já filtrando somente empresas com
          celular. É esta data que o importador abaixo e a campanha usam.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Dia consultado</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={dateMode === 'today' ? 'default' : 'outline'}
                onClick={() => changeQueryDate({ mode: 'today' })}
              >
                Hoje
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dateMode === 'specific' ? 'default' : 'outline'}
                onClick={() => changeQueryDate({ mode: 'specific', date: selectedDate })}
              >
                Dia específico
              </Button>
              {dateMode === 'specific' ? (
                <Input
                  className="w-44"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => changeQueryDate({ mode: 'specific', date: e.target.value })}
                />
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Resultado</Label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">
                Total do dia: {countResult?.total ?? '—'}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <ListChecks className="h-3 w-3" /> Na lista: {foundCount}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={isCounting} onClick={() => void runCountOnce()}>
            {isCounting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Contar agora
          </Button>
          <Button size="sm" disabled={isCounting} onClick={() => void runListOnce()}>
            {isCounting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListChecks className="mr-2 h-4 w-4" />}
            Atualizar lista do dia
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
