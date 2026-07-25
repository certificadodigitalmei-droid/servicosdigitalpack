import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, DollarSign, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getPricing, savePricing } from '@/lib/pricing.functions';

export const Route = createFileRoute('/_authenticated/painel/precos')({
  head: () => ({ meta: [{ title: 'Preços | Central MEI' }] }),
  component: PricingPage,
});

// Aceita "49,99", "49.99", "R$ 49,99" etc. -> retorna número em reais.
function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PricingPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['pricing'],
    queryFn: () => getPricing(),
  });

  const [text, setText] = useState('');

  useEffect(() => {
    if (data) setText(formatBRL(data.product_amount));
  }, [data]);

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = parseAmount(text);
      if (parsed == null) throw new Error('Digite um valor válido, ex.: 49,99');
      return savePricing({ data: { product_amount: parsed } });
    },
    onSuccess: () => {
      toast.success('Preço salvo. Novos PIX usarão o novo valor.');
      qc.invalidateQueries({ queryKey: ['pricing'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });

  const preview = parseAmount(text);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-navy">
          <DollarSign className="h-6 w-6 text-brand-blue" />
          Preço do Certificado
        </h1>
        <p className="text-sm text-slate-500">
          Este é o valor cobrado em todos os PIX gerados pelos links das empresas. Ao salvar, os novos PIX passam a usar
          o novo valor imediatamente.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valor cobrado</CardTitle>
            <CardDescription>
              Preço atual: <strong>R$ {formatBRL(data?.product_amount ?? 97)}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Novo valor (R$)</Label>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-slate-500">R$</span>
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="49,99"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="text-lg font-semibold"
                />
              </div>
              {preview != null && (
                <p className="text-xs text-slate-500">
                  Prévia: PIX será gerado no valor de <strong>R$ {formatBRL(preview)}</strong>.
                </p>
              )}
            </div>

            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || preview == null}
              className="w-full sm:w-auto"
            >
              {mut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Salvar valor
                </>
              )}
            </Button>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              O valor aplica-se a todos os links gerados — inclusive os já enviados. Pagamentos concluídos anteriormente
              não são alterados.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
