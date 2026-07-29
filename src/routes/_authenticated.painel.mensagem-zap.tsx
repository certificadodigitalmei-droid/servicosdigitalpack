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
import { formatCNPJ, cleanCompanyName } from '@/lib/format';
import { buildPublicUrl } from '@/lib/public-base-url';
import { toast } from 'sonner';
import { WhatsAppAutomationPanel } from '@/components/painel/WhatsAppAutomationPanel';

export const Route = createFileRoute('/_authenticated/painel/mensagem-zap')({
  head: () => ({ meta: [{ title: 'Mensagem para Zap | Painel' }] }),
  component: MensagemZapPage,
});

type DatePreset = 'all' | 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'custom';
type Stage = 'all' | 'visited' | 'checkout' | 'guia' | 'pending_pix' | 'paid';
type ContactedFilter = 'all' | 'pending' | 'contacted';

const DEFAULT_TEMPLATE = `\u26A0\uFE0F *AVISO – CERTIFICADO DIGITAL PENDENTE*

Olá, *{{empresa}}*.

Identificamos que a solicitação do Certificado Digital vinculada ao CNPJ *{{cnpj}}* foi iniciada, porém o pagamento ainda consta como *pendente*.

O Certificado Digital é utilizado em diversos procedimentos empresariais, como assinatura eletrônica de documentos, acesso a sistemas e portais, emissão de documentos fiscais em determinadas situações e outras operações que exigem identificação digital da empresa.

A ausência de um certificado válido pode impedir ou atrasar procedimentos que dependam dessa autenticação, conforme a atividade e as obrigações da empresa.

*Valor: R$ 97,00 / Validade de 12 Meses*

Após a confirmação do pagamento, a ativação é feita automaticamente, direto pelo portal, em poucos minutos, 100% seguro.

*Verificar Situação:*
{{link}}

*Esta é uma comunicação comercial referente à solicitação iniciada, que se encontra aberta e pendente no sistema.*`;

const FORMAL_TEMPLATES: TemplateItem[] = [
  {
    id: 'formal-1',
    name: 'Formal – Aviso de pendência',
    enabled: true,
    body: `Olá, *{{empresa}}*.

Identificamos que o CNPJ *{{cnpj}}* está com a ativação do Certificado Digital pendente.

O Certificado Digital é um documento essencial para a identificação eletrônica da sua empresa em portais governamentais, sistemas fiscais e em operações que exigem assinatura digital.

*Riscos de não ativar:*
- Impossibilidade de acessar serviços que exigem certificado digital;
- Atraso em obrigações fiscais e acessórias;
- Risco de multas, bloqueios ou suspensão de atividades que dependam de assinatura eletrônica.

Regularize agora através do link abaixo:
{{link}}

Att.,
Central de Ativação`,
  },
  {
    id: 'formal-2',
    name: 'Formal – Riscos e prazos',
    enabled: true,
    body: `*{{empresa}}* — Atenção: CNPJ *{{cnpj}}* pendente de ativação do Certificado Digital.

O não ativamento pode comprometer o acesso a sistemas oficiais, a assinatura de documentos digitais e o cumprimento de obrigações junto a órgãos públicos.

*Principais riscos:*
- Perda de prazos fiscais e tributários;
- Impossibilidade de assinar contratos e documentos eletronicamente;
- Restrições em portais governamentais e bancários.

Evite transtornos. Acesse o link e finalize a ativação:
{{link}}

Estamos à disposição.`,
  },
  {
    id: 'formal-3',
    name: 'Formal – Regularização necessária',
    enabled: true,
    body: `Prezado(a) responsável pela *{{empresa}}* (CNPJ *{{cnpj}}*).

Informamos que a ativação do Certificado Digital de sua empresa ainda não foi concluída e permanece pendente em nosso sistema.

Sem o certificado ativo, sua empresa pode enfrentar dificuldades em:
- Acessar o e-CAC, Simples Nacional e outros portais federais;
- Emitir notas fiscais e guias em sistemas que exigem identificação digital;
- Assinar documentos eletrônicos com validade jurídica.

*Não deixe para depois.* A inatividade pode gerar complicações legais e operacionais.

Finalize pelo link:
{{link}}

Atenciosamente.`,
  },
  {
    id: 'formal-4',
    name: 'Formal – Comunicação oficial',
    enabled: true,
    body: `Olá, *{{empresa}}*.

Constatamos que o CNPJ *{{cnpj}}* possui uma solicitação de Certificado Digital em aberto, aguardando ativação.

O Certificado Digital garante segurança e validade jurídica nos processos digitais da sua empresa. Deixar essa pendência acumulada pode resultar em:
- Bloqueios de acesso em sistemas oficiais;
- Atraso em declarações e obrigações;
- Impossibilidade de realizar operações que exijam identificação digital.

Resolva de forma simples e segura pelo link:
{{link}}

Qualquer dúvida, estamos à disposição.`,
  },
];

const LS_TEMPLATE = 'painel:mensagem-zap:template'; // legado (string única)
const LS_TEMPLATES = 'painel:mensagem-zap:templates'; // novo: lista de variações
const LS_CLICKED = 'painel:mensagem-zap:clicked';

type TemplateItem = { id: string; name: string; body: string; enabled: boolean };

function makeTplId() { return Math.random().toString(36).slice(2, 10); }

function loadTemplates(): TemplateItem[] {
  if (typeof window === 'undefined') return [{ id: 'default', name: 'Padrão', body: DEFAULT_TEMPLATE, enabled: true }];
  try {
    const raw = window.localStorage.getItem(LS_TEMPLATES);
    if (raw) {
      const arr = JSON.parse(raw) as TemplateItem[];
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((t) => ({ ...t, body: normalizeEmoji(t.body) }));
      }
    }
    // migração do template único
    const legacy = window.localStorage.getItem(LS_TEMPLATE);
    if (legacy) return [{ id: 'default', name: 'Padrão', body: normalizeEmoji(legacy), enabled: true }];
  } catch { /* noop */ }
  return [{ id: 'default', name: 'Padrão', body: DEFAULT_TEMPLATE, enabled: true }];
}
function saveTemplates(list: TemplateItem[]) {
  try { window.localStorage.setItem(LS_TEMPLATES, JSON.stringify(list)); } catch { /* quota */ }
}

function pickRandomTemplate(list: TemplateItem[]): TemplateItem {
  const enabled = list.filter((t) => t.enabled && t.body.trim().length > 0);
  const pool = enabled.length > 0 ? enabled : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function normalizeEmoji(text: string): string {
  // garante variante emoji para o sinal de aviso, evitando � no WhatsApp
  return text.replace(/\u26A0\uFE0E/g, '\u26A0\uFE0F').replace(/\u26A0(?!\uFE0F)/g, '\u26A0\uFE0F');
}

function loadClicked(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(LS_CLICKED) || '{}'); } catch { return {}; }
}
function saveClicked(map: Record<string, number>) {
  try { window.localStorage.setItem(LS_CLICKED, JSON.stringify(map)); } catch { /* quota */ }
}

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
  return normalizeEmoji(
    tpl
      .replaceAll('{{empresa}}', ctx.empresa)
      .replaceAll('{{cnpj}}', ctx.cnpj)
      .replaceAll('{{link}}', ctx.link)
  );
}

function MensagemZapPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>(() => loadTemplates());
  const [activeTplId, setActiveTplId] = useState<string>(() => {
    const list = typeof window === 'undefined' ? [] : loadTemplates();
    return list[0]?.id ?? 'default';
  });
  const activeTpl = templates.find((t) => t.id === activeTplId) ?? templates[0];
  const [preset, setPreset] = useState<DatePreset>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stage, setStage] = useState<Stage>('all');
  const [search, setSearch] = useState('');
  const [onlyWithPhone, setOnlyWithPhone] = useState(true);
  const [contactedFilter, setContactedFilter] = useState<ContactedFilter>('all');
  const [clickedMap, setClickedMap] = useState<Record<string, number>>(() => loadClicked());

  const markClicked = (id: string) => {
    setClickedMap((prev) => {
      const next = { ...prev, [id]: Date.now() };
      saveClicked(next);
      return next;
    });
  };
  const unmarkClicked = (id: string) => {
    setClickedMap((prev) => {
      const next = { ...prev }; delete next[id];
      saveClicked(next);
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [statsByToken, setStatsByToken] = useState<Record<string, { view_link: number; view_checkout: number; click_guia: number; click_certificado: number }>>({});
  const [paidByLinkId, setPaidByLinkId] = useState<Set<string>>(new Set());
  const [pendingPixByLinkId, setPendingPixByLinkId] = useState<Set<string>>(new Set());

  useEffect(() => { saveTemplates(templates); }, [templates]);

  const updateActive = (patch: Partial<TemplateItem>) => {
    setTemplates((prev) => prev.map((t) => t.id === activeTplId ? { ...t, ...patch, body: patch.body != null ? normalizeEmoji(patch.body) : t.body } : t));
  };
  const addTemplate = () => {
    const id = makeTplId();
    setTemplates((prev) => [...prev, { id, name: `Variação ${prev.length + 1}`, body: activeTpl?.body ?? DEFAULT_TEMPLATE, enabled: true }]);
    setActiveTplId(id);
  };
  const duplicateActive = () => {
    if (!activeTpl) return;
    const id = makeTplId();
    setTemplates((prev) => [...prev, { id, name: activeTpl.name + ' (cópia)', body: activeTpl.body, enabled: activeTpl.enabled }]);
    setActiveTplId(id);
  };
  const removeActive = () => {
    if (templates.length <= 1) { toast.error('Mantenha pelo menos uma variação'); return; }
    if (!confirm(`Remover "${activeTpl?.name}"?`)) return;
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== activeTplId);
      setActiveTplId(next[0]?.id ?? 'default');
      return next;
    });
  };
  const loadFormalTemplates = () => {
    if (!confirm('Isso vai substituir todas as variações atuais por 4 modelos formais de pendência de ativação. Deseja continuar?')) return;
    const fresh = FORMAL_TEMPLATES.map((t) => ({ ...t, id: makeTplId() }));
    setTemplates(fresh);
    setActiveTplId(fresh[0].id);
    toast.success('Modelos formais carregados');
  };

  const range = useMemo(() => rangeFromPreset(preset, from, to), [preset, from, to]);

  const load = async () => {
    setLoading(true);
    try {
      // Para os estágios "paid" e "pending_pix", filtramos pelos orders (pela data do pagamento/PIX)
      // em vez da data de criação do link, já que o link pode ter sido criado em outro dia.
      let onlyLinkIds: string[] | null = null;
      if (stage === 'paid' || stage === 'pending_pix') {
        let oq = supabase
          .from('orders')
          .select('public_link_id,status,pix_code,paid_at,created_at')
          .not('public_link_id', 'is', null)
          .limit(5000);
        if (stage === 'paid') {
          oq = oq.eq('status', 'paid');
          if (range.gte) oq = oq.gte('paid_at', range.gte);
          if (range.lte) oq = oq.lte('paid_at', range.lte);
        } else {
          oq = oq.in('status', ['pending', 'awaiting_payment']).not('pix_code', 'is', null);
          if (range.gte) oq = oq.gte('created_at', range.gte);
          if (range.lte) oq = oq.lte('created_at', range.lte);
        }
        const { data: ords, error: oerr } = await oq;
        if (oerr) throw oerr;
        onlyLinkIds = Array.from(new Set(((ords ?? []) as any[]).map((o) => o.public_link_id).filter(Boolean)));
        if (onlyLinkIds.length === 0) {
          setRows([]); setStatsByToken({}); setPaidByLinkId(new Set()); setPendingPixByLinkId(new Set());
          return;
        }
      }

      let q = supabase
        .from('company_links')
        .select('id,public_token,active,created_at,companies(id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia,ddd,telefones,possui_telefone)')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (onlyLinkIds) {
        q = q.in('id', onlyLinkIds);
      } else {
        if (range.gte) q = q.gte('created_at', range.gte);
        if (range.lte) q = q.lte('created_at', range.lte);
      }
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

      // Filtros de stage — em qualquer filtro que NÃO seja "paid",
      // excluímos empresas que já pagaram (não faz sentido reenviar msg).
      list = list.filter((r) => {
        const s = per[r.public_token] ?? { view_link: 0, view_checkout: 0, click_guia: 0, click_certificado: 0 };
        if (stage !== 'paid' && paidSet.has(r.id)) return false;
        if (stage === 'all') return true;
        if (stage === 'visited') return s.view_link > 0;
        if (stage === 'checkout') return s.view_checkout > 0;
        if (stage === 'guia') return s.click_guia > 0;
        if (stage === 'paid') return paidSet.has(r.id);
        if (stage === 'pending_pix') return pendingSet.has(r.id) && !paidSet.has(r.id);
        return true;
      });

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

  const visibleRows = useMemo(() => {
    if (contactedFilter === 'all') return rows;
    return rows.filter((r) => contactedFilter === 'contacted' ? !!clickedMap[r.id] : !clickedMap[r.id]);
  }, [rows, contactedFilter, clickedMap]);

  const contactedCount = useMemo(() => rows.filter((r) => !!clickedMap[r.id]).length, [rows, clickedMap]);

  const automationSelection = useMemo(() => {
    const items: { phone: string; message: string; company_name?: string | null; cnpj?: string | null; company_link_id?: string | null }[] = [];
    for (const r of visibleRows) {
      const c = r.companies;
      const phone = extractPhone(c);
      if (!phone) continue;
      const empresa = cleanCompanyName(c?.nome_titular_exibicao || c?.razao_social_original || c?.nome_fantasia) || 'sua empresa';
      const cnpj = formatCNPJ(c?.cnpj);
      const link = buildPublicUrl(r.public_token);
      const tpl = pickRandomTemplate(templates); // rotação aleatória por destinatário
      items.push({
        phone,
        message: renderTemplate(tpl.body, { empresa, cnpj, link }),
        company_name: empresa,
        cnpj: c?.cnpj ?? null,
        company_link_id: r.id,
      });
    }
    return items;
  }, [visibleRows, templates]);

  const preview = useMemo(() => renderTemplate(activeTpl?.body ?? DEFAULT_TEMPLATE, {
    empresa: 'Padaria Exemplo LTDA',
    cnpj: '12.345.678/0001-90',
    link: buildPublicUrl('token-exemplo'),
  }), [activeTpl]);

  const copyMessage = async (row: any) => {
    const c = row.companies;
    const empresa = cleanCompanyName(c?.nome_titular_exibicao || c?.razao_social_original || c?.nome_fantasia) || 'sua empresa';
    const cnpj = formatCNPJ(c?.cnpj);
    const link = buildPublicUrl(row.public_token);
    // usa o template atualmente aberto na aba (mais previsível para copiar manual)
    const msg = renderTemplate(activeTpl?.body ?? DEFAULT_TEMPLATE, { empresa, cnpj, link });
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
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>Modelos da mensagem ({templates.filter((t) => t.enabled).length} ativo{templates.filter((t) => t.enabled).length === 1 ? '' : 's'} de {templates.length})</span>
          <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={addTemplate}>+ Nova variação</Button>
              <Button size="sm" variant="outline" onClick={loadFormalTemplates}>Carregar modelos formais</Button>
              <Button size="sm" variant="ghost" onClick={duplicateActive}>Duplicar</Button>
              <Button size="sm" variant="ghost" className="text-red-600" onClick={removeActive}>Excluir</Button>
            </div>
          </CardTitle>
          <CardDescription>
            Crie várias variações — o envio automático usa uma <b>aleatoriamente</b> para cada contato, evitando padrão repetido. Variáveis:{' '}
            <code className="px-1 rounded bg-slate-100">{'{{empresa}}'}</code>,{' '}
            <code className="px-1 rounded bg-slate-100">{'{{cnpj}}'}</code>,{' '}
            <code className="px-1 rounded bg-slate-100">{'{{link}}'}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 border-b pb-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTplId(t.id)}
                className={`px-3 py-1.5 rounded-md text-sm border transition ${activeTplId === t.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 hover:bg-slate-50'} ${!t.enabled ? 'opacity-50 line-through' : ''}`}
                title={t.enabled ? 'Ativa no sorteio' : 'Desativada (não é sorteada)'}
              >
                {t.name}
              </button>
            ))}
          </div>
          {activeTpl && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="grid gap-2 md:grid-cols-[1fr_auto] items-end">
                  <div>
                    <Label>Nome da variação</Label>
                    <Input value={activeTpl.name} onChange={(e) => updateActive({ name: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                    <input type="checkbox" checked={activeTpl.enabled} onChange={(e) => updateActive({ enabled: e.target.checked })} />
                    Ativa no sorteio
                  </label>
                </div>
                <Label>Texto</Label>
                <Textarea
                  value={activeTpl.body}
                  onChange={(e) => updateActive({ body: e.target.value })}
                  rows={12}
                  className="font-mono text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateActive({ body: DEFAULT_TEMPLATE })}>Preencher com padrão</Button>
                </div>
              </div>
              <div>
                <Label>Prévia</Label>
                <div className="whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-sm text-slate-800 min-h-[280px]">
                  {preview}
                </div>
              </div>
            </div>
          )}
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
          <div>
            <Label>Status de contato</Label>
            <Select value={contactedFilter} onValueChange={(v) => setContactedFilter(v as ContactedFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Não enviados ainda</SelectItem>
                <SelectItem value="contacted">Já enviados no Zap</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <WhatsAppAutomationPanel selection={automationSelection} onEnqueued={() => { /* mantém marcação local */ }} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            {visibleRows.length} empresa{visibleRows.length === 1 ? '' : 's'} — {contactedCount} já contatada{contactedCount === 1 ? '' : 's'} no Zap
          </CardTitle>
          {contactedCount > 0 && (
            <Button size="sm" variant="ghost" onClick={() => { setClickedMap({}); saveClicked({}); toast.success('Marcações limpas'); }}>
              Limpar marcações
            </Button>
          )}
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
                {!loading && visibleRows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">Nenhuma empresa neste filtro.</TableCell></TableRow>
                )}
                {visibleRows.map((r) => {
                  const c = r.companies;
                  const rawName = (c?.nome_titular_exibicao || c?.razao_social_original || c?.nome_fantasia || '—');
                  const empresa = cleanCompanyName(rawName);
                  const phone = extractPhone(c);
                  const s = statsByToken[r.public_token] ?? { view_link: 0, view_checkout: 0, click_guia: 0, click_certificado: 0 };
                  const isPaid = paidByLinkId.has(r.id);
                  const isPending = pendingPixByLinkId.has(r.id) && !isPaid;
                  const link = buildPublicUrl(r.public_token);
                  const contactedAt = clickedMap[r.id];
                  const isContacted = !!contactedAt;
                  return (
                    <TableRow key={r.id} className={isContacted ? 'bg-green-50/50' : ''}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{empresa}</div>
                        <div className="text-xs text-slate-500 font-mono">{formatCNPJ(c?.cnpj)}</div>
                      </TableCell>
                      <TableCell>
                        {phone ? (
                          <a
                            href={buildWhatsAppUrl(phone, renderTemplate(activeTpl?.body ?? DEFAULT_TEMPLATE, {
                              empresa: empresa || 'sua empresa',
                              cnpj: formatCNPJ(c?.cnpj),
                              link,
                            }))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium"
                            title="Abrir WhatsApp com mensagem pronta"
                            onClick={(e) => { e.stopPropagation(); void copyPhone(phone); markClicked(r.id); }}
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> {formatPhoneBR(phone)}
                          </a>
                        ) : <span className="text-xs text-slate-400">sem telefone</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {isContacted && (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600" title={new Date(contactedAt).toLocaleString('pt-BR')}>
                              Já enviado
                            </Badge>
                          )}
                          {isPaid && <Badge className="bg-green-600 hover:bg-green-600">Pago</Badge>}
                          {isPending && <Badge className="bg-amber-500 hover:bg-amber-500">PIX pendente</Badge>}
                          {s.click_guia > 0 && <Badge variant="outline">Gerou guia</Badge>}
                          {s.view_checkout > 0 && <Badge variant="outline">Checkout</Badge>}
                          {s.view_link > 0 && <Badge variant="outline">Visitou</Badge>}
                          {!isPaid && !isPending && s.view_link === 0 && !isContacted && <span className="text-xs text-slate-400">sem interação</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => copyMessage(r)}>
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar msg
                          </Button>
                          {phone && (
                            <a
                              href={buildWhatsAppUrl(phone, renderTemplate(activeTpl?.body ?? DEFAULT_TEMPLATE, {
                                empresa: empresa || 'sua empresa',
                                cnpj: formatCNPJ(c?.cnpj),
                                link,
                              }))}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => markClicked(r.id)}
                            >
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                                <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                              </Button>
                            </a>
                          )}
                          {isContacted && (
                            <Button size="sm" variant="ghost" onClick={() => unmarkClicked(r.id)} title="Desmarcar como enviado">
                              Desmarcar
                            </Button>
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
