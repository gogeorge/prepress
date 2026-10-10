"use client";

import { useMemo, useSyncExternalStore } from "react";
import { defaultPreflightStore, EMPTY_ISSUES, type PreflightStore } from "./store.js";
import type { Issue } from "./types.js";

export interface UsePreflightOptions {
  /** Only return issues for the Artboard with this id. */
  artboard?: string;
  /** Store to read from. Defaults to the shared default store. */
  store?: PreflightStore;
}

export interface PreflightResult {
  issues: readonly Issue[];
  errors: readonly Issue[];
  warnings: readonly Issue[];
  /** True when there are no errors (warnings allowed). */
  ok: boolean;
}

const getServerSnapshot = () => EMPTY_ISSUES;

/**
 * Subscribes to preflight results. Works anywhere in the tree, including
 * above the Artboard and InkProvider. Returns no issues during server
 * rendering; results arrive after the artboard has been measured in the browser.
 */
export function usePreflight(options: UsePreflightOptions = {}): PreflightResult {
  const store = options.store ?? defaultPreflightStore;
  const all = useSyncExternalStore(store.subscribe, store.getIssues, getServerSnapshot);
  const { artboard } = options;
  return useMemo(() => {
    const issues = artboard === undefined ? all : all.filter((i) => i.artboard === artboard);
    const errors = issues.filter((i) => i.level === "error");
    const warnings = issues.filter((i) => i.level === "warn");
    return { issues, errors, warnings, ok: errors.length === 0 };
  }, [all, artboard]);
}
