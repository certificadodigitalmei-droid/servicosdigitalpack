import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useServerFn } from '@tanstack/react-start';
// Envio automatizado (GemMail/Gmail/Hotmail/etc) removido.
// A tela agora é apenas geradora de e-mails prontos para exportação e uso
// em ferramenta externa de disparo em massa.

import {
  parseFile,
  autoMap,
  normalizeRows,
  analyzeRows,
  isValidEmail,
  genReference,
  FIELD_KEYS,
  type FieldKey,
  type NormalizedRow,
  type AnalysisStats,
} from '@/lib/email-campaign/parser';
import {
  DEFAULT_DESIGN,
  DEFAULT_SUBJECT,
  DEFAULT_PREHEADER,
  renderHtml,
  renderText,
  rowToVars,
  substitute,
  findMissingVars,
  formatCnpj,
  type CampaignDesign,
} from '@/lib/email-campaign/template';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileUp,
  Loader2,
  Plug,
  Search,
  Trash2,
  Ban,
  CheckCircle2,
  RefreshCw,
  Send,
  Zap,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export const Route = createFileRoute('/_authenticated/painel/campanhas-email')({
  component: CampanhasEmail,
});

type Recipient = {
  id?: string;
  email: string;
  company_name: string;
  cnpj: string;
  public_link: string;
  checkout_link: string;
  reference_code: string;
  status: 'ready' | 'invalid' | 'blocked' | 'pending';
  personalized_subject: string;
  row: NormalizedRow;
};

function CampanhasEmail() {
  const [step, setStep] = useState<'upload' | 'editor'>('upload');
  const [fileName, setFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>(
    {} as Record<FieldKey, string | null>,
  );
  const [normalized, setNormalized] = useState<NormalizedRow[]>([]);
  const [stats, setStats] = useState<AnalysisStats | null>(null);

  const [campaignName, setCampaignName] = useState('Campanha MEI');
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [preheader, setPreheader] = useState(DEFAULT_PREHEADER);
  const [fromName, setFromName] = useState('Central de Atendimento');
  const [fromEmail, setFromEmail] = useState('certificado.mei.estadual@seu-certificado-mei-digital.online');
  const [replyTo, setReplyTo] = useState('certificado.mei.estadual@seu-certificado-mei-digital.online');
  const [design, setDesign] = useState<CampaignDesign>(() => {
    if (typeof window === 'undefined') return DEFAULT_DESIGN;
    try {
      const saved = window.localStorage.getItem('campanha:design:v1');
      if (saved) return { ...DEFAULT_DESIGN, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_DESIGN;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('campanha:design:v1', JSON.stringify(design));
    } catch {}
  }, [design]);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);


  const [emailSettings, setEmailSettings] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<string>('pending');
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [companiesInfo, setCompaniesInfo] = useState<{ total: number; withEmail: number; withLink: number } | null>(null);
  const [companiesOnlyWithEmail, setCompaniesOnlyWithEmail] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);




  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase.from('email_settings').select('*').single();
    if (data) {
      setEmailSettings(data);
      setFromName(data.from_name || fromName);
      setFromEmail(data.from_email || fromEmail);
      setReplyTo(data.reply_to || replyTo);
    }
  };

  // ============ Auto-carregar destinatários das Empresas Importadas ============
  const loadFromCompanies = async () => {
    setLoadingCompanies(true);
    try {
      // Puxa todas as empresas importadas (paginado)
      const all: any[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('companies')
          .select('id, cnpj, razao_social_original, nome_titular_exibicao, nome_fantasia, email, inicio_atividade, situacao_cadastral_desc, situacao_cadastral_data, municipio_descricao, uf, telefones')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
      }

      if (!all.length) {
        toast.error('Nenhuma empresa importada encontrada.');
        setCompaniesInfo({ total: 0, withEmail: 0, withLink: 0 });
        return;
      }

      // Puxa todos os links dessas empresas
      const ids = all.map((c) => c.id);
      const linksById = new Map<string, any>();
      const LINK_CHUNK = 500;
      for (let i = 0; i < ids.length; i += LINK_CHUNK) {
        const slice = ids.slice(i, i + LINK_CHUNK);
        const { data: links, error } = await supabase
          .from('company_links')
          .select('company_id, public_token, public_url, checkout_url, token, active, created_at')
          .in('company_id', slice)
          .order('created_at', { ascending: false });
        if (error) throw error;
        for (const l of links || []) {
          if (!l.company_id) continue;
          // Mantém o mais recente (o primeiro pela ordenação desc)
          if (!linksById.has(l.company_id)) linksById.set(l.company_id, l);
        }
      }

      // Filtra e monta linhas no formato esperado pelo parser
      const source = companiesOnlyWithEmail
        ? all.filter((c) => c.email && isValidEmail(String(c.email)))
        : all;

      const totalCount = all.length;
      const withEmailCount = all.filter((c) => c.email && isValidEmail(String(c.email))).length;
      const withLinkCount = source.filter((c) => linksById.has(c.id)).length;
      setCompaniesInfo({ total: totalCount, withEmail: withEmailCount, withLink: withLinkCount });

      const fmtDate = (d: any) => {
        if (!d) return '';
        try {
          const dt = new Date(String(d));
          if (Number.isNaN(dt.getTime())) return String(d);
          return dt.toLocaleDateString('pt-BR');
        } catch { return String(d || ''); }
      };
      const firstPhone = (arr: any): string => {
        if (!Array.isArray(arr) || !arr.length) return '';
        const p = arr[0] || {};
        return (p.numero || p.telefone || p.ddd_numero || '') as string;
      };

      const rawRowsBuilt = source.map((c) => {
        const link = linksById.get(c.id);
        return {
          EMAIL: c.email || '',
          NOME_EMPRESARIAL: c.nome_fantasia || c.razao_social_original || c.nome_titular_exibicao || '',
          RAZAO_SOCIAL: c.razao_social_original || '',
          NOME_TITULAR: c.nome_titular_exibicao || c.razao_social_original || '',
          CNPJ: c.cnpj || '',
          DATA_ABERTURA: fmtDate(c.inicio_atividade),
          DATA_SITUACAO: fmtDate(c.situacao_cadastral_data),
          SITUACAO: c.situacao_cadastral_desc || '',
          MUNICIPIO: c.municipio_descricao || '',
          UF: c.uf || '',
          LINK_PUBLICO: link?.public_url || (link?.public_token ? `https://seu-certificado-mei-digital.online/c/${link.public_token}` : ''),
          LINK_CHECKOUT: link?.checkout_url || '',
          TOKEN: link?.public_token || link?.token || '',
          TELEFONE: firstPhone(c.telefones),
        } as Record<string, any>;
      });

      const headers = Object.keys(rawRowsBuilt[0] || {
        EMAIL: '', NOME_EMPRESARIAL: '', CNPJ: '', LINK_PUBLICO: '',
      });
      const m = autoMap(headers);
      const norm = normalizeRows(rawRowsBuilt, m);

      setFileName(`Empresas importadas (${rawRowsBuilt.length})`);
      setRawHeaders(headers);
      setRawRows(rawRowsBuilt);
      setMapping(m);
      setNormalized(norm);
      setStats(analyzeRows(norm));

      // Monta as campanhas de e-mail direto na memória (sem envio, sem provider).
      const { data: sup } = await supabase.from('suppression_list').select('email');
      const blocked = new Set((sup || []).map((s: any) => (s.email || '').toLowerCase()));

      const seen = new Set<string>();
      const recs: Recipient[] = [];
      norm.forEach((r, i) => {
        const email = (r.EMAIL || '').toLowerCase().trim();
        const validEmail = isValidEmail(email);
        const hasLink = !!r.LINK_PUBLICO;
        const isDup = email && seen.has(email);
        if (email) seen.add(email);
        let status: Recipient['status'] = 'ready';
        if (!validEmail || !hasLink) status = 'invalid';
        else if (blocked.has(email)) status = 'blocked';
        else if (isDup) return;
        const ref = genReference(i + 1);
        const vars = rowToVars(r, { name: fromName, company: campaignName, reference: ref });
        recs.push({
          id: `local-${i}-${Date.now()}`,
          email: r.EMAIL,
          company_name: r.NOME_EMPRESARIAL || r.RAZAO_SOCIAL,
          cnpj: r.CNPJ,
          public_link: r.LINK_PUBLICO,
          checkout_link: r.LINK_CHECKOUT,
          reference_code: ref,
          status,
          personalized_subject: substitute(subject, vars),
          row: r,
        });
      });
      setRecipients(recs);
      setCampaignId(null);
      setStep('editor');
      setSelectedIdx(0);

      const validCount = recs.filter((r) => r.status === 'ready').length;
      toast.success(
        `Campanha montada: ${recs.length} destinatários (${validCount} prontos). Veja a prévia ao lado.`,
      );
    } catch (e: any) {
      toast.error('Erro ao carregar empresas: ' + (e.message || String(e)));
    } finally {
      setLoadingCompanies(false);
    }
  };


  // Envio automático removido — a exportação (CSV/XLSX/HTML) alimenta uma ferramenta externa.


  const updateSettings = async (updates: any) => {
    if (!emailSettings?.id) return;
    const { error } = await supabase.from('email_settings').update(updates).eq('id', emailSettings.id);
    if (error) toast.error(error.message);
    else {
      setEmailSettings({ ...emailSettings, ...updates });
      toast.success('Configurações salvas');
    }
  };

  // ================= Upload =================
  const handleFile = async (f: File) => {
    try {
      setFileName(f.name);
      const parsed = await parseFile(f);
      const m = autoMap(parsed.headers);
      const norm = normalizeRows(parsed.rows, m);
      setRawHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(m);
      setNormalized(norm);
      setStats(analyzeRows(norm));
      toast.success(`Arquivo lido: ${parsed.rows.length} linhas`);
    } catch (e: any) {
      toast.error('Erro ao ler arquivo: ' + e.message);
    }
  };

  const remap = (key: FieldKey, col: string | null) => {
    const m = { ...mapping, [key]: col };
    setMapping(m);
    const norm = normalizeRows(rawRows, m);
    setNormalized(norm);
    setStats(analyzeRows(norm));
  };

  // ================= Importar =================
  const importCampaign = async () => {
    if (!normalized.length) return toast.error('Nenhuma linha para importar');
    setImporting(true);
    try {
      const { data: sup } = await supabase.from('suppression_list').select('email');
      const blocked = new Set((sup || []).map((s: any) => (s.email || '').toLowerCase()));

      const { data: cam, error: ce } = await supabase
        .from('email_campaigns')
        .insert({
          name: campaignName,
          subject_template: subject,
          preheader_template: preheader,
          html_template: JSON.stringify(design),
          text_template: '',
          from_name: fromName,
          from_email: fromEmail,
          reply_to: replyTo,
          source_file_name: fileName,
          total_rows: normalized.length,
          status: 'draft',
        })
        .select()
        .single();
      if (ce || !cam) throw ce || new Error('Falha ao criar campanha');

      const seen = new Set<string>();
      const recs: Recipient[] = [];
      normalized.forEach((r, i) => {
        const email = (r.EMAIL || '').toLowerCase().trim();
        const validEmail = isValidEmail(email);
        const hasLink = !!r.LINK_PUBLICO;
        const isDup = email && seen.has(email);
        if (email) seen.add(email);
        let status: Recipient['status'] = 'ready';
        if (!validEmail || !hasLink) status = 'invalid';
        else if (blocked.has(email)) status = 'blocked';
        else if (isDup) return; // pula duplicados
        const ref = genReference(i + 1);
        const vars = rowToVars(r, { name: fromName, company: campaignName, reference: ref });
        recs.push({
          email: r.EMAIL,
          company_name: r.NOME_EMPRESARIAL || r.RAZAO_SOCIAL,
          cnpj: r.CNPJ,
          public_link: r.LINK_PUBLICO,
          checkout_link: r.LINK_CHECKOUT,
          reference_code: ref,
          status,
          personalized_subject: substitute(subject, vars),
          row: r,
        });
      });

      const payload = recs.map((r) => ({
        campaign_id: cam.id,
        email: r.email,
        company_name: r.company_name,
        razao_social: r.row.RAZAO_SOCIAL,
        nome_titular: r.row.NOME_TITULAR,
        cnpj: r.cnpj,
        data_abertura: r.row.DATA_ABERTURA,
        data_situacao: r.row.DATA_SITUACAO,
        situacao: r.row.SITUACAO,
        municipio: r.row.MUNICIPIO,
        uf: r.row.UF,
        public_link: r.public_link,
        checkout_link: r.checkout_link,
        token: r.row.TOKEN,
        reference_code: r.reference_code,
        row_data: r.row._raw as any,
        status: r.status,
      }));
      const CHUNK = 500;
      const inserted: any[] = [];
      for (let i = 0; i < payload.length; i += CHUNK) {
        const { data, error } = await supabase
          .from('email_campaign_recipients')
          .insert(payload.slice(i, i + CHUNK))
          .select();
        if (error) throw error;
        inserted.push(...(data || []));
      }
      const valid = recs.filter((r) => r.status === 'ready').length;
      const invalid = recs.length - valid;
      await supabase
        .from('email_campaigns')
        .update({ valid_recipients: valid, invalid_recipients: invalid, status: valid > 0 ? 'ready' : 'draft' })
        .eq('id', cam.id);

      setCampaignId(cam.id);
      setRecipients(recs.map((r, i) => ({ ...r, id: inserted[i]?.id })));
      setStep('editor');
      toast.success(`Importados: ${valid} válidos, ${invalid} inválidos`);
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || String(e)));
    } finally {
      setImporting(false);
    }
  };

  // ================= Variáveis do destinatário atual =================
  const filteredRecipients = useMemo(() => {
    if (!search.trim()) return recipients;
    const q = search.toLowerCase();
    return recipients.filter(
      (r) =>
        r.email.toLowerCase().includes(q) ||
        (r.cnpj || '').toLowerCase().includes(q) ||
        (r.company_name || '').toLowerCase().includes(q),
    );
  }, [recipients, search]);

  const current = filteredRecipients[selectedIdx] || filteredRecipients[0];
  const currentVars = current
    ? rowToVars(current.row, {
        name: fromName,
        company: campaignName,
        reference: current.reference_code,
      })
    : ({} as any);

  const renderedHtml = current ? renderHtml(design, currentVars) : '';
  const renderedText = current ? renderText(design, currentVars) : '';
  const renderedSubject = current ? substitute(subject, currentVars) : subject;
  const renderedPreheader = current ? substitute(preheader, currentVars) : preheader;
  const missingVars = current
    ? findMissingVars(
        [subject, preheader, design.title, design.intro, design.buttonHref].join(' '),
        currentVars,
      )
    : [];

  // ================= Ações fila =================
  const toggleSel = (id: string) => {
    setSelectedIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const selAll = () => setSelectedIds(new Set(recipients.map((r) => r.id!).filter(Boolean)));
  const clearSel = () => setSelectedIds(new Set());

  const bulkStatus = async (status: Recipient['status']) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase
      .from('email_campaign_recipients')
      .update({ status })
      .in('id', ids);
    if (error) return toast.error(error.message);
    setRecipients((rs) => rs.map((r) => (selectedIds.has(r.id!) ? { ...r, status } : r)));
    toast.success(`${ids.length} atualizados`);
    clearSel();
  };
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase.from('email_campaign_recipients').delete().in('id', ids);
    if (error) return toast.error(error.message);
    setRecipients((rs) => rs.filter((r) => !selectedIds.has(r.id!)));
    clearSel();
    toast.success('Removidos');
  };
  const bulkBlock = async () => {
    const ids = Array.from(selectedIds);
    const targets = recipients.filter((r) => ids.includes(r.id!));
    for (const r of targets) {
      await supabase.from('suppression_list').upsert({ email: r.email, reason: 'manual' }, { onConflict: 'email' });
    }
    await bulkStatus('blocked');
  };

  // ================= Exportação =================
  const exportRows = () =>
    recipients.map((r) => {
      const v = rowToVars(r.row, { name: fromName, company: campaignName, reference: r.reference_code });
      return {
        EMAIL: r.email,
        NOME_EMPRESARIAL: r.company_name,
        CNPJ: r.cnpj,
        DATA_ABERTURA: r.row.DATA_ABERTURA,
        SITUACAO: r.row.SITUACAO,
        REFERENCIA: r.reference_code,
        LINK_PUBLICO: r.public_link,
        LINK_CHECKOUT: r.checkout_link,
        ASSUNTO_PERSONALIZADO: substitute(subject, v),
        HTML_PERSONALIZADO: renderHtml(design, v),
        TEXTO_PERSONALIZADO: renderText(design, v),
        STATUS: r.status,
      };
    });

  const downloadCsv = () => {
    const rows = exportRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `${campaignName}-lista.csv`);
  };
  const downloadXlsx = () => {
    const rows = exportRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Campanha');
    XLSX.writeFile(wb, `${campaignName}-lista.xlsx`);
  };
  const downloadHtml = () => {
    const blob = new Blob([renderedHtml], { type: 'text/html' });
    triggerDownload(blob, `preview-${current?.reference_code || 'teste'}.html`);
  };
  const copyHtml = async () => {
    await navigator.clipboard.writeText(renderedHtml);
    toast.success('HTML copiado');
  };
  const openPreview = () => {
    const w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(renderedHtml);
      w.document.close();
    }
  };

  // =========== Render ===========
  if (step === 'upload') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">Campanhas de E-mail</h1>
          <p className="text-sm text-muted-foreground">
            Preparação de campanhas personalizadas. Nenhum e-mail é enviado nesta etapa.
          </p>
        </div>

        <Card className="border-emerald-300 bg-emerald-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-900">
              <Zap className="h-5 w-5" /> Montar automaticamente das Empresas Importadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-emerald-900/80">
              A campanha é construída direto do banco (empresas já importadas + seus links gerados).
              Não precisa mais subir planilha — a cada nova importação, basta clicar em <strong>Recarregar</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={loadFromCompanies}
                disabled={loadingCompanies}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {loadingCompanies ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {companiesInfo ? 'Recarregar empresas importadas' : 'Carregar empresas importadas'}
              </Button>
              <label className="flex items-center gap-2 text-xs text-emerald-900">
                <input
                  type="checkbox"
                  checked={companiesOnlyWithEmail}
                  onChange={(e) => setCompaniesOnlyWithEmail(e.target.checked)}
                />
                Somente empresas com e-mail válido
              </label>
              {companiesInfo && (
                <span className="text-xs text-emerald-900/80">
                  {companiesInfo.total} empresas · {companiesInfo.withEmail} com e-mail · {companiesInfo.withLink} com link
                </span>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    );
  }




  // ============= Editor =============
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">{campaignName}</h1>
          <p className="text-sm text-muted-foreground">
            {recipients.filter((r) => r.status === 'ready').length} prontos ·{' '}
            {recipients.filter((r) => r.status === 'invalid').length} inválidos ·{' '}
            {recipients.filter((r) => r.status === 'blocked').length} bloqueados
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadFromCompanies} disabled={loadingCompanies}>
            {loadingCompanies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Recarregar empresas
          </Button>

          <Button variant="outline" onClick={downloadCsv}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={downloadXlsx}>
            <Download className="mr-2 h-4 w-4" /> XLSX
          </Button>
        </div>
      </div>



      
      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">

        {/* ====== Editor ====== */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Campanha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Nome"><Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} /></Field>
              <Field label="Assunto"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
              <Field label="Preheader"><Input value={preheader} onChange={(e) => setPreheader(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="De (nome)"><Input value={fromName} onChange={(e) => setFromName(e.target.value)} /></Field>
                <Field label="De (e-mail)"><Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} /></Field>
              </div>
              <Field label="Reply-to"><Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} /></Field>
            </CardContent>
          </Card>




          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Conteúdo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Logo (texto)"><Input value={design.logoText} onChange={(e) => setDesign({ ...design, logoText: e.target.value })} /></Field>
              <Field label="Título"><Input value={design.title} onChange={(e) => setDesign({ ...design, title: e.target.value })} /></Field>
              <Field label="Subtítulo"><Input value={design.subtitle} onChange={(e) => setDesign({ ...design, subtitle: e.target.value })} /></Field>
              <Field label="Texto principal"><Textarea rows={5} value={design.intro} onChange={(e) => setDesign({ ...design, intro: e.target.value })} /></Field>
              <Field label="Título do card"><Input value={design.cardTitle} onChange={(e) => setDesign({ ...design, cardTitle: e.target.value })} /></Field>
              <Field label="Texto do botão"><Input value={design.buttonLabel} onChange={(e) => setDesign({ ...design, buttonLabel: e.target.value })} /></Field>
              <Field label="Link do botão"><Input value={design.buttonHref} onChange={(e) => setDesign({ ...design, buttonHref: e.target.value })} /></Field>
              <Field label="Rodapé"><Input value={design.footer} onChange={(e) => setDesign({ ...design, footer: e.target.value })} /></Field>
              <Field label="Aviso"><Textarea rows={2} value={design.disclaimer} onChange={(e) => setDesign({ ...design, disclaimer: e.target.value })} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Estilo</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <ColorField label="Fundo cabeçalho" value={design.headerBg} onChange={(v) => setDesign({ ...design, headerBg: v })} />
              <ColorField label="Texto cabeçalho" value={design.headerText} onChange={(v) => setDesign({ ...design, headerText: v })} />
              <ColorField label="Fundo corpo" value={design.bodyBg} onChange={(v) => setDesign({ ...design, bodyBg: v })} />
              <ColorField label="Fundo card" value={design.cardBg} onChange={(v) => setDesign({ ...design, cardBg: v })} />
              <ColorField label="Botão" value={design.buttonBg} onChange={(v) => setDesign({ ...design, buttonBg: v })} />
              <ColorField label="Texto botão" value={design.buttonText} onChange={(v) => setDesign({ ...design, buttonText: v })} />
              <Field label="Alinhamento">
                <Select value={design.align} onValueChange={(v: any) => setDesign({ ...design, align: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Esquerda</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tamanho título">
                <Input type="number" value={design.titleSize} onChange={(e) => setDesign({ ...design, titleSize: Number(e.target.value) })} />
              </Field>
              <Field label="Tamanho corpo">
                <Input type="number" value={design.bodySize} onChange={(e) => setDesign({ ...design, bodySize: Number(e.target.value) })} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Variáveis disponíveis</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1 text-xs">
              {[
                'NOME_EMPRESARIAL','RAZAO_SOCIAL','NOME_TITULAR','CNPJ','DATA_ABERTURA','DATA_SITUACAO',
                'SITUACAO','MUNICIPIO','UF','EMAIL','LINK_PUBLICO','LINK_CHECKOUT','TOKEN','REFERENCIA',
                'NOME_REMETENTE','EMPRESA_REMETENTE',
              ].map((v) => (
                <button key={v}
                  className={`px-2 py-1 rounded border ${missingVars.includes(v) ? 'border-red-400 text-red-600 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
                  onClick={() => navigator.clipboard.writeText(`{{${v}}}`).then(() => toast.success('Copiado'))}
                >{`{{${v}}}`}</button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ====== Preview + Fila ====== */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">Prévia personalizada</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {filteredRecipients.length ? selectedIdx + 1 : 0} / {filteredRecipients.length}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setSelectedIdx((i) => Math.min(filteredRecipients.length - 1, i + 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input className="pl-7 h-8 w-56" placeholder="CNPJ, e-mail ou nome" value={search}
                      onChange={(e) => { setSearch(e.target.value); setSelectedIdx(0); }} />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {current ? (
                <>
                  <div className="text-xs text-muted-foreground">
                    Para: <strong>{current.email}</strong> · CNPJ {formatCnpj(current.cnpj)} · Ref {current.reference_code}
                  </div>
                  <div className="text-sm"><strong>Assunto:</strong> {renderedSubject}</div>
                  <div className="text-xs text-muted-foreground"><strong>Preheader:</strong> {renderedPreheader}</div>
                  {missingVars.length > 0 && (
                    <div className="text-xs text-red-600">Variáveis vazias: {missingVars.join(', ')}</div>
                  )}

                  <Tabs defaultValue="desktop" className="mt-3">
                    <TabsList>
                      <TabsTrigger value="desktop">Prévia Desktop</TabsTrigger>
                      <TabsTrigger value="mobile">Prévia Mobile</TabsTrigger>
                      <TabsTrigger value="html">HTML</TabsTrigger>
                      <TabsTrigger value="text">Texto simples</TabsTrigger>
                    </TabsList>
                    <TabsContent value="desktop">
                      <div className="bg-slate-100 p-4 rounded-md border">
                        <div className="bg-white rounded shadow-sm overflow-hidden border">
                          <div className="p-4 border-b bg-slate-50 space-y-1">
                            <div className="text-xs text-muted-foreground"><strong>De:</strong> {fromName} &lt;{fromEmail}&gt;</div>
                            <div className="text-xs text-muted-foreground"><strong>Para:</strong> {current.email}</div>
                             <div className="text-sm font-semibold"><strong>Assunto:</strong> {renderedSubject}</div>
                             <div className="text-xs text-muted-foreground line-clamp-1 italic"><strong>Preheader:</strong> {renderedPreheader}</div>
                          </div>
                          <iframe title="preview" srcDoc={renderedHtml} className="w-full h-[640px] border-none" />
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="mobile">
                      <div className="bg-slate-100 p-4 rounded-md border flex justify-center">
                        <div className="bg-white rounded-[32px] shadow-xl overflow-hidden border-[8px] border-slate-800 w-[380px] h-[720px] relative">
                          <div className="h-6 w-32 bg-slate-800 absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xl z-10" />
                          <div className="p-4 pt-8 border-b bg-slate-50 space-y-1">
                            <div className="flex justify-between items-start">
                              <div className="text-[10px] text-muted-foreground leading-tight"><strong>De:</strong> {fromName}</div>
                              <div className="text-[9px] text-muted-foreground">Agora</div>
                            </div>
                            <div className="text-[11px] font-bold leading-tight line-clamp-2">{renderedSubject}</div>
                            <div className="text-[10px] text-muted-foreground line-clamp-1 italic">{renderedPreheader}</div>
                          </div>
                          <iframe title="preview-mobile" srcDoc={renderedHtml} className="w-full h-[580px] border-none" />
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="html">
                      <Textarea readOnly value={renderedHtml} className="h-[520px] font-mono text-xs" />
                    </TabsContent>
                    <TabsContent value="text">
                      <Textarea readOnly value={renderedText} className="h-[520px] font-mono text-xs" />
                    </TabsContent>
                  </Tabs>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={openPreview}><Eye className="mr-2 h-4 w-4" />Abrir prévia</Button>
                    <Button size="sm" variant="outline" onClick={copyHtml}><Copy className="mr-2 h-4 w-4" />Copiar HTML</Button>
                    <Button size="sm" variant="outline" onClick={downloadHtml}><Download className="mr-2 h-4 w-4" />Baixar HTML</Button>


                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum destinatário.</p>
              )}
            </CardContent>
          </Card>



          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Fila preparada ({recipients.length})</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={selAll}>Selecionar todos</Button>
                  <Button size="sm" variant="outline" onClick={clearSel}>Limpar</Button>
                  <Button size="sm" variant="outline" onClick={() => bulkStatus('ready')}><CheckCircle2 className="mr-1 h-3 w-3" />Marcar pronto</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline"><Ban className="mr-1 h-3 w-3" />Bloquear</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Bloquear selecionados?</AlertDialogTitle>
                        <AlertDialogDescription>Serão adicionados à lista de supressão.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={bulkBlock}>Bloquear</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-red-600"><Trash2 className="mr-1 h-3 w-3" />Remover</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Remover selecionados?</AlertDialogTitle></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={bulkDelete}>Remover</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[520px] overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="p-2"></th>
                      <th className="p-2 text-left">E-mail</th>
                      <th className="p-2 text-left">Nome</th>
                      <th className="p-2 text-left">CNPJ</th>
                      <th className="p-2 text-left">Ref</th>
                      <th className="p-2 text-left">Link</th>
                      <th className="p-2 text-left">Assunto</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecipients.map((r, i) => (
                      <tr key={r.id || i} className="border-t hover:bg-slate-50">
                        <td className="p-2"><input type="checkbox" checked={!!r.id && selectedIds.has(r.id)} onChange={() => r.id && toggleSel(r.id)} /></td>
                        <td className="p-2">{r.email}</td>
                        <td className="p-2">{r.company_name}</td>
                        <td className="p-2 whitespace-nowrap">{formatCnpj(r.cnpj)}</td>
                        <td className="p-2 font-mono">{r.reference_code}</td>
                        <td className="p-2"><a className="text-brand-blue underline" href={r.public_link} target="_blank" rel="noreferrer">abrir</a></td>
                        <td className="p-2 max-w-[200px] truncate">{r.personalized_subject}</td>
                        <td className="p-2"><StatusBadge status={r.status} /></td>
                        <td className="p-2">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedIdx(i)}><Eye className="h-3 w-3" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 rounded border" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}

function ResultBox({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: 'neutral' | 'ok' | 'warn' }) {
  const colors = {
    neutral: 'bg-slate-50 text-slate-700 border-slate-200',
    ok: 'bg-green-50 text-green-700 border-green-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <div className={`p-3 rounded border ${colors[tone]}`}>
      <div className="text-[10px] uppercase font-bold opacity-70">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : tone === 'warn' ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-slate-700 bg-slate-50 border-slate-200';
  return (
    <div className={`rounded border p-3 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready: 'bg-emerald-100 text-emerald-800',
    invalid: 'bg-red-100 text-red-800',
    blocked: 'bg-slate-200 text-slate-700',
    pending: 'bg-amber-100 text-amber-800',
    sent: 'bg-blue-100 text-blue-800',
  };
  return <Badge className={map[status] || 'bg-slate-100'}>{status}</Badge>;
}
function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
