// Regras da animação de consulta (GovConsultaLoader) exibida antes da página da empresa.
// Mantida pura para poder ser testada sem navegador.

export const INTRO_STORAGE_PREFIX = 'gov-intro:';

export function introKey(token: string): string {
  return `${INTRO_STORAGE_PREFIX}${token}`;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function hasSeenIntro(storage: StorageLike | null | undefined, token: string): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(introKey(token)) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen(storage: StorageLike | null | undefined, token: string): void {
  if (!storage) return;
  try {
    storage.setItem(introKey(token), '1');
  } catch {
    /* modo privado: apenas ignora */
  }
}

/**
 * Toca a animação apenas uma vez por token e nunca quando o visitante pediu
 * menos movimento. Evita loop entre /acesso/$token e /c/$token.
 */
export function shouldPlayIntro(input: { seen: boolean; reducedMotion: boolean }): boolean {
  return !input.seen && !input.reducedMotion;
}

export function prefersReducedMotion(win: { matchMedia?: (q: string) => { matches: boolean } } | undefined): boolean {
  try {
    return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}
