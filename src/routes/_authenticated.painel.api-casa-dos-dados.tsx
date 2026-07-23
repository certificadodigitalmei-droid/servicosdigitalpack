import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, Save, PlugZap, KeyRound, Link as LinkIcon, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  getCasaDosDadosSettings,
  saveCasaDosDadosSettings,
  testCasaDosDadosConnection,
} from '@/lib/casa-dos-dados/settings.functions';

export const Route = createFileRoute('/_authenticated/painel/api-casa-dos-dados')({
  head: () => ({
    meta: [
      { title: 'API Casa dos Dados — Painel' },
      { name: 'description', content: 'Configure as credenciais da API Casa dos Dados.' },
    ],
  }),
  component: Page,
});

type Info = {
  api_base_url: string;
  api_key_preview: string;
  has_api_key: boolean;
  updated_at: string | null;
  env_fallback: { api_base_url: string; has_api_key: boolean };
};

function Page() {
  const load = useServerFn(getCasaDosDadosSettings);
  const save = useServerFn(saveCasaDosDadosSettings);
  const test = useServerFn(testCasaDosDadosConnection);

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<Info | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; body: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = (await load()) as Info;
      setInfo(r);
      setBaseUrl(r.api_base_url || r.env_fallback.api_base_url || '');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onSave() {
    if (!baseUrl.trim()) return toast.error('Informe a URL base da API');
    setSaving(true);
    try {
      const payload: { api_base_url: string; api_key?: string } = { api_base_url: baseUrl.trim() };
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      await save({ data: payload });
      toast.success('Configuração salva');
      setApiKey('');
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await test();
      setTestResult(r);
      if (r.ok) toast.success('Conexão OK'); else toast.error(`Falhou (HTTP ${r.status})`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao testar');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6 pb-12 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">API Casa dos Dados</h1>
        <p className="text-slate-500">
          Cole aqui a URL base e a chave da API. Os valores salvos aqui têm prioridade sobre as variáveis de ambiente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wide text-slate-500">Credenciais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="baseUrl" className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-slate-500" /> URL base da API
                </Label>
                <Input
                  id="baseUrl"
                  placeholder="https://api.casadosdados.com.br"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-slate-400">
                  Ex.: <code>https://api.casadosdados.com.br</code> (sem barra no final).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey" className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-slate-500" /> Chave da API
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={info?.has_api_key ? `Atual: ${info.api_key_preview} — deixe em branco para manter` : 'Cole sua chave aqui'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono text-sm"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-400">
                  {info?.has_api_key
                    ? 'Uma chave já está salva. Preencha somente se quiser substituí-la.'
                    : 'A chave é armazenada no banco e usada apenas no servidor.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button onClick={onSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar
                </Button>
                <Button variant="outline" onClick={onTest} disabled={testing}>
                  {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                  Testar conexão
                </Button>
                {info?.updated_at && (
                  <span className="text-xs text-slate-400 ml-auto">
                    Atualizado em {new Date(info.updated_at).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>

              {testResult && (
                <div
                  className={`mt-2 rounded-md border p-3 text-sm ${
                    testResult.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    HTTP {testResult.status} {testResult.ok ? '— OK' : '— Falhou'}
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap break-all text-xs opacity-80">{testResult.body}</pre>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {info && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-slate-500">Fallback (variáveis de ambiente)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-1">
            <div><strong>CASA_DOS_DADOS_API_BASE_URL:</strong> {info.env_fallback.api_base_url || <em className="text-slate-400">não definido</em>}</div>
            <div><strong>CASA_DOS_DADOS_API_KEY:</strong> {info.env_fallback.has_api_key ? '✓ configurado' : <em className="text-slate-400">não definido</em>}</div>
            <p className="text-xs text-slate-400 pt-2">
              Se o campo acima estiver vazio, o sistema usa esses valores de ambiente automaticamente.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
