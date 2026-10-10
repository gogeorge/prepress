/**
 * Font metrics as the browser renders them. Called at measure time only.
 */
import { loadedFonts, matchFont } from "./fonts.js";

export interface FontFace {
  family: string;
  weight: number;
  italic: boolean;
}

export interface FontMetrics {
  /** x-height / font size. */
  xHeightRatio: number;
  /** Where the ratio came from: the font file (registered) or the rendered glyph (canvas). */
  xHeightSource: "font-file" | "canvas";
  /** Ascent of the content area / font size, as used for line boxes. */
  ascent: number;
  /** Descent of the content area / font size. */
  descent: number;
}

let canvasCtx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, FontMetrics | null>();

function ctx(): CanvasRenderingContext2D | null {
  if (canvasCtx === undefined) {
    try {
      canvasCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    } catch {
      canvasCtx = null;
    }
  }
  return canvasCtx;
}

export function clearMetricsCache(): void {
  cache.clear();
}

const SIZE = 200;

/**
 * Returns metrics for a face, preferring a registered font file for the
 * x-height and falling back to measuring the rendered "x" glyph. Returns null
 * when neither is available (e.g. no canvas support).
 */
export function fontMetrics(face: FontFace): FontMetrics | null {
  const key = `${face.italic ? "italic" : "normal"}|${face.weight}|${face.family}`;
  if (cache.has(key)) return cache.get(key)!;
  let result: FontMetrics | null = null;
  const c = ctx();
  if (c) {
    c.font = `${face.italic ? "italic " : ""}${face.weight} ${SIZE}px ${face.family}`;
    const m = c.measureText("x");
    const asc = m.fontBoundingBoxAscent;
    const desc = m.fontBoundingBoxDescent;
    const xh = m.actualBoundingBoxAscent;
    if (Number.isFinite(xh) && xh > 0) {
      result = {
        xHeightRatio: xh / SIZE,
        xHeightSource: "canvas",
        ascent: Number.isFinite(asc) ? asc / SIZE : 0.9,
        descent: Number.isFinite(desc) ? desc / SIZE : 0.22,
      };
    }
  }
  const registered = matchFont(loadedFonts(), face.family, face.weight, face.italic);
  if (registered && registered.xHeightRatio > 0) {
    result = { ascent: 0.9, descent: 0.22, ...result, xHeightRatio: registered.xHeightRatio, xHeightSource: "font-file" };
  }
  cache.set(key, result);
  return result;
}

/** Short font description for messages, e.g. "7 pt Inter 400". */
export function describeFont(family: string, sizePt: number, weight: number): string {
  const first = family.split(",")[0]!.trim().replace(/^["']|["']$/g, "");
  return `${Math.round(sizePt * 10) / 10} pt ${first} ${weight}`;
}

/**
 * Vertical ink extent of a string (actual glyph bounds), as fractions of the
 * font size. Null without canvas support.
 */
export function inkExtent(face: FontFace, text: string): { ascent: number; descent: number } | null {
  const c = ctx();
  if (!c) return null;
  c.font = `${face.italic ? "italic " : ""}${face.weight} ${SIZE}px ${face.family}`;
  const m = c.measureText(text);
  if (!Number.isFinite(m.actualBoundingBoxAscent)) return null;
  return { ascent: m.actualBoundingBoxAscent / SIZE, descent: m.actualBoundingBoxDescent / SIZE };
}
