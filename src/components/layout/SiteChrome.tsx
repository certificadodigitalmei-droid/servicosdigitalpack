import { Link } from "@tanstack/react-router";
import { Menu, User, ChevronDown, Home, ChevronRight } from "lucide-react";
import logoAsset from "@/assets/govbr-logo-2.png.asset.json";
import { formatCPFOrCNPJ } from "@/lib/format";
import type { ReactNode } from "react";

interface HeaderProps {
  userName?: string;
  userDoc?: string;
}

export function SiteHeader({ userName, userDoc }: HeaderProps) {
  const displayName = userName?.trim() || "Visitante";
  const displayDoc = userDoc ? formatCPFOrCNPJ(userDoc) : "—";

  return (
    <header className="w-full">
      {/* Top white bar with brand + user */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-2.5">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img 
              src={logoAsset.url} 
              alt="Logo Central MEI" 
              className="h-8 w-auto object-contain"
            />
            <div className="hidden h-8 w-px bg-border sm:block" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-bold text-brand-navy">
                Central MEI Digital
              </div>
              <div className="hidden truncate text-[11px] text-muted-foreground sm:block">
                Central privada de serviços empresariais
              </div>
            </div>
          </Link>

          <div className="flex min-w-0 shrink-0 items-center gap-2 text-right">
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-[12px] font-semibold text-foreground">
                {displayName}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">{displayDoc}</div>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue-soft text-brand-blue">
              <User className="h-4 w-4" />
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
          </div>
        </div>
      </div>

      {/* Dark navy bar */}
      <div className="bg-brand-navy text-primary-foreground">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3">
          <Menu className="h-5 w-5" />
          <span className="text-sm font-medium">Área do Microempreendedor</span>
        </div>
      </div>

      {/* Blue bar */}
      <div className="bg-brand-blue text-primary-foreground">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-2.5">
          <span className="text-[13px]">Ambiente de Serviços Empresariais</span>
          <User className="h-4 w-4" />
        </div>
      </div>
    </header>
  );
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-[1280px] items-center gap-1.5 px-4 py-2.5 text-[13px] text-muted-foreground">
        <Home className="h-3.5 w-3.5" />
        {items.map((it, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3" />
            {it.to ? (
              <Link to={it.to} className="text-brand-blue hover:underline">
                {it.label}
              </Link>
            ) : (
              <span>{it.label}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border bg-background">
      <div className="mx-auto max-w-[1080px] px-4 py-8 text-[12px] text-muted-foreground">
        <p className="mb-3 leading-relaxed">
          <strong className="text-foreground">Central MEI Digital</strong> é uma empresa privada
          de apoio ao microempreendedor. A contratação é opcional. Serviço privado e opcional. A
          Central MEI Digital não possui vínculo com a Receita Federal, Gov.br, Portal do
          Empreendedor ou qualquer órgão público.
        </p>
        <div className="mb-3 space-y-0.5">
          <div>Razão social: <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em></div>
          <div>CNPJ: <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em></div>
          <div>Endereço: <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em></div>
          <div>E-mail: <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em></div>
          <div>Telefone: <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em></div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/politica-de-privacidade" className="text-brand-blue hover:underline">Política de Privacidade</Link>
          <Link to="/termos-de-uso" className="text-brand-blue hover:underline">Termos de Uso</Link>
          <Link to="/politica-de-reembolso" className="text-brand-blue hover:underline">Política de Reembolso</Link>
          <Link to="/contato" className="text-brand-blue hover:underline">Contato</Link>
          <Link to="/quem-somos" className="text-brand-blue hover:underline">Quem Somos</Link>
        </div>
            <div>
              <h4 className="mb-4 font-semibold text-white">Administrativo</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/login" className="hover:text-white transition-colors">Acesso Restrito</Link></li>
              </ul>
            </div>
          </div>

    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-page flex flex-col">{children}</div>;
}
