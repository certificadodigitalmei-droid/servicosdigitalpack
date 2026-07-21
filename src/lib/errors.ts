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
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c;
    }
    try {
      const s = JSON.stringify(err);
      if (s && s !== "{}") return s;
    } catch {}
  }
  return String(err);
}
