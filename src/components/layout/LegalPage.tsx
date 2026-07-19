import type { ReactNode } from "react";
import { SiteHeader, Breadcrumb, SiteFooter, Page } from "./SiteChrome";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page>
      <SiteHeader />
      <Breadcrumb items={[{ label: title }]} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[720px] px-3.5 py-6 sm:px-4">
          <div className="rounded-md border border-border bg-card p-6">
            <h1 className="mb-4 text-[22px] font-bold text-brand-blue">{title}</h1>
            <div className="space-y-3 text-[13.5px] leading-relaxed text-foreground">{children}</div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </Page>
  );
}
