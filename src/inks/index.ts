/**
 * Ink model. Pure: safe to import from server components.
 *
 * An ink is a named colour that will be printed. v1 inks are process (CMYK)
 * builds. The `type` field leaves room for spot inks later without changing
 * how components reference inks (always by name).
 */

export type Cmyk = readonly [c: number, m: number, y: number, k: number];

export interface ProcessInk {
  /** Defaults to "process". Reserved for spot inks in a later version. */
  type?: "process";
  /** CMYK build, each channel 0–100. */
  cmyk: Cmyk;
  /** Colour used to render the ink on screen (any CSS hex colour). */
  preview: string;
  /** Optional human-readable name, e.g. "Brand red". */
  label?: string;
}

export type Ink = ProcessInk;
export type InkMap = Record<string, Ink>;

/**
 * Reserved ink name for "no ink": the unprinted substrate. Use it for
 * knocked-out (reversed) text. It never counts towards `maxInks`.
 */
export const PAPER = "paper";

/** Ink used for crop and registration marks: 100% on every plate. */
export const REGISTRATION = "registration";

export const PAPER_INK: Ink = { cmyk: [0, 0, 0, 0], preview: "#ffffff", label: "Paper (no ink)" };
export const REGISTRATION_INK: Ink = { cmyk: [100, 100, 100, 100], preview: "#000000", label: "Registration" };

/** Default inks used when no InkProvider is present. */
export const DEFAULT_INKS: InkMap = { black: { cmyk: [0, 0, 0, 100], preview: "#000000" } };

export type Rgb = readonly [r: number, g: number, b: number];

/** Parses #rgb, #rrggbb, rgb() and rgba() strings. Returns null for anything else or fully transparent colours. */
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = [...m[1]!].map((c) => parseInt(c + c, 16));
    return [r!, g!, b!];
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) {
    if (m[2] === "00") return null;
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    if (m[4] !== undefined) {
      const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a === 0) return null;
    }
    return [Math.round(+m[1]!), Math.round(+m[2]!), Math.round(+m[3]!)];
  }
  if (s === "black") return [0, 0, 0];
  if (s === "white") return [255, 255, 255];
  return null;
}

/** Returns true for colours a browser reports as transparent. */
export function isTransparent(input: string): boolean {
  const s = input.trim().toLowerCase();
  return s === "transparent" || parseColor(s) === null;
}

function sameRgb(a: Rgb, b: Rgb, tolerance = 1): boolean {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance && Math.abs(a[2] - b[2]) <= tolerance;
}

/**
 * Finds the declared ink whose preview matches a rendered colour.
 * Returns undefined when the colour does not correspond to any ink.
 */
export function inkForColor(color: string, inks: InkMap): string | undefined {
  const rgb = parseColor(color);
  if (!rgb) return undefined;
  for (const [name, ink] of Object.entries(inks)) {
    const p = parseColor(ink.preview);
    if (p && sameRgb(p, rgb)) return name;
  }
  const paper = parseColor(PAPER_INK.preview)!;
  if (sameRgb(paper, rgb)) return PAPER;
  return undefined;
}

/** Resolves an ink by name, including the reserved paper and registration inks. */
export function resolveInk(name: string, inks: InkMap): Ink | undefined {
  if (name === PAPER) return inks[PAPER] ?? PAPER_INK;
  if (name === REGISTRATION) return REGISTRATION_INK;
  return inks[name];
}

/** Returns a list of problems with an ink map (empty when valid). */
export function validateInks(inks: InkMap): string[] {
  const problems: string[] = [];
  for (const [name, ink] of Object.entries(inks)) {
    if (name === REGISTRATION) problems.push(`"${REGISTRATION}" is a reserved ink name`);
    if (!Array.isArray(ink.cmyk) || ink.cmyk.length !== 4 || ink.cmyk.some((v) => !(v >= 0 && v <= 100))) {
      problems.push(`Ink "${name}" must have four CMYK values between 0 and 100`);
    }
    if (!parseColor(ink.preview)) problems.push(`Ink "${name}" has an invalid preview colour "${ink.preview}"`);
  }
  return problems;
}
