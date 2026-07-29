import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Search, Copy, RefreshCw, MessageCircle, Phone, Calendar as CalendarIcon, ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { formatCNPJ } from '@/lib/format';
import { buildPublicUrl } from '@/lib/public-base-url';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/painel/mensagem-zap')({
  head: () => ({ meta: [{ title: 'Mensagem para Zap | Painel' }] }),
  component: MensagemZapPage,
});

type DatePreset = 'all' | 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'custom';
type Stage = 'all' | 'visited' | 'checkout' | 'guia' | 'pending_pix' | 'paid';

const DEFAULT_TEMPLATE = `⚠️ *AVISO – CERTIFICADO DIGITAL PENDENTE*

Olá, *{{empresa}}*.

Identificamos que a solicitação do Certificado Digital vinculada ao CNPJ *{{cnpj}}* foi iniciada, porém o pagamento ainda consta como *pendente*.

O Certificado Digital é utilizado em diversos procedimentos empresariais, como assinatura eletrônica de documentos, acesso a sistemas e portais, emissão de documentos fiscais em determinadas situações e outras operações que exigem identificação digital da empresa.

A ausência de um certificado válido pode impedir ou atrasar procedimentos que dependam dessa autenticação, conforme a atividade e as obrigações da empresa.

*Valor: R$ 97,00 / Validade de 12 Meses*

Após a confirmação do pagamento, a ativação é feita automaticamente, direto pelo portal, em poucos minutos, 100% seguro.

*Verificar Situação:*
{{link}}

*Esta é uma comunicação comercial referente à solicitação iniciada, que se encontra aberta e pendente no sistema.*`;

const LS_TEMPLATE = 'painel:mensagem-zap:template';

function isoStart(d: Date) { const nd = new Date(d); nd.setHours(0,0,0,0); return nd.toISOString(); }
function isoEnd(d: Date) { const nd = new Date(d); nd.setHours(23,59,59,999); return nd.toISOString(); }

function rangeFromPreset(preset: DatePreset, from: string, to: string): { gte?: string; lte?: string } {
  const now = new Date();
  if (preset === 'today') return { gte: isoStart(now), lte: isoEnd(now) };
  if (preset === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { gte: isoStart(y), lte: isoEnd(y) };
  }
  if (preset === '7d' || preset === '15d' || preset === '30d') {
    const days = preset === '7d' ? 7 : preset === '15d' ? 15 : 30;
    const start = new Date(now); start.setDate(start.getDate() - (days - 1));
    return { gte: isoStart(start), lte: isoEnd(now) };
  }
  if (preset === 'custom') {
    return {
      gte: from ? isoStart(new Date(from + 'T00:00:00')) : undefined,
      lte: to ? isoEnd(new Date(to + 'T00:00:00')) : undefined,
    };
  }
  return {};
}

function extractPhone(company: any): string | null {
  if (!company) return null;
  const arr = Array.isArray(company.telefones) ? company.telefones : [];
  const first = arr[0]?.numero;
  if (first) return String(first).replace(/\D/g, '');
  if (company.ddd) return String(company.ddd).replace(/\D/g, '');
  return null;
}

function formatPhoneBR(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return d;
}

function buildWhatsAppUrl(phoneDigits: string, message: string): string {
  const digits = phoneDigits.replace(/\D/g, '');
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function renderTemplate(tpl: string, ctx: { empresa: string; cnpj: string; link: string }): string {
  return tpl
    .replaceAll('{{empresa}}', ctx.empresa)
    .replaceAll('{{cnpj}}', ctx.cnpj)
    .replaceAll('{{link}}', ctx.link);
}

function MensagemZapPage() {
  const [template, setTemplate] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_TEMPLATE;
    return window.localStorage.getItem(LS_TEMPLATE) || DEFAULT_TEMPLATE;
  });
  const [preset, setPreset] = useState<DatePreset>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stage, setStage] = useState<Stage>('all');
  const [search, setSearch] = useState('');
  const [onlyWithPhone, setOnlyWithPhone] = useState(true);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [statsByToken, setStatsByToken] = useState<Record<string, { view_link: number; view_checkout: number; click_guia: number; click_certificado: number }>>({});
  const [paidByLinkId, setPaidByLinkId] = useState<Set<string>>(new Set());
  const [pendingPixByLinkId, setPendingPixByLinkId] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { window.localStorage.setItem(LS_TEMPLATE, template); } catch { /* quota */ }
  }, [template]);

  const range = useMemo(() => rangeFromPreset(preset, from, to), [preset, from, to]);

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('company_links')
        .select('id,public_token,active,created_at,companies(id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia,ddd,telefones,possui_telefone)')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (range.gte) q = q.gte('created_at', range.gte);
      if (range.lte) q = q.lte('created_at', range.lte);
      const { data, error } = await q;
      if (error) throw error;
      let list = (data ?? []) as any[];

      const tokens = list.map((r) => r.public_token).filter(Boolean);
      const per: Record<string, { view_link: number; view_checkout: number; click_guia: number; click_certificado: number }> = {};
      if (tokens.length) {
        const chunks: string[][] = [];
        for (let i = 0; i < tokens.length; i += 200) chunks.push(tokens.slice(i, i + 200));
        for (const tc of chunks) {
          let offset = 0; const size = 1000;
          while (offset <= 20000) {
            let eq = supabase.from('link_events').select('token,event_type').in('token', tc).range(offset, offset + size - 1);
            if (range.gte) eq = eq.gte('created_at', range.gte);
            if (range.lte) eq = eq.lte('created_at', range.lte);
            const { data: events } = await eq;
            const rr = (events ?? []) as any[];
            for (const e of rr) {
              const t = e.token as string;
              if (!per[t]) per[t] = { view_link: 0, view_checkout: 0, click_guia: 0, click_certificado: 0 };
              const s = per[t];
              if (e.event_type === 'view_link') s.view_link += 1;
              else if (e.event_type === 'view_checkout') s.view_checkout += 1;
              else if (e.event_type === 'click_guia') s.click_guia += 1;
              else if (e.event_type === 'click_certificado') s.click_certificado += 1;
            }
            if (rr.length < size) break;
            offset += size;
          }
        }
      }

      // Orders: paid + pending pix (com pix gerado)
      const linkIds = list.map((r) => r.id);
      const paidSet = new Set<string>();
      const pendingSet = new Set<string>();
      if (linkIds.length) {
        const chunks: string[][] = [];
        for (let i = 0; i < linkIds.length; i += 200) chunks.push(linkIds.slice(i, i + 200));
        for (const c of chunks) {
          const { data: orders } = await supabase
            .from('orders')
            .select('public_link_id,status,pix_code')
            .in('public_link_id', c);
          for (const o of (orders ?? []) as any[]) {
            if (!o.public_link_id) continue;
            if (o.status === 'paid') paidSet.add(o.public_link_id);
            else if (o.pix_code && (o.status === 'pending' || o.status === 'awaiting_payment')) {
              pendingSet.add(o.public_link_id);
            }
          }
        }
      }

      // Filtros de stage
      if (stage !== 'all') {
        list = list.filter((r) => {
          const s = per[r.public_token] ?? { view_link: 0, view_checkout: 0, click_guia: 0, click_certificado: 0 };
          if (stage === 'visited') return s.view_link > 0;
          if (stage === 'checkout') return s.view_checkout > 0;
          if (stage === 'guia') return s.click_guia > 0;
          if (stage === 'paid') return paidSet.has(r.id);
          if (stage === 'pending_pix') return pendingSet.has(r.id) && !paidSet.has(r.id);
          return true;
        });
      }

      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const digits = s.replace(/\D/g, '');
        list = list.filter((r) => {
          const c = r.companies;
          if (!c) return false;
          if (digits && c.cnpj?.includes(digits)) return true;
          const name = ((c.nome_titular_exibicao || c.razao_social_original || c.nome_fantasia) ?? '').toLowerCase();
          return name.includes(s);
        });
      }

      if (onlyWithPhone) list = list.filter((r) => !!extractPhone(r.companies));

      setRows(list);
      setStatsByToken(per);
      setPaidByLinkId(paidSet);
      setPendingPixByLinkId(pendingSet);
    } catch (e: any) {
      toast.error('Erro ao carregar: ' + (e?.message ?? 'desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [preset, from, to, stage, onlyWithPhone]);

  const preview = useMemo(() => renderTemplate(template, {
    empresa: 'Padaria Exemplo LTDA',
    cnpj: '12.345.678/0001-90',
    link: buildPublicUrl('token-exemplo'),
  }), [template]);

  const copyMessage = async (row: any) => {
    const c = row.companies;
    const empresa = (c?.nome_titular_exibicao || c?.razao_social_original || c?.nome_fantasia || '').trim() || 'sua empresa';
    const cnpj = formatCNPJ(c?.cnpj);
    const link = buildPublicUrl(row.public_token);
    const msg = renderTemplate(template, { empresa, cnpj, link });
    try {
      await navigator.clipboard.writeText(msg);
      toast.success('Mensagem copiada!');
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  const copyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success('Telefone copiado');
    } catch { toast.error('Falha ao copiar'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <MessageCircle className="h-7 w-7 text-green-600" /> Mensagem para Zap
          </h1>
          <p className="text-sm text-slate-600">Copie mensagens prontas para enviar por WhatsApp — filtre por etapa do funil e período.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modelo da mensagem</CardTitle>
          <CardDescription>
            Use as variáveis <code className="px-1 rounded bg-slate-100">{'{{empresa}}'}</code>,{' '}
            <code className="px-1 rounded bg-slate-100">{'{{cnpj}}'}</code> e{' '}
            <code className="px-1 rounded bg-slate-100">{'{{link}}'}</code>. Salvo automaticamente neste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Template</Label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setTemplate(DEFAULT_TEMPLATE)}>Restaurar padrão</Button>
            </div>
          </div>
          <div>
            <Label>Prévia</Label>
            <div className="whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-sm text-slate-800 min-h-[220px]">
              {preview}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600 mr-2">
              <CalendarIcon className="h-4 w-4" /> Período:
            </div>
            {([
              ['today', 'Hoje'], ['yesterday', 'Ontem'], ['7d', '7 dias'],
              ['15d', '15 dias'], ['30d', '30 dias'], ['all', 'Tudo'], ['custom', 'Personalizado'],
            ] as [DatePreset, string][]).map(([key, label]) => (
              <Button key={key} size="sm" variant={preset === key ? 'default' : 'outline'} onClick={() => setPreset(key)}>
                {label}
              </Button>
            ))}
            {preset === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 ml-2">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" />
                <span className="text-slate-400 text-sm">até</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label>Etapa</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                <SelectItem value="visited">Visitaram o link</SelectItem>
                <SelectItem value="checkout">Foram ao checkout</SelectItem>
                <SelectItem value="guia">Clicaram em "Gerar Guia"</SelectItem>
                <SelectItem value="pending_pix">PIX gerado (pendente)</SelectItem>
                <SelectItem value="paid">Pagaram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Buscar (CNPJ ou empresa)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void load()} placeholder="Digite e pressione Enter" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id="onlyphone" type="checkbox" checked={onlyWithPhone} onChange={(e) => setOnlyWithPhone(e.target.checked)} />
            <Label htmlFor="onlyphone" className="cursor-pointer">Apenas empresas com telefone</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {rows.length} empresa{rows.length === 1 ? '' : 's'} encontrada{rows.length === 1 ? '' : 's'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa / CNPJ</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">Carregando…</TableCell></TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">Nenhuma empresa neste filtro.</TableCell></TableRow>
                )}
                {rows.map((r) => {
                  const c = r.companies;
                  const empresa = (c?.nome_titular_exibicao || c?.razao_social_original || c?.nome_fantasia || '—').replace(/^\d+[.\-/\s]*/, '').trim();
                  const phone = extractPhone(c);
                  const s = statsByToken[r.public_token] ?? { view_link: 0, view_checkout: 0, click_guia: 0, click_certificado: 0 };
                  const isPaid = paidByLinkId.has(r.id);
                  const isPending = pendingPixByLinkId.has(r.id) && !isPaid;
                  const link = buildPublicUrl(r.public_token);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{empresa}</div>
                        <div className="text-xs text-slate-500 font-mono">{formatCNPJ(c?.cnpj)}</div>
                      </TableCell>
                      <TableCell>
                        {phone ? (
                          <a
                            href={buildWhatsAppUrl(phone, renderTemplate(template, {
                              empresa: empresa || 'sua empresa',
                              cnpj: formatCNPJ(c?.cnpj),
                              link,
                            }))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium"
                            title="Abrir WhatsApp com mensagem pronta"
                            onClick={(e) => { e.stopPropagation(); void copyPhone(phone); }}
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> {formatPhoneBR(phone)}
                          </a>
                        ) : <span className="text-xs text-slate-400">sem telefone</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {isPaid && <Badge className="bg-green-600 hover:bg-green-600">Pago</Badge>}
                          {isPending && <Badge className="bg-amber-500 hover:bg-amber-500">PIX pendente</Badge>}
                          {s.click_guia > 0 && <Badge variant="outline">Gerou guia</Badge>}
                          {s.view_checkout > 0 && <Badge variant="outline">Checkout</Badge>}
                          {s.view_link > 0 && <Badge variant="outline">Visitou</Badge>}
                          {!isPaid && !isPending && s.view_link === 0 && <span className="text-xs text-slate-400">sem interação</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => copyMessage(r)}>
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar msg
                          </Button>
                          {phone && (
                            <a href={buildWhatsAppUrl(phone, renderTemplate(template, {
                              empresa: empresa || 'sua empresa',
                              cnpj: formatCNPJ(c?.cnpj),
                              link,
                            }))} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                                <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                              </Button>
                            </a>
                          )}
                          <a href={link} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
