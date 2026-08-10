import { useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Mail, Send, Reply, ImageUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadEmailAsset } from '@/lib/email-campaign/upload-asset.functions';
import { forceResetSender } from '@/lib/reset-sender.functions';
import {
  getEmailSenderSettings,
  saveEmailSenderSettings,
  type EmailSenderSettings,
} from '@/lib/email-sender.functions';

export const Route = createFileRoute('/_authenticated/painel/remetente-email')({
  head: () => ({ meta: [{ title: 'Remetente de E-mail | Central MEI' }] }),
  component: EmailSenderPage,
});

function EmailSenderPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['email-sender-settings'],
    queryFn: () => getEmailSenderSettings(),
  });

  const [form, setForm] = useState<{
    from_email: string;
    from_name: string;
    reply_to: string;
    logo_url: string;
  }>({
    from_email: '',
    from_name: '',
    reply_to: '',
    logo_url: '',
  });

  useEffect(() => {
    if (data) {
      setForm({
        from_email: data.from_email,
        from_name: data.from_name,
        reply_to: data.reply_to || '',
        logo_url: data.logo_url || '',
      });
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () => saveEmailSenderSettings({ data: form }),
    onSuccess: () => {
      toast.success('Remetente salvo');
      qc.invalidateQueries({ queryKey: ['email-sender-settings'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });

  /** Achata a imagem sobre fundo branco (evita PNG transparente virar preto no e-mail). */
  async function flattenOnWhite(dataUrl: string): Promise<string> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const size = Math.min(512, Math.max(img.width, img.height)) || 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  async function handleFile(file: File) {

    if (file.size > 800 * 1024) {
      toast.error('Imagem muito grande (máx. 800KB)');
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const flat = await flattenOnWhite(dataUrl);
      const res = await uploadEmailAsset({
        data: { dataUrl: flat, filename: file.name.replace(/\.\w+$/, '') + '.jpg' },
      });

      setForm((f) => ({ ...f, logo_url: res.url }));
      toast.success('Foto enviada — clique em Salvar remetente');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar a imagem');
    } finally {
      setUploading(false);
    }
  }

  const previewFrom = `${form.from_name || 'Nome'} <${form.from_email || 'email@dominio.com'}>`;


  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Remetente de E-mail</h1>
        <p className="text-sm text-slate-500">
          Configure o nome e o endereço de e-mail que aparecerão nos envios oficiais do sistema.
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
                <Send className="h-4 w-4 text-brand-blue" />
                Identidade do remetente
              </CardTitle>
              <CardDescription>
                Esse e-mail será usado como padrão em todos os envios: PIX gerado, lembretes,
                confirmação de pagamento, campanhas e envio em massa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="from_name">Nome do remetente</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="from_name"
                    className="pl-9"
                    value={form.from_name}
                    onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                    placeholder="Ex: Digital Certifica A1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="from_email">E-mail remetente</Label>
                <Input
                  id="from_email"
                  type="email"
                  value={form.from_email}
                  onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                  placeholder="Ex: contato@seudominio.com"
                />
                <p className="text-xs text-slate-500">
                  O domínio deve estar verificado no Cloud → Emails. Domínio atual:{' '}
                  <span className="font-medium text-slate-700">seu-certificado-mei-digital.online</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reply_to">Responder para (opcional)</Label>
                <div className="relative">
                  <Reply className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="reply_to"
                    type="email"
                    className="pl-9"
                    value={form.reply_to}
                    onChange={(e) => setForm({ ...form, reply_to: e.target.value })}
                    placeholder="Ex: suporte@seudominio.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageUp className="h-4 w-4 text-brand-blue" />
                Foto de perfil (logo do remetente)
              </CardTitle>
              <CardDescription>
                Essa imagem aparece <strong>dentro</strong> do e-mail (cabeçalho azul) em todos os
                envios. Use PNG/JPG quadrado, até 800KB.
                <br />
                <span className="mt-2 block text-amber-700">
                  Observação: a inicial colorida que alguns aplicativos de e-mail mostram na
                  caixa de entrada não vem do e-mail — para exibir a logo ali é preciso
                  configurar BIMI no DNS do domínio.
                </span>
              </CardDescription>

            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="Logo do remetente" className="h-full w-full object-cover" />
                  ) : (
                    <ImageUp className="h-6 w-6 text-slate-400" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = '';
                    }}
                  />
                  <Button variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ImageUp className="mr-2 h-4 w-4" />
                    )}
                    {form.logo_url ? 'Trocar foto' : 'Enviar foto'}
                  </Button>
                  {form.logo_url && (
                    <Button
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => setForm({ ...form, logo_url: '' })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed bg-slate-50/50">
            <CardHeader>
              <CardTitle className="text-sm text-slate-600">Pré-visualização</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-navy text-xs font-bold text-white">
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (form.from_name || 'C').slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">De</div>
                    <div className="mt-0.5 font-medium text-slate-800">{previewFrom}</div>
                  </div>
                </div>

                {form.reply_to && (
                  <>
                    <div className="mt-2 text-xs uppercase tracking-wide text-slate-400">Responder para</div>
                    <div className="mt-1 text-slate-700">{form.reply_to}</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              className="text-slate-400 hover:text-slate-600"
              onClick={async () => {
                if (!confirm('Redefinir para as configurações padrão do domínio?')) return;
                try {
                  await forceResetSender();
                  toast.success('Configurações redefinidas');
                  qc.invalidateQueries({ queryKey: ['email-sender-settings'] });
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Redefinir Padrão
            </Button>
            <Button
              className="bg-brand-blue hover:bg-brand-navy"
              disabled={mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar remetente
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
