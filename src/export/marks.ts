/**
 * Marks stage: crop and registration marks drawn as vectors outside the bleed.
 * Pure: no DOM.
 */
import { REGISTRATION } from "../inks/index.js";
import type { ArtboardSpec } from "../preflight/types.js";
import type { Primitive } from "./types.js";

export interface MarksOptions {
  /** Draw crop (trim) marks. Default true. */
  crop?: boolean;
  /** Draw registration targets centred on each side. Default true. */
  registration?: boolean;
  /** Distance from the trim edge to the start of each crop mark, in mm. Default bleed + 1 mm; never less than the bleed. */
  offset?: number;
  /** Crop mark length, in mm. Default 5. */
  length?: number;
  /** Line width, in mm. Default 0.1 (≈ 0.28 pt). */
  strokeWidth?: number;
}

export interface ResolvedMarks {
  crop: boolean;
  registration: boolean;
  offset: number;
  length: number;
  strokeWidth: number;
  /** Space between the trim edge and the page edge, in mm. */
  margin: number;
}

/** Normalises mark options. `false` gives a page of trim + bleed with no marks. */
export function resolveMarks(spec: ArtboardSpec, marks: boolean | MarksOptions | undefined): ResolvedMarks {
  if (marks === false) return { crop: false, registration: false, offset: 0, length: 0, strokeWidth: 0, margin: spec.bleed };
  const o = marks === true || marks === undefined ? {} : marks;
  const offset = Math.max(spec.bleed, o.offset ?? spec.bleed + 1);
  const length = o.length ?? 5;
  return {
    crop: o.crop ?? true,
    registration: o.registration ?? true,
    offset,
    length,
    strokeWidth: o.strokeWidth ?? 0.1,
    margin: offset + length + 1,
  };
}

/** Crop and registration marks, in trim coordinates (mm), using the registration ink. */
export function buildMarks(spec: ArtboardSpec, m: ResolvedMarks): Primitive[] {
  const [w, h] = spec.trim;
  const out: Primitive[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    out.push({ kind: "line", x1, y1, x2, y2, strokeWidth: m.strokeWidth, stroke: REGISTRATION });
  if (m.crop) {
    const a = m.offset;
    const b = m.offset + m.length;
    for (const x of [0, w]) {
      line(x, -a, x, -b);
      line(x, h + a, x, h + b);
    }
    for (const y of [0, h]) {
      line(-a, y, -b, y);
      line(w + a, y, w + b, y);
    }
  }
  if (m.registration) {
    const d = m.offset + m.length / 2;
    const r = Math.min(2, m.length / 2.5);
    const targets: Array<[number, number]> = [
      [w / 2, -d],
      [w / 2, h + d],
      [-d, h / 2],
      [w + d, h / 2],
    ];
    for (const [cx, cy] of targets) {
      out.push({ kind: "circle", cx, cy, r: r * 0.6, stroke: REGISTRATION, strokeWidth: m.strokeWidth });
      line(cx - r, cy, cx + r, cy);
      line(cx, cy - r, cx, cy + r);
    }
  }
  return out;
}
