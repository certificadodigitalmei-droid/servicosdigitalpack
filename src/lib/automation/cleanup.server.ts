type CleanupRpcClient = {
  rpc: (name: 'admin_cleanup_unpaid_data') => PromiseLike<{
    data: unknown;
    error: { message: string; details?: string | null; hint?: string | null } | null;
  }>;
};

export type CleanupCounts = Record<string, number>;

export type CleanupResult = {
  success: boolean;
  message: string;
  removed: CleanupCounts;
  remaining: CleanupCounts;
  error?: string;
};

function readCounts(value: unknown): CleanupCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, count]) =>
      typeof count === 'number' && Number.isFinite(count) ? [[key, count]] : [],
    ),
  );
}

export async function executeAtomicCleanup(db: CleanupRpcClient): Promise<CleanupResult> {
  const { data, error } = await db.rpc('admin_cleanup_unpaid_data');
  if (error) {
    const context = [error.message, error.details, error.hint].filter(Boolean).join(' — ');
    throw new Error(context || 'A limpeza transacional falhou');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('A limpeza retornou uma resposta inválida');
  }

  const payload = data as Record<string, unknown>;
  const removed = readCounts(payload.removed);
  const remaining = readCounts(payload.remaining);
  const success = payload.success === true;

  if (!success) {
    return {
      success: false,
      message: typeof payload.message === 'string' ? payload.message : 'A pós-condição da limpeza falhou',
      removed,
      remaining,
      error: typeof payload.error === 'string' ? payload.error : undefined,
    };
  }

  const invalidPostCondition =
    (remaining.unprotected_companies ?? 0) !== 0 ||
    (remaining.unprotected_company_links ?? 0) !== 0 ||
    (remaining.email_send_queue ?? 0) !== 0 ||
    (remaining.automatic_company_queue ?? 0) !== 0 ||
    (remaining.whatsapp_queue ?? 0) !== 0;

  if (invalidPostCondition) {
    return {
      success: false,
      message: 'A limpeza terminou com registros não protegidos; o resultado foi rejeitado.',
      removed,
      remaining,
      error: 'Pós-condição zero não atendida',
    };
  }

  return {
    success: true,
    message: typeof payload.message === 'string' ? payload.message : 'Limpeza concluída e verificada.',
    removed,
    remaining,
  };
}