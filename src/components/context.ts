"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { InkMap } from "../inks/index.js";
import type { ToMm } from "../measure/text.js";
import type { ArtboardSpec, PreflightNode, Rect } from "../preflight/types.js";
import type { Primitive } from "../export/types.js";
import type { Unit } from "../units/index.js";
import { subscribeFonts } from "../measure/fonts.js";

/** useLayoutEffect in the browser, useEffect on the server (where neither runs). */
export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface MeasureEnv {
  /** Converts a client rect to mm in trim coordinates. */
  toMm: ToMm;
  inks: InkMap;
  /** Trim rectangle in mm (origin 0,0). */
  trim: Rect;
}

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
export type MeasuredNode = DistributiveOmit<PreflightNode, "id">;

export interface NodeRegistration {
  /** Identifier before de-duplication, e.g. "back/MandatoryText[name]". */
  baseId(): string;
  element(): Element | null;
  measure(env: MeasureEnv): MeasuredNode | null;
  paint?(env: MeasureEnv): Primitive[];
}

export interface ArtboardContextValue {
  id: string;
  spec: ArtboardSpec;
  unit: Unit;
  /** Converts a length in the artboard's unit to mm. */
  toMm(value: number): number;
  /** Minimum x-height in mm for this artboard's surface area. */
  minXHeightMm: number;
  register(reg: NodeRegistration): () => void;
  requestMeasure(): void;
}

export const ArtboardContext = createContext<ArtboardContextValue | null>(null);

export interface PanelContextValue {
  name: string;
  /** Panel rectangle in mm. */
  rect: Rect;
}

export const PanelContext = createContext<PanelContextValue | null>(null);

export interface InkContextValue {
  inks: InkMap;
  maxInks?: number;
  defaultInk: string;
  /** Screen colour for an ink name; magenta for undeclared inks so they stand out. */
  preview(name: string): string;
}

export const InkContext = createContext<InkContextValue | null>(null);

/** Registers a measurable node with the enclosing Artboard. */
export function useArtboardNode(reg: NodeRegistration): void {
  const artboard = useContext(ArtboardContext);
  const latest = useRef(reg);
  latest.current = reg;
  useIsoLayoutEffect(() => {
    if (!artboard) return;
    return artboard.register({
      baseId: () => latest.current.baseId(),
      element: () => latest.current.element(),
      measure: (env) => latest.current.measure(env),
      paint: (env) => latest.current.paint?.(env) ?? [],
    });
  }, [artboard]);
  // Every render may change layout: ask for a (debounced) re-measure.
  useIsoLayoutEffect(() => {
    artboard?.requestMeasure();
  });
}

/** Re-renders when web fonts finish loading or a registered font file is parsed. */
export function useFontsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.addEventListener?.("loadingdone", bump);
    const off = subscribeFonts(bump);
    fonts?.ready?.then(bump);
    return () => {
      fonts?.removeEventListener?.("loadingdone", bump);
      off();
    };
  }, []);
  return version;
}

/** Stable unique id for SSR and the client. */
export const useStableId = useId;
