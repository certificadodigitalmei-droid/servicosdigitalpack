import { useSyncExternalStore } from 'react';

/**
 * Loja reativa mínima, com persistência opcional em localStorage,
 * usada pelas engines de automação para sobreviver a navegações de rota.
 */
export type Store<T> = {
  get: () => T;
  set: (updater: Partial<T> | ((prev: T) => Partial<T>)) => void;
  subscribe: (fn: () => void) => () => void;
};

export function createStore<T extends object>(initial: T, opts?: { storageKey?: string; persistKeys?: (keyof T)[] }): Store<T> {
  let state: T = initial;
  const listeners = new Set<() => void>();

  // Hidrata do localStorage.
  if (typeof window !== 'undefined' && opts?.storageKey) {
    try {
      const raw = window.localStorage.getItem(opts.storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          state = { ...state, ...saved };
        }
      }
    } catch {
      /* ignore */
    }
  }

  const persist = () => {
    if (typeof window === 'undefined' || !opts?.storageKey) return;
    try {
      const toSave = opts.persistKeys
        ? Object.fromEntries(opts.persistKeys.map((k) => [k, (state as any)[k]]))
        : state;
      window.localStorage.setItem(opts.storageKey, JSON.stringify(toSave));
    } catch {
      /* quota */
    }
  };

  // Sincroniza mudanças entre abas/janelas via storage event.
  if (typeof window !== 'undefined' && opts?.storageKey) {
    window.addEventListener('storage', (e) => {
      if (e.key !== opts.storageKey || !e.newValue) return;
      try {
        const saved = JSON.parse(e.newValue);
        if (saved && typeof saved === 'object') {
          state = { ...state, ...saved };
          for (const l of listeners) l();
        }
      } catch {
        /* ignore */
      }
    });
  }

  return {
    get: () => state,
    set: (updater) => {
      const patch = typeof updater === 'function' ? (updater as any)(state) : updater;
      state = { ...state, ...patch };
      persist();
      for (const l of listeners) l();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Hook React para consumir uma engine. Passe um seletor estável (ex.: `s => s.foo`). */
export function useStore<T, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}
