import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/painel/')({
  component: DashboardIndex,
});

function DashboardIndex() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Visão Geral</h1>
        <p className="text-slate-500">Inicie a construção do seu novo painel administrativo aqui.</p>
      </div>
      
      <div className="grid gap-6">
        <div className="p-12 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-center space-y-4">
          <div className="p-4 bg-slate-100 rounded-full text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          </div>
          <div className="max-w-md">
            <h2 className="text-xl font-semibold text-slate-900">Painel Limpo</h2>
            <p className="text-slate-500">Todas as implementações anteriores foram removidas conforme solicitado. O sistema está pronto para ser reconstruído do zero.</p>
          </div>
        </div>
      </div>
    </div>
  );
}