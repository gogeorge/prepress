"use client";

import { useMemo, type ReactNode } from "react";
import { PAPER, resolveInk, validateInks, type InkMap } from "../inks/index.js";
import { InkContext, type InkContextValue } from "./context.js";

export interface InkProviderProps {
  /** Allowed inks, by name. Components reference these names, never raw colours. */
  inks: InkMap;
  /** Maximum number of distinct inks the artwork may use (checked by the `inkLimit` rule). */
  maxInks?: number;
  /** Ink used when a component has no `ink` prop. Defaults to the first declared ink. */
  defaultInk?: string;
  children?: ReactNode;
}

const UNDECLARED_PREVIEW = "#ff00ff";

export function InkProvider({ inks, maxInks, defaultInk, children }: InkProviderProps) {
  const value = useMemo<InkContextValue>(() => {
    const problems = validateInks(inks);
    if (problems.length && typeof console !== "undefined") console.error(`[prepress] InkProvider: ${problems.join("; ")}`);
    const first = Object.keys(inks).find((n) => n !== PAPER) ?? PAPER;
    const ctx: InkContextValue = {
      inks,
      defaultInk: defaultInk ?? first,
      preview: (name) => resolveInk(name, inks)?.preview ?? UNDECLARED_PREVIEW,
    };
    if (maxInks !== undefined) ctx.maxInks = maxInks;
    return ctx;
  }, [inks, maxInks, defaultInk]);
  return <InkContext.Provider value={value}>{children}</InkContext.Provider>;
}
