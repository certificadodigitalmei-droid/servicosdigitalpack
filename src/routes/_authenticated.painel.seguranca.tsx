import { createFileRoute } from '@tanstack/react-router';
import { Shield, Lock, Search, Database, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/_authenticated/painel/seguranca')({
  component: SecurityAuditPage,
});

function SecurityAuditPage() {
  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Shield className="h-8 w-8 text-brand-blue" />
          Diretrizes de Auditoria de Segurança
        </h1>
        <p className="text-slate-500 mt-2">
          Missão e protocolos de segurança para o sistema Central MEI Digital.
        </p>
      </div>

      <Card className="border-l-4 border-l-brand-blue shadow-md bg-white/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl">Declaração de Missão do Auditor</CardTitle>
          <CardDescription>
            Definição de escopo e responsabilidades para o Engenheiro de Segurança Staff.
          </CardDescription>
        </CardHeader>
        <CardContent className="prose prose-slate max-w-none">
          <div className="bg-slate-50 p-6 rounded-lg border border-slate-100 text-slate-700 leading-relaxed whitespace-pre-wrap">
            Você é um Engenheiro de Segurança de nível Staff, especializado em OWASP Top 10, criptografia e infraestrutura segura. Sua missão é realizar um Security Audit profundo no sistema fornecido, identificar vulnerabilidades críticas e implementar correções imediatas (hotfixes) sem comprometer a disponibilidade.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <SecurityPillar 
          icon={<Search className="h-5 w-5" />}
          title="1. Auditoria Ofensiva"
          description="Vulnerability Assessment & Threat Modeling"
          points={[
            { label: "OWASP Top 10", content: "Varredura em busca de injeções (SQLi, NoSQL, Command), Broken Access Control e falhas de autenticação." },
            { label: "XSS & CSRF", content: "Identificação de superfícies de ataque para Cross-Site Scripting e garantias contra Request Forgery." },
            { label: "Sensitive Data Exposure", content: "Localização de chaves de API, segredos ou PII expostas. Verificação de algoritmos de hashing." }
          ]}
        />

        <SecurityPillar 
          icon={<Lock className="h-5 w-5" />}
          title="2. Defesa de Camada de Aplicação"
          description="Hardening & Secure Development"
          points={[
            { label: "Authorization & Authentication", content: "Validação do princípio do Menor Privilégio (Least Privilege) com validação Server-Side." },
            { label: "Input Sanitization", content: "Camada rigorosa de sanitização e validação de tipos utilizando esquemas Zod." },
            { label: "Security Headers", content: "Configuração de headers críticos como CSP, HSTS, X-Frame-Options." }
          ]}
        />

        <SecurityPillar 
          icon={<Database className="h-5 w-5" />}
          title="3. Resiliência de Infraestrutura"
          description="Cloud & Database Security"
          points={[
            { label: "RLS & DB Security", content: "Auditoria de políticas de Row Level Security para garantir isolamento total de dados." },
            { label: "Rate Limiting & DoS", content: "Mecanismos de controle de taxa para prevenir força bruta e negação de serviço." },
            { label: "Dependency Audit", content: "Análise de bibliotecas externas em busca de CVEs conhecidas." }
          ]}
        />

        <SecurityPillar 
          icon={<AlertTriangle className="h-5 w-5" />}
          title="4. Relatório de Remediação"
          description="Compliance & Mitigation"
          points={[
            { label: "Classificação de Severidade", content: "Baixa, Média, Alta, Crítica com descrição clara do vetor de ataque." },
            { label: "Código Blindado", content: "Entrega de correções que mitigam a falha sem impactar a lógica de negócio." },
            { label: "Instrução de Execução", content: "Tratamento de cada brecha teórica como um potencial ponto de entrada real." }
          ]}
        />
      </div>

      <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl flex items-start gap-4">
        <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-emerald-900">Estado Atual do Sistema</h3>
          <p className="text-emerald-700 text-sm mt-1">
            O sistema passou por múltiplas rodadas de endurecimento de segurança, incluindo migração de funções críticas para o servidor, implementação de RPCs seguras e isolamento de RLS em nível granular.
          </p>
        </div>
      </div>
    </div>
  );
}

function SecurityPillar({ icon, title, description, points }: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  points: { label: string, content: string }[] 
}) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-slate-100 text-slate-700 font-bold">
            {icon}
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {points.map((p, i) => (
            <li key={i} className="flex flex-col gap-1">
              <Badge variant="secondary" className="w-fit text-[10px] uppercase">{p.label}</Badge>
              <p className="text-sm text-slate-600">{p.content}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
