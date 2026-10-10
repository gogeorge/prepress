import type { Issue } from "./types.js";

/**
 * Holds the latest preflight issues per artboard. Artboards publish here;
 * `usePreflight` subscribes. Plain module with no DOM access.
 */
export interface PreflightStore {
  /** All issues from every artboard. Same array reference until something changes. */
  getIssues(): readonly Issue[];
  /** Issues for a single artboard. */
  getArtboardIssues(id: string): readonly Issue[];
  set(artboardId: string, issues: readonly Issue[]): void;
  remove(artboardId: string): void;
  subscribe(listener: () => void): () => void;
}

const EMPTY: readonly Issue[] = Object.freeze([]);

export function createPreflightStore(): PreflightStore {
  const byArtboard = new Map<string, readonly Issue[]>();
  const listeners = new Set<() => void>();
  let all: readonly Issue[] = EMPTY;
  const keys = new Map<string, string>();

  const emit = () => {
    all = Object.freeze([...byArtboard.values()].flat());
    for (const l of [...listeners]) l();
  };

  return {
    getIssues: () => all,
    getArtboardIssues: (id) => byArtboard.get(id) ?? EMPTY,
    set(id, issues) {
      const key = JSON.stringify(issues);
      if (keys.get(id) === key) return;
      keys.set(id, key);
      byArtboard.set(id, Object.freeze([...issues]));
      emit();
    },
    remove(id) {
      if (!byArtboard.has(id)) return;
      byArtboard.delete(id);
      keys.delete(id);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Store used by every Artboard and `usePreflight` unless one is passed explicitly. */
export const defaultPreflightStore: PreflightStore = createPreflightStore();

export const EMPTY_ISSUES = EMPTY;
