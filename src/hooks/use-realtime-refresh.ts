import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Assina mudanças em uma ou mais tabelas e chama o callback (debounce 500ms).
 * Use em telas legadas que carregam via useEffect (não TanStack Query).
 */
export function useRealtimeRefresh(tables: string[], onChange: () => void, deps: unknown[] = []) {
  useEffect(() => {
    let timer: any;
    const trigger = () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 500);
    };
    const channel = supabase.channel(`refresh-${tables.join('-')}-${Math.random().toString(36).slice(2, 7)}`);
    for (const t of tables) {
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table: t }, trigger);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
