import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export type PipelineTickResult = {
  ok: boolean;
  skipped?: 'locked' | null;
  batchSize: number;
  spacingSec: number;
  /** Etapa atual do ciclo, em texto pronto para o painel. */
  stage: string;
  linksCreated: number;
  enqueued: number;
  suppressed: number;
  sent: number;
  failed: number;
  imported: number;
  waitingSpacing: boolean;
  secondsToNextSend: number;
  pipeline: {
    importadas: number;
    semLink: number;
    links: number;
    linksSemEnvio: number;
    fila: number;
    enviados: number;
    falhas: number;
    pendenteTotal: number;
    importacaoLiberada: boolean;
    motivoBloqueio: string | null;
  };
  sentInWindow: number;
  remainingInWindow: number;
  /** Provedor sinalizou limite de envio (HTTP 429) neste ciclo. */
  rateLimited: boolean;
  /** Segundos sugeridos de espera quando rateLimited. */
  retryAfterSec: number;
  /** Cota da hora esgotada (com margem de segurança). */
  quotaExhausted: boolean;
  /** Saúde do envio avaliada ao fim do ciclo. */
  health: {
    status: 'healthy' | 'warning' | 'blocked';
    reason: string | null;
    waitSec: number;
    naFila: number;
    enviadosUltimaHora: number;
    aguardando429: number;
    falhas: number;
    failureRate: number;
  };
  error?: string;
};

const EMPTY_HEALTH: PipelineTickResult['health'] = {
  status: 'healthy',
  reason: null,
  waitSec: 0,
  naFila: 0,
  enviadosUltimaHora: 0,
  aguardando429: 0,
  falhas: 0,
  failureRate: 0,
};


const LOCK_TTL_MS = 90_000;

/**
 * Um único ciclo do fluxo, na ordem canônica e com trava:
 *   links -> fila -> despacho -> (só se tudo limpo) importação do próximo lote.
 *
 * O tamanho do lote é o MESMO do limite por hora, então nunca importamos
 * mais do que conseguimos enviar dentro da hora.
 */
export const runPipelineTick = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ batchSize: z.number().int().min(1).max(1000).optional() }).parse(data ?? {}),
  )
  .handler(async ({ context, data }): Promise<PipelineTickResult> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { readFlowSettings, computePipelineState } = await import('./pipeline.server');
    const { ensureLinksForImported, syncMassEmailQueue } = await import(
      '@/lib/automation/mass-email.server'
    );
    const { processQueueInternal, MAX_PER_TICK } = await import('@/lib/gmail/queue.server');

    const flow = await readFlowSettings(context.supabase);
    const batchSize = Math.max(1, data.batchSize ?? flow.hourlyBatchSize);
    const spacingSec = Math.max(1, Math.round(3600 / batchSize));

    // ---- trava: apenas um ciclo por vez (várias abas / cliques) -------------
    const nowMs = Date.now();
    const { data: cfg } = await supabaseAdmin
      .from('cloud_automation_settings')
      .select('lock_token, lock_heartbeat_at')
      .eq('id', 1)
      .maybeSingle();

    const heartbeat = (cfg as any)?.lock_heartbeat_at
      ? new Date((cfg as any).lock_heartbeat_at).getTime()
      : 0;
    const locked = !!(cfg as any)?.lock_token && nowMs - heartbeat < LOCK_TTL_MS;

    const emptyState = {
      importadas: 0,
      semLink: 0,
      links: 0,
      linksSemEnvio: 0,
      fila: 0,
      enviados: 0,
      falhas: 0,
      pendenteTotal: 0,
      importacaoLiberada: false,
      motivoBloqueio: null as string | null,
    };

    if (locked) {
      return {
        ok: true,
        skipped: 'locked',
        batchSize,
        spacingSec,
        stage: 'aguardando ciclo anterior',
        linksCreated: 0,
        enqueued: 0,
        suppressed: 0,
        sent: 0,
        failed: 0,
        imported: 0,
        waitingSpacing: false,
        secondsToNextSend: 0,
        pipeline: emptyState,
        sentInWindow: 0,
        remainingInWindow: 0,
        rateLimited: false,
        retryAfterSec: 0,
      };
    }

    const token = crypto.randomUUID();
    await supabaseAdmin
      .from('cloud_automation_settings')
      .upsert(
        {
          id: 1,
          lock_token: token,
          lock_heartbeat_at: new Date(nowMs).toISOString(),
        } as any,
        { onConflict: 'id' },
      );

    const release = async (status: string) => {
      await supabaseAdmin
        .from('cloud_automation_settings')
        .update({
          lock_token: null,
          lock_heartbeat_at: null,
          last_run_at: new Date().toISOString(),
          status,
        } as any)
        .eq('id', 1);
    };

    try {
      // 1) links para tudo que foi importado
      const links = await ensureLinksForImported(batchSize);

      // 2) fila de envio para todo link ainda não enfileirado
      const sync = await syncMassEmailQueue(batchSize);

      // 3) despacho espaçado (1 e-mail por ciclo, 3600/lote segundos entre eles)
      const queue: any = await processQueueInternal(MAX_PER_TICK, batchSize, spacingSec);

      // 4) trava de importação: só repõe o lote quando não sobrou nada
      const state = await computePipelineState(context.supabase);
      let imported = 0;
      let stage = '';

      if (!state.importacaoLiberada) {
        stage = state.motivoBloqueio ?? 'processando lote atual';
      } else {
        const { runImportBatch } = await import('@/lib/casa-dos-dados/simple-flow.server');
        const { data: cfgs } = await supabaseAdmin
          .from('automatic_company_queries')
          .select('filters')
          .eq('enabled', true)
          .limit(1);

        const outcome: any = await runImportBatch({
          date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
            new Date(),
          ),
          filters: ((cfgs ?? [])[0]?.filters as any) || {
            only_mei: true,
            only_active: true,
            only_matriz: false,
            require_email: true,
          },
          limit: batchSize,
          skipExisting: true,
        });
        imported = outcome?.imported ?? outcome?.created ?? 0;
        stage = imported > 0 ? `novo lote importado (${imported})` : 'sem empresas novas na consulta';
      }

      const { computeSendWindow } = await import('./pipeline.server');
      const win = await computeSendWindow(context.supabase, batchSize);

      if (!stage) stage = 'enviando lote';
      if (queue?.waitingSpacing) {
        stage = 'aguardando intervalo entre envios';
      }

      await release('active');

      return {
        ok: true,
        skipped: null,
        batchSize,
        spacingSec,
        stage,
        linksCreated: links.created ?? 0,
        enqueued: sync.enqueued ?? 0,
        suppressed: sync.semEmail ?? 0,
        sent: queue?.sent ?? 0,
        failed: queue?.failed ?? 0,
        imported,
        waitingSpacing: !!queue?.waitingSpacing,
        secondsToNextSend: queue?.waitingSpacing ? spacingSec : 0,
        pipeline: {
          importadas: state.importadas,
          semLink: state.semLink,
          links: state.links,
          linksSemEnvio: state.linksSemEnvio,
          fila: state.fila,
          enviados: state.enviados,
          falhas: state.falhas,
          pendenteTotal: state.pendenteTotal,
          importacaoLiberada: state.importacaoLiberada,
          motivoBloqueio: state.motivoBloqueio,
        },
        sentInWindow: win.sentInWindow,
        remainingInWindow: win.remaining,
        rateLimited: !!queue?.rateLimited,
        retryAfterSec: queue?.retryAfterSec ?? 0,
      };
    } catch (e) {
      await release('error');
      return {
        ok: false,
        batchSize,
        spacingSec,
        stage: 'erro no ciclo',
        linksCreated: 0,
        enqueued: 0,
        suppressed: 0,
        sent: 0,
        failed: 0,
        imported: 0,
        waitingSpacing: false,
        secondsToNextSend: 0,
        pipeline: emptyState,
        sentInWindow: 0,
        remainingInWindow: 0,
        rateLimited: false,
        retryAfterSec: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
