import { useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { CAMPAIGN_VARIANTS } from '@/lib/email-campaign/variants';
import {
  renderHtml,
  renderText,
  substitute,
  type CampaignDesign,
} from '@/lib/email-campaign/template';
import { analyzeSpamScore, type SpamReport } from '@/lib/email-campaign/spam-score';
import { sendCampaignEmail } from '@/lib/email-campaign/send.functions';

type Item = {
  id: string;
  name: string;
  subject: string;
  design: CampaignDesign;
  report: SpamReport;
};

const verdictStyle: Record<SpamReport['verdict'], { label: string; className: string }> = {
  excelente: { label: 'Excelente', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  bom: { label: 'Bom', className: 'bg-blue-600 text-white hover:bg-blue-600' },
  atencao: { label: 'Atenção', className: 'bg-amber-500 text-white hover:bg-amber-500' },
  risco: { label: 'Risco alto', className: 'bg-rose-600 text-white hover:bg-rose-600' },
};

export function SpamScorePanel({ vars }: { vars: Record<string, string> }) {
  const [selected, setSelected] = useState<string>(CAMPAIGN_VARIANTS[0].id);
  const [testAddress, setTestAddress] = useState('');
  const [sending, setSending] = useState(false);
  const send = useServerFn(sendCampaignEmail);

  const items = useMemo<Item[]>(() => {
    const list: { id: string; name: string; subject: string; design: CampaignDesign }[] = [
      ...CAMPAIGN_VARIANTS.map((v) => ({
        id: v.id,
        name: v.name,
        subject: v.subject,
        design: v.design,
      })),
    ];
    return list.map((i) => {
      const html = renderHtml(i.design, vars);
      const text = renderText(i.design, vars);
      return {
        ...i,
        report: analyzeSpamScore({
          subject: substitute(i.subject, vars),
          html,
          text,
          fromAddress: 'contato@seuceritificadodigitalmei.online',
        }),
      };
    });
  }, [vars]);

  const current = items.find((i) => i.id === selected) ?? items[0];
  const average = useMemo(
    () => Number((items.reduce((s, i) => s + i.report.score, 0) / items.length).toFixed(1)),
    [items],
  );

  const handleSendTest = async () => {
    const to = testAddress.trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) {
      toast.error('Informe um endereço válido (ex.: o e-mail gerado pelo Mail-Tester).');
      return;
    }
    setSending(true);
    try {
      const res = await send({
        data: {
          recipient: to,
          subject: substitute(current.subject, vars),
          vars,
          design: current.design,
          testMode: true,
          testRecipient: to,
        },
      });
      if (res.sent) toast.success(`Enviado para ${to}. Confira o score no Mail-Tester.`);
      else toast.error(res.message || `Não enviado (${res.reason}).`);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar o teste.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Estimativa de conteúdo por modelo
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Esta nota analisa apenas o <strong>conteúdo</strong> (assunto, HTML e texto). Ela não mede
            SPF/DKIM/DMARC, blacklists, reputação do IP nem o cabeçalho List-Unsubscribe — por isso a
            nota real do Mail-Tester costuma ser <strong>mais baixa</strong>. Use o teste real abaixo
            para a nota oficial.
          </p>

        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="secondary">Média geral: {average}/10</Badge>
            <Badge variant="outline">{items.length} modelos analisados</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => {
              const v = verdictStyle[i.report.verdict];
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setSelected(i.id)}
                  className={`text-left rounded-lg border p-3 transition ${
                    i.id === selected ? 'border-primary ring-1 ring-primary bg-accent/40' : 'hover:bg-accent/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{i.name}</span>
                    <Badge className={v.className}>{i.report.score.toFixed(1)}</Badge>
                  </div>
                  <Progress value={i.report.score * 10} className="mt-2 h-1.5" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {i.report.issues.length === 0
                      ? 'Nenhum problema detectado.'
                      : `${i.report.issues.length} ponto(s) de atenção · ${v.label}`}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Diagnóstico: {current.name}</CardTitle>
          <p className="text-sm">
            <span className="text-muted-foreground">Assunto: </span>
            <span className="font-medium">{substitute(current.subject, vars)}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Stat label="Nota" value={`${current.report.score.toFixed(1)}/10`} />
            <Stat label="Texto/HTML" value={`${current.report.stats.textToHtmlRatio}%`} />
            <Stat label="Links" value={String(current.report.stats.linkCount)} />
            <Stat label="Maiúsculas" value={`${current.report.stats.capsRatio}%`} />
          </div>

          <div className="rounded-md border divide-y">
            {current.report.rules.map((r) => (
              <div key={r.id} className="flex items-start gap-3 p-3">
                {r.penalty === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : r.severity === 'critico' ? (
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground break-words">{r.detail}</p>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                  {r.penalty === 0 ? '0' : `−${r.penalty.toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" /> Teste real no Mail-Tester
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Abra mail-tester.com, copie o endereço gerado e cole abaixo. O e-mail sai pelo mesmo
            caminho de envio das campanhas — depois volte ao site para ver a nota completa (SPF,
            DKIM, DMARC e SpamAssassin).
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            value={testAddress}
            onChange={(e) => setTestAddress(e.target.value)}
            placeholder="ex.: teste-abc123@srv1.mail-tester.com"
            className="max-w-sm"
          />
          <Button onClick={handleSendTest} disabled={sending} size="sm">
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar “{current.name}”
          </Button>
          <a
            href="https://www.mail-tester.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Abrir Mail-Tester
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
