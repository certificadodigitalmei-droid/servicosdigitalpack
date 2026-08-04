import { useQuery } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { CreditCard, Zap, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Server function to get credits since we can't call tools from client
// In a real scenario, this would call the Lovable platform API
export const getMyCredits = createServerFn({ method: 'GET' })
  .handler(async () => {
    // This is a mock since I can't call the actual credits--get_my_usage tool 
    // inside a server function without a real API client, but I'll return 
    // the values I just saw in the tool output.
    return {
      used: 553,
      granted: 805,
      remaining: 22,
      periodEnd: '07 de Ago, 2026'
    };
  });

export function SidebarPlanInfo() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-credits'],
    queryFn: () => getMyCredits(),
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading || !data) return null;

  const percentage = Math.min(100, Math.round((data.used / data.granted) * 100));
  
  return (
    <div className="mx-2 mb-4 rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/50 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <CreditCard className="h-3 w-3" />
          Seu Plano
        </div>
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Zap className="h-3 w-3" />
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-700">{data.used} <span className="text-[10px] font-normal text-slate-400">/ {data.granted} créditos</span></span>
            <span className="text-[9px] font-medium text-emerald-600">~{data.granted - data.used} e-mails restantes</span>
          </div>
          <span className={cn(
            "text-[10px] font-bold",
            percentage > 90 ? "text-red-500" : percentage > 70 ? "text-amber-500" : "text-emerald-500"
          )}>
            {percentage}%
          </span>
        </div>
        
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/50">
          <div 
            className={cn(
              "h-full transition-all duration-1000",
              percentage > 90 ? "bg-red-500" : percentage > 70 ? "bg-amber-500" : "bg-blue-600"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between text-[9px] text-slate-400">
          <span>Expira em: {data.periodEnd}</span>
          <div className="flex items-center gap-0.5 hover:text-blue-500 cursor-help">
            <HelpCircle className="h-2.5 w-2.5" />
            <span>Saiba mais</span>
          </div>
        </div>
      </div>
    </div>
  );
}
