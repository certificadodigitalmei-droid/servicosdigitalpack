export function extractErrorMessage(err: unknown): string {
  if (!err) return "Erro desconhecido";
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    // TanStack RPC error shapes
    const candidates = [
      e.message,
      (e.error as { message?: unknown } | undefined)?.message,
      e.error,
      e.body,
      (e.data as { message?: unknown } | undefined)?.message,
      e.statusText,
      e.status,
      e.code,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c;
    }
    try {
      // Tenta serializar todas as propriedades do objeto, incluindo não enumeráveis
      const props = Object.getOwnPropertyNames(err);
      const obj = props.reduce((acc, key) => {
        try {
          acc[key] = (err as Record<string, unknown>)[key];
        } catch {}
        return acc;
      }, {} as Record<string, unknown>);
      const s = JSON.stringify(obj);
      if (s && s !== "{}") return s;
    } catch {}
    try {
      const s = JSON.stringify(err);
      if (s && s !== "{}") return s;
    } catch {}
    try {
      const s = (err as { toString?: () => string }).toString?.();
      if (s && s !== "[object Object]") return s;
    } catch {}
  }
  return String(err);
}
