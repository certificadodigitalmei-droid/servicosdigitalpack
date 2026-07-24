import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { getSiteDisplay, saveSiteDisplay, type SiteDisplaySettings } from '@/lib/site-display.functions';

export const Route = createFileRoute('/_authenticated/painel/exibicao-site')({
  head: () => ({ meta: [{ title: 'Exibição do Site | Central MEI' }] }),
  component: SiteDisplayPage,
});

function SiteDisplayPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['site-display'],
    queryFn: () => getSiteDisplay(),
  });

  const [form, setForm] = useState<SiteDisplaySettings>({
    show_cert_landing: true,
    show_cert_success: true,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mut = useMutation({
    mutationFn: () => saveSiteDisplay({ data: form }),
    onSuccess: () => {
      toast.success('Preferências salvas');
      qc.invalidateQueries({ queryKey: ['site-display'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Exibição do Site</h1>
        <p className="text-sm text-slate-500">
          Escolha quando a imagem do certificado será exibida na página do cliente.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="h-4 w-4 text-brand-blue" />
                Certificado na tela inicial
              </CardTitle>
              <CardDescription>
                Exibir a imagem do certificado (com status "Pendente") na página do cliente antes do
                pagamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <Label htmlFor="landing" className="text-sm font-medium">
                Mostrar antes do pagamento
              </Label>
              <Switch
                id="landing"
                checked={form.show_cert_landing}
                onCheckedChange={(v) => setForm({ ...form, show_cert_landing: v })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Certificado após o pagamento
              </CardTitle>
              <CardDescription>
                Exibir a imagem do certificado (com status "Ativo") após a confirmação do pagamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <Label htmlFor="success" className="text-sm font-medium">
                Mostrar após o pagamento
              </Label>
              <Switch
                id="success"
                checked={form.show_cert_success}
                onCheckedChange={(v) => setForm({ ...form, show_cert_success: v })}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              className="bg-brand-blue hover:bg-brand-navy"
              disabled={mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar preferências
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
