import { Link } from "@tanstack/react-router";
import { Menu, User, ChevronDown, Home, ChevronRight } from "lucide-react";
import logoAsset from 
import { formatCPFOrCNPJ } from "@/lib/format";
import type { ReactNode } from "react";

interface HeaderProps {
  userName?: string;
  userDoc?: string;
}

export function SiteHeader({ userName, userDoc }: HeaderProps) {
  const displayName = userName?.trim().toUpperCase() || "Visitante";
  const displayDoc = userDoc ? formatCPFOrCNPJ(userDoc) : "—";

  return (
    <header className="w-full">
      {/* 1. Top white bar with gov.br brand + user session info */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-1.5">
          <div className="flex shrink-0 items-center select-none" aria-label="gov.br">
            <img
              src="/logo-site.png"
              alt="Digital Certifica A1"
              className="h-10 w-auto object-contain pointer-events-none"
              draggable={false}
            />
          </div>


          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 text-right">
              <div className="truncate text-[10.5px] font-bold text-foreground">
                {displayName}
              </div>
              <div className="truncate text-[9px] text-muted-foreground">{displayDoc}</div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-soft text-brand-blue">
              <User className="h-4 w-4" />
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* 2. Dark navy bar: Portal do Empreendedor */}
      <div className="bg-[#002a4d] text-primary-foreground shadow-sm">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-2.5">
          <Menu className="h-5 w-5 cursor-pointer" />
          <span className="text-[15px] font-bold tracking-tight">Digital Certifica A1</span>
        </div>
      </div>

      {/* 3. Bright blue bar: Context title */}
      <div className="bg-[#004884] text-primary-foreground">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-2">
          <span className="text-[12.5px] font-medium opacity-95">Ambiente do Microempreendedor Individual</span>
          <User className="h-4 w-4 opacity-80" />
        </div>
      </div>
    </header>
  );
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <div className="bg-[#f8f9fa] border-b border-border/50 overflow-x-hidden">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-1 gap-y-0.5 px-3 py-2 text-[11px] text-[#005690] sm:px-4">
        <span className="inline-flex items-center text-muted-foreground">
          <Home className="h-3 w-3" />
        </span>

        {items.map((it, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/60" />
            {it.to ? (
              <Link to={it.to} className="hover:underline">
                {it.label}
              </Link>
            ) : (
              <span className="text-muted-foreground">{it.label}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SiteFooter() {
  return null;
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-page flex flex-col overflow-x-hidden">{children}</div>;
}
Troca logo do site.
