import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Bot, Copy, Download, RefreshCw, Zap, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getWaConfig, setWaProfile, regenerateWaToken, enqueueWaMessages, listWaQueue, clearWaQueue, PROFILES,
} from '@/lib/whatsapp-queue.functions';

type Row = {
  phone: string;
  message: string;
  company_name?: string | null;
  cnpj?: string | null;
  company_link_id?: string | null;
};

export function WhatsAppAutomationPanel({ selection, onEnqueued }: { selection: Row[]; onEnqueued: () => void }) {
  const [cfg, setCfg] = useState<any>(null);
  const [stats, setStats] = useState<{ pending: number; sent: number; failed: number; recent: any[] }>({ pending: 0, sent: 0, failed: 0, recent: [] });
  const [busy, setBusy] = useState(false);
  const [batchLabel, setBatchLabel] = useState('');
  const [skipHours, setSkipHours] = useState(72);

  const getCfg = useServerFn(getWaConfig);
  const setProfile = useServerFn(setWaProfile);
  const regen = useServerFn(regenerateWaToken);
  const enqueue = useServerFn(enqueueWaMessages);
  const listQueue = useServerFn(listWaQueue);
  const clearQueue = useServerFn(clearWaQueue);

  const refresh = async () => {
    try {
      const [c, s] = await Promise.all([getCfg(), listQueue()]);
      setCfg(c); setStats(s);
    } catch (e: any) {
      toast.error('Falha ao carregar automação: ' + (e?.message ?? ''));
    }
  };
  useEffect(() => { void refresh(); const id = setInterval(refresh, 10000); return () => clearInterval(id); }, []);

  const doEnqueue = async () => {
    if (selection.length === 0) { toast.error('Nenhum contato na lista visível.'); return; }
    setBusy(true);
    try {
      const r = await enqueue({ data: { items: selection, batch_label: batchLabel || null as any, skip_recent_hours: skipHours } });
      toast.success(`Adicionado à fila: ${r.inserted} · Ignorados (duplicados/recentes): ${r.skipped}`);
      onEnqueued(); await refresh();
    } catch (e: any) {
      toast.error('Falha: ' + (e?.message ?? ''));
    } finally { setBusy(false); }
  };

  const changeProfile = async (p: 'ultra' | 'safe' | 'moderate' | 'fast') => {
    setBusy(true);
    try { await setProfile({ data: { profile: p } }); await refresh(); toast.success(`Perfil: ${PROFILES[p].label}`); }
    catch (e: any) { toast.error(e?.message ?? 'falhou'); }
    finally { setBusy(false); }
  };
  const toggleRunning = async (v: boolean) => {
    if (!cfg) return;
    setBusy(true);
    try { await setProfile({ data: { profile: cfg.profile, running: v } }); await refresh(); }
    finally { setBusy(false); }
  };
  const doRegen = async () => {
    if (!confirm('Gerar novo token invalida a extensão instalada. Continuar?')) return;
    try { const r = await regen(); toast.success('Novo token gerado'); await refresh(); await navigator.clipboard.writeText(r.token); toast.success('Token copiado para a área de transferência'); }
    catch (e: any) { toast.error(e?.message ?? ''); }
  };
  const doClear = async (scope: 'pending' | 'all') => {
    if (!confirm(scope === 'pending' ? 'Remover mensagens pendentes?' : 'Apagar TODO o histórico da fila?')) return;
    try { await clearQueue({ data: { scope } }); await refresh(); toast.success('Fila limpa'); }
    catch (e: any) { toast.error(e?.message ?? ''); }
  };
  const copyToken = async () => { if (cfg?.extension_token) { await navigator.clipboard.writeText(cfg.extension_token); toast.success('Token copiado'); } };

  const p = cfg ? PROFILES[cfg.profile as keyof typeof PROFILES] : null;

  return (
    <Card className="border-emerald-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700">
          <Bot className="h-5 w-5" /> Envio automático via WhatsApp Web (extensão)
        </CardTitle>
        <CardDescription>
          Instale a extensão no navegador, cole o token e mantenha o WhatsApp Web aberto. O painel envia sozinho, com delay aleatório humanizado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <b>Use um número dedicado.</b> Comece no perfil <b>Seguro</b> e aqueça o chip. Envios em massa pelo WhatsApp violam os Termos e podem levar a bloqueio do número.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Token da extensão</Label>
            <div className="flex gap-2">
              <Input readOnly value={cfg?.extension_token ?? '...'} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copyToken} title="Copiar"><Copy className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={doRegen} title="Gerar novo"><RefreshCw className="h-4 w-4" /></Button>
            </div>
            <a href="/whatsapp-extension.zip" download className="inline-flex">
              <Button size="sm" variant="secondary"><Download className="h-4 w-4 mr-1" /> Baixar extensão (.zip)</Button>
            </a>
            <p className="text-xs text-slate-500 leading-relaxed">
              1) Descompacte · 2) Abra <code>chrome://extensions</code> · 3) Ative "Modo desenvolvedor" · 4) "Carregar sem compactação" · 5) Clique no ícone da extensão, cole o token e salve · 6) Deixe o WhatsApp Web aberto e clique em <b>Iniciar</b>.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Perfil de ritmo</Label>
            <Select value={cfg?.profile ?? 'safe'} onValueChange={(v) => changeProfile(v as any)} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PROFILES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label} · ~{v.hourly}/h · até {v.daily_limit}/dia</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {p && (
              <div className="text-xs text-slate-600 space-y-1">
                <div>Delay entre envios: <b>{Math.round(p.min_delay_ms / 1000)}s – {Math.round(p.max_delay_ms / 1000)}s</b> (aleatório)</div>
                <div>A cada <b>{p.batch_size}</b> envios: pausa de <b>{Math.round(p.long_pause_ms / 60000)} min</b></div>
                <div>Limite diário: <b>{cfg?.daily_limit ?? p.daily_limit}</b> · Enviadas hoje: <b>{cfg?.sent_today ?? 0}</b></div>
              </div>
            )}
            <div className="flex items-center gap-2 pt-2">
              <Badge variant={cfg?.running ? 'default' : 'secondary'} className={cfg?.running ? 'bg-emerald-600' : ''}>
                {cfg?.running ? 'Automação ATIVA' : 'Automação parada'}
              </Badge>
              {cfg?.running ? (
                <Button size="sm" variant="destructive" onClick={() => toggleRunning(false)}>Pausar automação</Button>
              ) : (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => toggleRunning(true)}>Ativar automação</Button>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Último sinal da extensão: {cfg?.last_heartbeat_at ? new Date(cfg.last_heartbeat_at).toLocaleString('pt-BR') : 'nunca'}
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3 bg-slate-50">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Rótulo do lote (opcional)</Label>
              <Input value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="ex: PIX pendente 29/07" />
            </div>
            <div>
              <Label>Ignorar contato feito nas últimas</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={720} value={skipHours} onChange={(e) => setSkipHours(Number(e.target.value) || 0)} />
                <span className="text-sm text-slate-500">horas</span>
              </div>
            </div>
            <div className="flex items-end">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={doEnqueue} disabled={busy || selection.length === 0}>
                <Zap className="h-4 w-4 mr-1" /> Enfileirar {selection.length} contato{selection.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span>Pendentes: <b className="text-amber-700">{stats.pending}</b></span>
            <span>Enviadas: <b className="text-emerald-700">{stats.sent}</b></span>
            <span>Falhas: <b className="text-red-700">{stats.failed}</b></span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => refresh()}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar</Button>
              <Button size="sm" variant="ghost" onClick={() => doClear('pending')}><Trash2 className="h-3.5 w-3.5 mr-1" /> Limpar pendentes</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
