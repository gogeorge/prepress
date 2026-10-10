/**
 * Extracts laid-out text from the DOM: one run per line fragment of each text
 * node, with position, font and colour. Used for preflight (x-height, bounds,
 * colours) and for export (vector text). Runs only in the browser, at call time.
 */
import { pxToMm } from "../units/index.js";
import { fontMetrics, inkExtent, type FontMetrics } from "./metrics.js";
import type { Rect } from "../preflight/types.js";

export interface TextRun {
  text: string;
  /**
   * Box in mm, trim coordinates: horizontally the laid-out line fragment,
   * vertically the actual glyph ink (not the line box, which can overhang
   * its element when line-height is tight).
   */
  rect: Rect;
  baseline: number;
  fontSizeMm: number;
  family: string;
  weight: number;
  italic: boolean;
  /** Computed CSS colour. */
  color: string;
  underline: boolean;
  metrics: FontMetrics | null;
}

export interface ToMm {
  (r: { left: number; top: number; right: number; bottom: number }): Rect;
}

function transformText(text: string, transform: string, lang: string): string {
  if (transform === "uppercase") return text.toLocaleUpperCase(lang || undefined);
  if (transform === "lowercase") return text.toLocaleLowerCase(lang || undefined);
  if (transform === "capitalize") return text.replace(/(^|\s)(\S)/g, (_, s, c: string) => s + c.toLocaleUpperCase(lang || undefined));
  return text;
}

function hasUnderline(el: Element | null, root: Element): boolean {
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (getComputedStyle(e).textDecorationLine.includes("underline")) return true;
    if (e === root) break;
  }
  return false;
}

interface Word {
  start: number;
  end: number;
  rect: DOMRect;
}

/** Collects text runs under `root`, in document order. */
export function collectTextRuns(root: Element, toMm: ToMm): TextRun[] {
  const runs: TextRun[] = [];
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const data = node.data;
    if (!/\S/.test(data)) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === "none" || cs.visibility === "hidden") continue;

    const fontSizePx = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const italic = cs.fontStyle === "italic" || cs.fontStyle.startsWith("oblique");
    const metrics = fontMetrics({ family: cs.fontFamily, weight, italic });
    const underline = hasUnderline(parent, root);
    const lang = parent.closest("[lang]")?.getAttribute("lang") ?? "";

    // Measure word by word and group into lines by vertical position.
    const words: Word[] = [];
    for (const m of data.matchAll(/\S+/g)) {
      const start = m.index!;
      const end = start + m[0].length;
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
      if (rects.length <= 1) {
        const r = rects[0] ?? range.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) words.push({ start, end, rect: r });
        continue;
      }
      // Word broken across lines: fall back to characters.
      for (let i = start; i < end; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) words.push({ start: i, end: i + 1, rect: r });
      }
    }

    let line: Word[] = [];
    const flush = () => {
      if (!line.length) return;
      const first = line[0]!;
      const last = line[line.length - 1]!;
      const top = Math.min(...line.map((w) => w.rect.top));
      const bottom = Math.max(...line.map((w) => w.rect.bottom));
      const box = toMm({ left: first.rect.left, top, right: last.rect.right, bottom });
      const fontSizeMm = pxToMm(fontSizePx);
      const descentMm = (metrics?.descent ?? 0.22) * fontSizeMm;
      const baseline = box.y + box.height - descentMm;
      const text = transformText(data.slice(first.start, last.end).replace(/\s+/g, " "), cs.textTransform, lang);
      const ink = inkExtent({ family: cs.fontFamily, weight, italic }, text);
      const rect = ink
        ? { x: box.x, y: baseline - ink.ascent * fontSizeMm, width: box.width, height: (ink.ascent + ink.descent) * fontSizeMm }
        : box;
      runs.push({
        text,
        rect,
        baseline,
        fontSizeMm,
        family: cs.fontFamily,
        weight,
        italic,
        color: cs.color,
        underline,
        metrics,
      });
      line = [];
    };
    for (const w of words) {
      const prev = line[line.length - 1];
      if (prev && Math.abs(w.rect.top - prev.rect.top) > prev.rect.height / 2) flush();
      line.push(w);
    }
    flush();
  }
  range.detach?.();
  return runs;
}

/** Background colours set on any element under `root` (including root). */
export function collectBackgrounds(root: Element): string[] {
  const out: string[] = [];
  const all = [root, ...root.querySelectorAll("*")];
  for (const el of all) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg)) out.push(bg);
  }
  return out;
}
