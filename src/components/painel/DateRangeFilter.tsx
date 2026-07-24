import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export type DatePreset = 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'all' | 'custom';

const PRESETS: [DatePreset, string][] = [
  ['today', 'Hoje'],
  ['yesterday', 'Ontem'],
  ['7d', '7 dias'],
  ['15d', '15 dias'],
  ['30d', '30 dias'],
  ['all', 'Tudo'],
  ['custom', 'Personalizado'],
];

function startOfDay(d: Date) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}
function endOfDay(d: Date) {
  const nd = new Date(d);
  nd.setHours(23, 59, 59, 999);
  return nd;
}

export function computeDateRange(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): { from?: Date; to?: Date } {
  const now = new Date();
  if (preset === 'all') return {};
  if (preset === 'today') return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (preset === '7d' || preset === '15d' || preset === '30d') {
    const days = preset === '7d' ? 7 : preset === '15d' ? 15 : 30;
    const from = new Date(now);
    from.setDate(now.getDate() - (days - 1));
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  const f = customFrom ? startOfDay(new Date(customFrom + 'T00:00:00')) : undefined;
  const t = customTo ? endOfDay(new Date(customTo + 'T00:00:00')) : undefined;
  return { from: f, to: t };
}

type Props = {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  className?: string;
  compact?: boolean;
};

export function DateRangeFilter({
  preset,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  className,
  compact,
}: Props) {
  const inner = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600 mr-2">
        <CalendarIcon className="h-4 w-4" /> Período:
      </div>
      {PRESETS.map(([key, label]) => (
        <Button
          key={key}
          size="sm"
          variant={preset === key ? 'default' : 'outline'}
          onClick={() => onPresetChange(key)}
        >
          {label}
        </Button>
      ))}
      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 ml-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className="h-9 w-auto"
          />
          <span className="text-slate-400 text-sm">até</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className="h-9 w-auto"
          />
        </div>
      )}
    </div>
  );

  if (compact) return <div className={className}>{inner}</div>;

  return (
    <Card className={className}>
      <CardContent className="pt-6">{inner}</CardContent>
    </Card>
  );
}
