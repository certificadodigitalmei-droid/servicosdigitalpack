import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Tabelas escutadas globalmente para manter o painel sincronizado.
// Cada mudança dispara invalidação das queries que usam a mesma chave-raiz.
const TABLES: Array<{ table: string; queryKey: string }> = [
  { table: 'orders', queryKey: 'orders' },
  { table: 'company_links', queryKey: 'company_links' },
  { table: 'link_events', queryKey: 'link_events' },
  { table: 'email_send_queue', queryKey: 'email_send_queue' },
  { table: 'automatic_company_query_runs', queryKey: 'automation_runs' },
  { table: 'automatic_company_queries', queryKey: 'automations' },
  
  { table: 'email_workers', queryKey: 'email_workers' },
  { table: 'companies', queryKey: 'companies' },
  { table: 'payment_gateways', queryKey: 'payment_gateways' },
];

/**
 * Registra um único canal Realtime para todas as tabelas do painel.
 * Deve ser montado uma vez no layout `_authenticated`.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel('painel-global-sync');
    for (const t of TABLES) {
      channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: t.table },
        () => {
          qc.invalidateQueries({ queryKey: [t.queryKey] });
          if (t.table === 'email_send_queue') {
            qc.invalidateQueries({ queryKey: ['fila-unica'] });
            qc.invalidateQueries({ queryKey: ['send-health'] });
            qc.invalidateQueries({ queryKey: ['send-window'] });
          }
          qc.invalidateQueries({ queryKey: ['dashboard-overview'] });
          qc.invalidateQueries({ queryKey: ['pipeline-state'] });
          qc.invalidateQueries({ queryKey: ['pipeline-sem-link'] });
          qc.invalidateQueries({ queryKey: ['pipeline-sem-envio'] });
        },

      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
