import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RefreshCw, AlertTriangle, Braces, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useServerFn } from "@tanstack/react-start";
import { getUsageStats } from "@/lib/aquicnpj/aquicnpj.functions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute('/_authenticated/painel/monitor')({
  component: MonitorPage,
});

function MonitorPage() {
  const [rangeQuery, setRangeQuery] = useState('{}');
  const [isAutoActive, setIsAutoActive] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fetchUsageStats = useServerFn(getUsageStats);

  const handleSaveRange = () => {
    try {
      const parsed = JSON.parse(rangeQuery);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      toast.success("Configuração de data salva!");
    } catch (e) {
      toast.error("JSON inválido. Deve ser um objeto {}.");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monitor Automático</h1>
          <p className="text-slate-500">Integração real com busca filtrada AquiCNPJ.</p>
        </div>
        <div className="p-2 bg-slate-50 rounded border border-slate-200 text-[10px] font-mono text-slate-400 max-w-[200px] break-all opacity-50 hover:opacity-100 transition-opacity cursor-pointer group relative" onClick={() => {
          navigator.clipboard.writeText("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzg3MDQ1NDUyLCJpYXQiOjE3ODQ0NTM0NTIsImp0aSI6ImNhZDFhMWIxMzY3ZDRmOGE5ZGRjMmUyMWI1NmFmYjRlIiwidXNlcl9pZCI6IjU0NiJ9.HTokt8FE8BuQOIfCFL0s7Z5cVVrIx1bB0ePqDRO4IEE");
          toast.success("Token copiado!");
        }}>
          <span className="group-hover:hidden">AQUICNPJ_TOKEN: eyJhbGciOiJIUzI1Ni...</span>
          <span className="hidden group-hover:block">Clique para copiar o Token completo</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Controle do Monitor</CardTitle>
            <CardDescription>Ative a descoberta automática de novas empresas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Status do Monitor</Label>
              <div className="flex items-center gap-2">
                <Switch 
                  checked={isAutoActive} 
                  onCheckedChange={(val) => {
                    if (val) {
                      toast.error("Falta configurar o range_query oficial da data de abertura.");
                      setIsAutoActive(false);
                    }
                  }}
                />
                <span className="text-sm font-medium">{isAutoActive ? 'Sincronização Ativa' : 'Desativado'}</span>
              </div>
            </div>
            
            <div className="p-3 bg-amber-50 rounded-md border border-amber-200 flex flex-col gap-2">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  O monitor automático "Abertas hoje" requer o range_query oficial configurado.
                </p>
              </div>
              <div className="mt-1 p-2 bg-white rounded border border-amber-100 text-[10px] font-mono text-slate-600">
                Usar data atual automaticamente: ATIVADO<br />
                const today = new Intl.DateTimeFormat("en-CA", &#123;<br />
                &nbsp;&nbsp;timeZone: "America/Sao_Paulo",<br />
                &nbsp;&nbsp;year: "numeric",<br />
                &nbsp;&nbsp;month: "2-digit",<br />
                &nbsp;&nbsp;day: "2-digit",<br />
                &#125;).format(new Date());
              </div>
            </div>

            <div className="space-y-2">
              <Label>Intervalo de Busca</Label>
              <Select defaultValue="1h">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">A cada 15 minutos</SelectItem>
                  <SelectItem value="1h">A cada 1 hora</SelectItem>
                  <SelectItem value="6h">A cada 6 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data de Abertura (Range Query)</CardTitle>
            <CardDescription>Cole aqui o JSON oficial fornecido pela AquiCNPJ.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>JSON oficial do range_query</Label>
                <Braces className="h-3 w-3 text-slate-400" />
              </div>
              <textarea 
                className="w-full h-32 p-3 font-mono text-xs border rounded-md bg-slate-50"
                value={rangeQuery}
                onChange={(e) => setRangeQuery(e.target.value)}
                placeholder='{"inicio_atividade": {"gte": "..."}}'
              />
            </div>
            <Button onClick={handleSaveRange} className="w-full bg-brand-blue hover:bg-brand-navy gap-2">
              <Save className="h-4 w-4" />
              Validar e Salvar JSON
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Filtros Reais da API</CardTitle>
            <CardDescription>Estes filtros serão aplicados no endpoint /search/empresa/simple.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Somente MEI</Label>
                    <p className="text-[10px] text-slate-500">extras.somente_mei: true</p>
                  </div>
                  <Switch checked={true} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Somente Ativa</Label>
                    <p className="text-[10px] text-slate-500">situacao_cadastral: ["02"]</p>
                  </div>
                  <Switch checked={true} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Somente Matriz</Label>
                    <p className="text-[10px] text-slate-500">extras.somente_matriz: true</p>
                  </div>
                  <Switch checked={true} />
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Exigir E-mail</Label>
                    <p className="text-[10px] text-slate-500">extras.com_email: true</p>
                  </div>
                  <Switch checked={true} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Remover Contabilidade</Label>
                    <p className="text-[10px] text-slate-500">extras.remove_contab: true</p>
                  </div>
                  <Switch checked={true} />
                </div>
                 <div className="space-y-3 mt-2">
                  <Button 
                    variant="outline" 
                    className="w-full gap-2"
                    disabled={testStatus === 'loading'}
                    onClick={async () => {
                      // Basic form validations before API call
                      try {
                        const parsedRange = JSON.parse(rangeQuery);
                        if (Object.keys(parsedRange).length === 0) {
                          toast.error("O JSON do range_query não pode estar vazio para o teste.");
                          return;
                        }
                      } catch (e) {
                        toast.error("JSON de range_query inválido. Verifique o formato.");
                        return;
                      }

                      setTestStatus('loading');
                      setErrorMessage(null);
                      try {
                        const stats = await fetchUsageStats();
                        setTestStatus('success');
                        toast.success(`Conexão validada! Plano: ${stats.subscription?.plan?.name || 'Ativo'}`);
                        setTimeout(() => setTestStatus('idle'), 3000);
                      } catch (error: any) {
                        setTestStatus('error');
                        setErrorMessage(error.message || "Falha na comunicação com a API");
                        toast.error("Erro ao validar conexão com API.");
                      }
                    }}
                  >
                    {testStatus === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {testStatus === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {testStatus === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                    {testStatus === 'idle' && <RefreshCw className="h-4 w-4" />}
                    Adicionar validações completas do formulário do Monitor Automático antes de disparar a chamada para a API.
                  </Button>

                  {testStatus === 'error' && errorMessage && (
                    <Alert variant="destructive" className="bg-red-50 border-red-200">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Erro de Verificação</AlertTitle>
                      <AlertDescription className="text-xs mt-1">
                        <p className="font-semibold">{errorMessage}</p>
                        <p className="mt-2 text-slate-600">
                          <strong>Passo Recomendado:</strong> Verifique se o <code className="bg-red-100 px-1 rounded">AQUICNPJ_ACCESS_TOKEN</code> está configurado corretamente nos Segredos do Projeto e se não expirou.
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Braces className="h-5 w-5" />
            Análise Técnica do range_query
          </CardTitle>
          <CardDescription>Instruções para configurar a busca automática por data de abertura.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-700">
          <div className="prose prose-slate max-w-none prose-sm prose-headings:mb-2 prose-p:mb-3">
            <p>O <strong>JSON exato ainda não apareceu na documentação</strong> que você mandou. O ponto desconhecido é justamente o conteúdo de:</p>
            <pre className="bg-slate-900 text-emerald-400 p-3 rounded-md"><code>"range_query": &#123;&#125;</code></pre>
            
            <p>A estrutura provável seria algo neste formato:</p>
            <pre className="bg-slate-900 text-emerald-400 p-3 rounded-md text-[10px] leading-tight"><code>&#123;
  "query": &#123;
    "cnpj": [],
    "razao_social": [],
    "situacao_cadastral": ["02"],
    "phone_type": "celular"
  &#125;,
  "range_query": &#123;
    "inicio_atividade": &#123;
      "gte": "2026-07-19T00:00:00-03:00",
      "lte": "2026-07-19T23:59:59-03:00"
    &#125;
  &#125;,
  "extras": &#123;
    "somente_mei": true,
    "com_email": true,
    "somente_matriz": true,
    "remove_contab": true
  &#125;,
  "page": 1,
  "page_size": 50
&#125;</code></pre>

            <p className="text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
              Mas atenção: <strong><code>inicio_atividade</code>, <code>gte</code> e <code>lte</code> ainda são uma hipótese técnica</strong>, não estão confirmados na documentação pública da AquiCNPJ.
            </p>

            <h3 className="text-blue-800 font-bold mt-4">## Para pegar o JSON correto em 1 minuto</h3>
            <p>Na própria plataforma AquiCNPJ:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Abra a tela de pesquisa de empresas.</li>
              <li>Pressione <code>F12</code>.</li>
              <li>Clique em <strong>Network</strong> ou <strong>Rede</strong>.</li>
              <li>Marque <strong>Fetch/XHR</strong>.</li>
              <li>No site, selecione: abertura (hoje), situação (ativa), somente MEI, com e-mail.</li>
              <li>Clique em pesquisar e abra a requisição <code>/search/empresa/simple</code>.</li>
              <li>Clique em <strong>Payload</strong> e copie o <strong>Request Payload</strong>.</li>
            </ol>

            <h3 className="text-blue-800 font-bold mt-4">## Troca automática da data</h3>
            <p>Depois de descobrirmos os nomes corretos, a Lovable não deve salvar <code>2026-07-19</code> fixo. Ela deve gerar a data em cada execução:</p>
            <pre className="bg-slate-900 text-emerald-400 p-3 rounded-md text-[10px]"><code>const dateFormatter = new Intl.DateTimeFormat("en-CA", &#123;
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
&#125;);

const currentDate = dateFormatter.format(new Date());
// Gera: 2026-07-19T00:00:00-03:00</code></pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentação da API AquiCNPJ</CardTitle>
          <CardDescription>Referência técnica para o endpoint de Busca Simples Filtrada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-slate-950 rounded-lg p-6 overflow-x-auto">
            <pre className="text-xs text-emerald-400 font-mono leading-relaxed whitespace-pre-wrap">
{`content-length: 107
content-type: application/json
curl -X POST "https://api.aquicnpj.com/search/empresa/simple" \\
 -H 'accept: application/json'\\
 -H 'authorization: Bearer Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzg3MDQ1NDUyLCJpYXQiOjE3ODQ0NTM0NTIsImp0aSI6ImNhZDFhMWIxMzY3ZDRmOGE5ZGRjMmUyMWI1NmFmYjRlIiwidXNlcl9pZCI6IjU0NiJ9.HTokt8FE8BuQOIfCFL0s7Z5cVVrIx1bB0ePqDRO4IEE'\\
 -H 'content-type: application/json' \\
 -d '{"query":{"cnpj":["58004198000161"],"razao_social":[],"cnaes_principais_id":[],"cnaes_secundarias_id":[],"natureza_id":[],"uf":[],"municipio":[],"bairro":[],"cep":[],"ddd":[],"situacao_cadastral":[],"phone_type":"celular"},"range_query":{},"extras":{"somente_mei":false,"excluir_mei":false,"com_email":false,"incluir_atividade_secundaria":false,"com_contato_telefonico":false,"somente_matriz":false,"somente_filial":false,"remove_contab":false,"remove_already_downloaded":false},"page":0,"page_size":0}'`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
