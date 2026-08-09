import { describe, expect, it } from 'vitest';
import {
  hasSeenIntro,
  introKey,
  markIntroSeen,
  prefersReducedMotion,
  shouldPlayIntro,
} from '@/lib/intro-animation';
import { shouldPauseForFailureRate } from '@/lib/whatsapp/campaign-logic';

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('animação de consulta antes da página da empresa', () => {
  it('toca no acesso direto a /c/$token quando ainda não foi vista', () => {
    const store = memStorage();
    expect(shouldPlayIntro({ seen: hasSeenIntro(store, 'abc'), reducedMotion: false })).toBe(true);
  });

  it('não repete depois de vista — evita loop entre /acesso e /c', () => {
    const store = memStorage();
    markIntroSeen(store, 'abc');
    expect(store.getItem(introKey('abc'))).toBe('1');
    expect(shouldPlayIntro({ seen: hasSeenIntro(store, 'abc'), reducedMotion: false })).toBe(false);
  });

  it('é por token: outro link volta a mostrar a animação', () => {
    const store = memStorage();
    markIntroSeen(store, 'abc');
    expect(shouldPlayIntro({ seen: hasSeenIntro(store, 'xyz'), reducedMotion: false })).toBe(true);
  });

  it('respeita prefers-reduced-motion', () => {
    const win = { matchMedia: () => ({ matches: true }) };
    expect(prefersReducedMotion(win)).toBe(true);
    expect(shouldPlayIntro({ seen: false, reducedMotion: prefersReducedMotion(win) })).toBe(false);
  });

  it('não quebra quando o armazenamento está indisponível', () => {
    expect(hasSeenIntro(null, 'abc')).toBe(false);
    expect(() => markIntroSeen(null, 'abc')).not.toThrow();
  });
});

describe('pausa automática por taxa de falhas', () => {
  it('não pausa com poucas tentativas', () => {
    expect(shouldPauseForFailureRate({ sent: 0, failed: 2, blocked: 0 })).toBe(false);
  });

  it('pausa quando metade ou mais falha', () => {
    expect(shouldPauseForFailureRate({ sent: 3, failed: 3, blocked: 0 })).toBe(true);
  });

  it('não pausa quando a maioria dá certo', () => {
    expect(shouldPauseForFailureRate({ sent: 9, failed: 1, blocked: 0 })).toBe(false);
  });
});
