"use client";

import { useContext, useMemo, useRef, type CSSProperties } from "react";
import { ean13Geometry, ean13HriPositions, encodeEan13, type Ean13Encoding } from "../barcode/ean13.js";
import type { BarcodeNode, Rect } from "../preflight/types.js";
import type { Primitive } from "../export/types.js";
import { PanelContext, useArtboardNode } from "./context.js";
import { nodeId } from "./textNode.js";
import { useInks } from "./useInks.js";

export interface BarcodeProps {
  /** Symbology. Only "ean13" in v1. */
  type: "ean13";
  /** 13 digits, or 12 digits to have the check digit computed. */
  value: string;
  /** Size relative to nominal (1 = 100% = 0.330 mm X-dimension). GS1 allows 0.8–2.0. Default 1. */
  magnification?: number;
  /** Ink for bars and digits. Default: the InkProvider's default ink. */
  ink?: string;
  /** Print the human-readable digits. Default true. */
  showDigits?: boolean;
  /** Font family for the digits. Default an OCR-B / monospace stack. */
  digitFont?: string;
  /** Overrides the identifier used in issues. */
  name?: string;
  className?: string;
  style?: CSSProperties;
}

const DIGIT_FONT = '"OCR-B", "OCRB", "OCR B", ui-monospace, "Courier New", monospace';

function tryEncode(value: string): Ean13Encoding | null {
  try {
    return encodeEan13(value);
  } catch {
    return null;
  }
}

/** EAN-13 barcode rendered as SVG, with quiet zones reserved on both sides. */
export function Barcode({ type, value, magnification = 1, ink, showDigits = true, digitFont = DIGIT_FONT, name, className, style }: BarcodeProps) {
  const inks = useInks();
  const panel = useContext(PanelContext);
  const ref = useRef<SVGSVGElement>(null);
  const inkName = ink ?? inks.defaultInk;
  const color = inks.preview(inkName);
  const g = useMemo(() => ean13Geometry(magnification), [magnification]);
  const enc = useMemo(() => tryEncode(value), [value]);
  const hri = useMemo(() => ean13HriPositions(g), [g]);

  /** Symbol placement in mm, measured from the rendered SVG (so CSS scaling is taken into account). */
  const place = (toMm: (r: DOMRect) => Rect) => {
    const el = ref.current;
    if (!el) return null;
    const r = toMm(el.getBoundingClientRect());
    const s = r.width / g.totalWidth;
    return { ox: r.x, oy: r.y, s };
  };

  useArtboardNode({
    baseId: () => name ?? nodeId(panel?.name, "Barcode", type === "ean13" ? undefined : type),
    element: () => ref.current,
    measure: (env) => {
      const p = place(env.toMm);
      if (!p) return null;
      const { ox, oy, s } = p;
      const x = g.x * s;
      const guardH = g.guardHeight * s;
      const barsRect = { x: ox + g.quietLeft * s, y: oy, width: g.barsWidth * s, height: guardH };
      const firstDigitLeft = showDigits ? ox + (hri[0]! - 0.35 * g.hriFontSize) * s : barsRect.x;
      const bottom = showDigits ? oy + g.totalHeight * s : oy + guardH;
      const node: Omit<BarcodeNode, "id"> = {
        kind: "barcode",
        component: "Barcode",
        symbology: "ean13",
        value,
        magnification: magnification * s,
        xDimensionMm: x,
        bbox: { x: firstDigitLeft, y: oy, width: barsRect.x + barsRect.width - firstDigitLeft, height: bottom - oy },
        barsRect,
        quietZones: {
          left: { x: ox, y: oy, width: g.quietLeft * s, height: guardH },
          right: { x: barsRect.x + barsRect.width, y: oy, width: g.quietRight * s, height: guardH },
        },
        inks: [inkName],
      };
      if (panel) node.panel = panel.name;
      return node;
    },
    paint: (env) => {
      const p = place(env.toMm);
      if (!p || !enc) return [];
      const { ox, oy, s } = p;
      const out: Primitive[] = enc.bars.map((b) => ({
        kind: "rect",
        x: ox + (g.quietLeft + b.x * g.x) * s,
        y: oy,
        width: b.width * g.x * s,
        height: (b.guard ? g.guardHeight : g.barHeight) * s,
        fill: inkName,
      }));
      if (showDigits) {
        [...enc.digits].forEach((d, i) =>
          out.push({
            kind: "text",
            text: d,
            x: ox + hri[i]! * s,
            baseline: oy + g.hriBaseline * s,
            fontSize: g.hriFontSize * s,
            font: { family: digitFont, weight: 400, italic: false },
            fill: inkName,
            align: "center",
          }),
        );
      }
      return out;
    },
  });

  const height = showDigits ? g.totalHeight : g.guardHeight;
  return (
    <svg
      ref={ref}
      role="img"
      aria-label={`EAN-13 ${value}`}
      className={className}
      data-prepress-node="Barcode"
      width={`${g.totalWidth}mm`}
      height={`${height}mm`}
      viewBox={`0 0 ${g.totalWidth} ${height}`}
      style={{ display: "block", flex: "none", overflow: "visible", ...style }}
    >
      {enc ? (
        <g fill={color}>
          {enc.bars.map((b, i) => (
            <rect key={i} x={g.quietLeft + b.x * g.x} y={0} width={b.width * g.x} height={b.guard ? g.guardHeight : g.barHeight} />
          ))}
          {showDigits &&
            [...enc.digits].map((d, i) => (
              <text key={i} x={hri[i]} y={g.hriBaseline} fontSize={g.hriFontSize} fontFamily={digitFont} textAnchor="middle">
                {d}
              </text>
            ))}
        </g>
      ) : (
        <g stroke="#e5484d" strokeWidth={0.3} fill="none">
          <rect x={g.quietLeft} y={0} width={g.barsWidth} height={g.barHeight} />
          <path d={`M${g.quietLeft} 0L${g.quietLeft + g.barsWidth} ${g.barHeight}M${g.quietLeft + g.barsWidth} 0L${g.quietLeft} ${g.barHeight}`} />
        </g>
      )}
    </svg>
  );
}
