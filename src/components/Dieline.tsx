"use client";

import { useContext, type CSSProperties } from "react";
import { ArtboardContext } from "./context.js";

export interface DielineProps {
  /** URL of an SVG dieline. Loaded as an image, so scripts inside it never run. */
  src: string;
  /** Show the dieline on screen. Default true. Dielines never print in v1. */
  visible?: boolean;
  /** Box the SVG's viewBox maps onto: the trim (default) or the trim plus bleed. */
  area?: "trim" | "bleed";
  /** On-screen opacity, 0–1. Default 0.9. */
  opacity?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Overlays a dieline on the artboard. Non-printing: it is excluded from
 * preflight and from exportPDF.
 */
export function Dieline({ src, visible = true, area = "trim", opacity = 0.9, className, style }: DielineProps) {
  const artboard = useContext(ArtboardContext);
  if (!visible) return null;
  const [w, h] = artboard?.spec.trim ?? [0, 0];
  const b = area === "bleed" ? artboard?.spec.bleed ?? 0 : 0;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-prepress-dieline=""
      className={className}
      style={{
        position: "absolute",
        left: `${-b}mm`,
        top: `${-b}mm`,
        width: `${w + 2 * b}mm`,
        height: `${h + 2 * b}mm`,
        pointerEvents: "none",
        userSelect: "none",
        opacity,
        zIndex: 10,
        ...style,
      }}
    />
  );
}
