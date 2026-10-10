"use client";

import { useContext, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { EPSILON_MM } from "../preflight/geometry.js";
import type { PanelNode, Rect } from "../preflight/types.js";
import { ArtboardContext, PanelContext, useArtboardNode } from "./context.js";
import { useInks } from "./useInks.js";

export interface PanelProps {
  /** Panel name; prefixes the identifiers of everything inside it in preflight issues. */
  name: string;
  /** Position and size, in the Artboard's unit, relative to the trim's top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ink that fills the panel. */
  background?: string;
  /** Extend the background into the bleed on every side where the panel touches the trim edge. Default false. */
  bleed?: boolean;
  /** Inner padding, in the Artboard's unit. Default 0. */
  padding?: number;
  /** Gap between children, in the Artboard's unit. Default 0. */
  gap?: number;
  className?: string;
  /** Extra styles. Children are laid out in a flex column by default. */
  style?: CSSProperties;
  children?: ReactNode;
}

/** Painted background rectangle: the panel, extended into the bleed where it touches the trim. */
export function backgroundRect(rect: Rect, trim: readonly [number, number], bleed: number, extend: boolean): Rect {
  if (!extend) return rect;
  const [w, h] = trim;
  const l = Math.abs(rect.x) <= EPSILON_MM ? bleed : 0;
  const t = Math.abs(rect.y) <= EPSILON_MM ? bleed : 0;
  const r = Math.abs(rect.x + rect.width - w) <= EPSILON_MM ? bleed : 0;
  const b = Math.abs(rect.y + rect.height - h) <= EPSILON_MM ? bleed : 0;
  return { x: rect.x - l, y: rect.y - t, width: rect.width + l + r, height: rect.height + t + b };
}

export function Panel({ name, x, y, width, height, background, bleed = false, padding = 0, gap = 0, className, style, children }: PanelProps) {
  const artboard = useContext(ArtboardContext);
  const inks = useInks();
  const conv = artboard?.toMm ?? ((v: number) => v);
  const rect = useMemo<Rect>(() => ({ x: conv(x), y: conv(y), width: conv(width), height: conv(height) }), [x, y, width, height, artboard]);
  const panelCtx = useMemo(() => ({ name, rect }), [name, rect]);
  const ref = useRef<HTMLDivElement>(null);
  const trim = artboard?.spec.trim ?? [Infinity, Infinity];
  const bleedMm = artboard?.spec.bleed ?? 0;
  const bg = background !== undefined ? backgroundRect(rect, trim, bleedMm, bleed) : undefined;

  useArtboardNode({
    baseId: () => name,
    element: () => ref.current,
    measure: () => {
      const node: Omit<PanelNode, "id"> = { kind: "panel", component: "Panel", name, rect, bbox: rect, inks: background ? [background] : [] };
      if (background !== undefined && bg) node.background = { ink: background, rect: bg };
      return node;
    },
    paint: () => (background !== undefined && bg ? [{ kind: "rect", ...bg, fill: background }] : []),
  });

  return (
    <PanelContext.Provider value={panelCtx}>
      <div
        ref={ref}
        className={className}
        data-prepress-panel={name}
        style={{
          position: "absolute",
          left: `${rect.x}mm`,
          top: `${rect.y}mm`,
          width: `${rect.width}mm`,
          height: `${rect.height}mm`,
          boxSizing: "border-box",
          padding: `${conv(padding)}mm`,
          display: "flex",
          flexDirection: "column",
          gap: `${conv(gap)}mm`,
          isolation: "isolate",
          ...style,
        }}
      >
        {bg && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${bg.x - rect.x}mm`,
              top: `${bg.y - rect.y}mm`,
              width: `${bg.width}mm`,
              height: `${bg.height}mm`,
              background: inks.preview(background!),
              zIndex: -1,
            }}
          />
        )}
        {children}
      </div>
    </PanelContext.Provider>
  );
}
