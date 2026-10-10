/**
 * EAN-13 encoder. Pure: no DOM, safe to import from server components.
 */

/** Nominal X-dimension (narrowest module width) at 100% magnification, in mm. */
export const EAN13_X_NOMINAL_MM = 0.33;
/** Smallest allowed X-dimension (80% magnification), in mm. */
export const EAN13_X_MIN_MM = 0.264;
/** Largest allowed X-dimension (200% magnification), in mm. */
export const EAN13_X_MAX_MM = 0.66;
/** Symbol width in modules, excluding quiet zones. */
export const EAN13_MODULES = 95;
/** Minimum left quiet zone, in modules. */
export const EAN13_QUIET_LEFT = 11;
/** Minimum right quiet zone, in modules. */
export const EAN13_QUIET_RIGHT = 7;
/** Bar height at 100% magnification, in mm. */
export const EAN13_BAR_HEIGHT_MM = 22.85;
/** Total symbol height including human-readable digits at 100%, in mm. */
export const EAN13_TOTAL_HEIGHT_MM = 25.93;
/** Guard bars extend below the data bars by this many modules. */
export const EAN13_GUARD_EXTENSION = 5;

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
/** Parity pattern of the left half, selected by the first (implicit) digit. */
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Computes the GS1 mod-10 check digit for the first 12 digits of an EAN-13. */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error(`Expected 12 digits, got "${first12}"`);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = first12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export type Ean13Validation =
  | { valid: true; digits: string }
  | { valid: false; reason: "format"; message: string }
  | { valid: false; reason: "checkDigit"; digits: string; expected: number; actual: number; message: string };

/**
 * Validates an EAN-13 value. A 12-digit value is treated as missing its check
 * digit, which is computed and appended.
 */
export function validateEan13(value: string): Ean13Validation {
  const v = String(value).trim();
  if (/^\d{12}$/.test(v)) return { valid: true, digits: v + ean13CheckDigit(v) };
  if (!/^\d{13}$/.test(v)) {
    return { valid: false, reason: "format", message: `EAN-13 value must be 12 or 13 digits, got "${v}"` };
  }
  const expected = ean13CheckDigit(v.slice(0, 12));
  const actual = Number(v[12]);
  if (expected !== actual) {
    return {
      valid: false,
      reason: "checkDigit",
      digits: v,
      expected,
      actual,
      message: `EAN-13 check digit is ${actual}, expected ${expected} for ${v.slice(0, 12)}`,
    };
  }
  return { valid: true, digits: v };
}

export interface Ean13Bar {
  /** Left edge, in modules from the start of the symbol (excluding quiet zone). */
  x: number;
  /** Width in modules. */
  width: number;
  /** Guard bars extend below the data bars. */
  guard: boolean;
}

export interface Ean13Encoding {
  digits: string;
  /** 95 characters of "1" (bar) and "0" (space). */
  modules: string;
  bars: Ean13Bar[];
}

/**
 * Encodes 13 digits (or 12, with the check digit computed) into modules.
 * Encodes whatever digits it is given, even with a wrong check digit, so a
 * faulty value can still be previewed; use `validateEan13` to check it.
 */
export function encodeEan13(value: string): Ean13Encoding {
  let digits = String(value).trim();
  if (/^\d{12}$/.test(digits)) digits += ean13CheckDigit(digits);
  if (!/^\d{13}$/.test(digits)) throw new Error(`EAN-13 value must be 12 or 13 digits, got "${value}"`);

  const d = [...digits].map(Number);
  const parity = PARITY[d[0]!]!;
  let modules = "101";
  const guardRanges: Array<[number, number]> = [[0, 3]];
  for (let i = 1; i <= 6; i++) modules += (parity[i - 1] === "L" ? L : G)[d[i]!]!;
  guardRanges.push([modules.length, modules.length + 5]);
  modules += "01010";
  for (let i = 7; i <= 12; i++) modules += R[d[i]!]!;
  guardRanges.push([modules.length, modules.length + 3]);
  modules += "101";

  const bars: Ean13Bar[] = [];
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === "1") {
      let j = i;
      while (j < modules.length && modules[j] === "1") j++;
      const guard = guardRanges.some(([a, b]) => i >= a && i < b);
      bars.push({ x: i, width: j - i, guard });
      i = j;
    } else i++;
  }
  return { digits, modules, bars };
}

export interface Ean13Geometry {
  /** X-dimension in mm. */
  x: number;
  quietLeft: number;
  quietRight: number;
  /** Width of bars only (95 modules), in mm. */
  barsWidth: number;
  /** Full width including both quiet zones, in mm. */
  totalWidth: number;
  /** Height of the data bars, in mm. */
  barHeight: number;
  /** Height of the guard bars, in mm. */
  guardHeight: number;
  /** Total height including human-readable digits, in mm. */
  totalHeight: number;
  /** Font size for the human-readable digits, in mm. */
  hriFontSize: number;
  /** Baseline of the human-readable digits from the top of the symbol, in mm. */
  hriBaseline: number;
}

/** Physical dimensions of an EAN-13 symbol at a given magnification (1 = 100%). */
export function ean13Geometry(magnification = 1): Ean13Geometry {
  const x = EAN13_X_NOMINAL_MM * magnification;
  const barHeight = EAN13_BAR_HEIGHT_MM * magnification;
  const totalHeight = EAN13_TOTAL_HEIGHT_MM * magnification;
  return {
    x,
    quietLeft: EAN13_QUIET_LEFT * x,
    quietRight: EAN13_QUIET_RIGHT * x,
    barsWidth: EAN13_MODULES * x,
    totalWidth: (EAN13_QUIET_LEFT + EAN13_MODULES + EAN13_QUIET_RIGHT) * x,
    barHeight,
    guardHeight: barHeight + EAN13_GUARD_EXTENSION * x,
    totalHeight,
    hriFontSize: 8 * x,
    hriBaseline: totalHeight - 0.6 * x,
  };
}

/** Centre x (mm, from the left edge of the quiet zone) of each human-readable digit. */
export function ean13HriPositions(g: Ean13Geometry): number[] {
  const start = g.quietLeft;
  const positions = [g.quietLeft - 4 * g.x];
  for (let i = 0; i < 6; i++) positions.push(start + (3 + 7 * i + 3.5) * g.x);
  for (let i = 0; i < 6; i++) positions.push(start + (50 + 7 * i + 3.5) * g.x);
  return positions;
}
