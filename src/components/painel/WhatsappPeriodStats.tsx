import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangeFilter, computeDateRange, type DatePreset } from '@/components/painel/DateRangeFilter';
import { getWaPeriodStats } from '@/lib/whatsapp/campaigns.functions';

/** Números de envio por período escolhido (hoje, 7 dias, personalizado…). */
export function WhatsappPeriodStats() {
  const load = useServerFn(getWaPeriodStats);
  const [preset, setPreset] = useState<DatePreset>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stats, setStats] = useState<any>(null);

  const range = useMemo(() => computeDateRange(preset, from, to), [preset, from, to]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const r: any = await load({
        data: {
          from: range.from ? range.from.toISOString() : null,
          to: range.to ? range.to.toISOString() : null,
        },
      });
      if (alive) setStats(r);
    };
    void run();
    const t = window.setInterval(() => void run(), 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from?.getTime(), range.to?.getTime()]);

  const cards = [
    { label: 'Campanhas', value: stats?.campaigns ?? 0 },
    { label: 'Tentativas', value: stats?.attempts ?? 0 },
    { label: 'Aceitas pela API', value: stats?.accepted ?? 0 },
    { label: 'Enviadas (Meta)', value: stats?.metaSent ?? 0 },
    { label: 'Entregues', value: stats?.delivered ?? 0 },
    { label: 'Lidas', value: stats?.read ?? 0 },
    { label: 'Rejeitadas', value: stats?.rejected ?? 0 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Envios por período</CardTitle>
        <CardDescription>Escolha o período para ver quantas mensagens saíram e como foram entregues.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DateRangeFilter
          compact
          preset={preset}
          onPresetChange={setPreset}
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
        />
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {cards.map((c) => (
            <div key={c.label} className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="text-xl font-semibold text-slate-900">{c.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
