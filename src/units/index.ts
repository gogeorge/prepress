/**
 * Unit conversion. All internal geometry is in millimetres; everything else
 * converts at the boundary through this module.
 */

export type Unit = "mm" | "pt" | "in" | "px";

/** Millimetres per inch. */
export const MM_PER_INCH = 25.4;
/** PostScript points per inch. */
export const PT_PER_INCH = 72;
/** CSS reference pixels per inch. */
export const CSS_PX_PER_INCH = 96;

const MM_PER_UNIT: Record<Unit, number> = {
  mm: 1,
  pt: MM_PER_INCH / PT_PER_INCH,
  in: MM_PER_INCH,
  px: MM_PER_INCH / CSS_PX_PER_INCH,
};

/** Converts `value` in `unit` to millimetres. `dpi` only applies to `px`. */
export function toMm(value: number, unit: Unit = "mm", dpi: number = CSS_PX_PER_INCH): number {
  if (unit === "px") return (value * MM_PER_INCH) / dpi;
  return value * MM_PER_UNIT[unit];
}

/** Converts `mm` to `unit`. `dpi` only applies to `px`. */
export function fromMm(mm: number, unit: Unit = "mm", dpi: number = CSS_PX_PER_INCH): number {
  if (unit === "px") return (mm * dpi) / MM_PER_INCH;
  return mm / MM_PER_UNIT[unit];
}

/** Converts between any two units. */
export function convert(value: number, from: Unit, to: Unit): number {
  return fromMm(toMm(value, from), to);
}

export const mmToPt = (mm: number): number => fromMm(mm, "pt");
export const ptToMm = (pt: number): number => toMm(pt, "pt");
export const mmToPx = (mm: number, dpi: number = CSS_PX_PER_INCH): number => fromMm(mm, "px", dpi);
export const pxToMm = (px: number, dpi: number = CSS_PX_PER_INCH): number => toMm(px, "px", dpi);

/** Rounds to a fixed number of decimals, for messages and comparisons. */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Formats a length in mm for human-readable messages, e.g. "1.08 mm". */
export function formatMm(mm: number, decimals = 2): string {
  return `${round(mm, decimals)} mm`;
}
