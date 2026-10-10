/**
 * Pure logic with no React and no DOM access: unit conversion, inks, EAN-13
 * encoding, the preflight engine and rules, and the DOM-free export stages.
 * Safe to import from React Server Components and Node.
 */
export { convert, CSS_PX_PER_INCH, formatMm, fromMm, MM_PER_INCH, mmToPt, mmToPx, PT_PER_INCH, ptToMm, pxToMm, round, toMm } from "./units/index.js";
export type { Unit } from "./units/index.js";

export {
  DEFAULT_INKS,
  inkForColor,
  isTransparent,
  PAPER,
  PAPER_INK,
  parseColor,
  REGISTRATION,
  REGISTRATION_INK,
  resolveInk,
  validateInks,
} from "./inks/index.js";
export type { Cmyk, Ink, InkMap, ProcessInk, Rgb } from "./inks/index.js";

export {
  EAN13_BAR_HEIGHT_MM,
  EAN13_GUARD_EXTENSION,
  EAN13_MODULES,
  EAN13_QUIET_LEFT,
  EAN13_QUIET_RIGHT,
  EAN13_TOTAL_HEIGHT_MM,
  EAN13_X_MAX_MM,
  EAN13_X_MIN_MM,
  EAN13_X_NOMINAL_MM,
  ean13CheckDigit,
  ean13Geometry,
  ean13HriPositions,
  encodeEan13,
  validateEan13,
} from "./barcode/ean13.js";
export type { Ean13Bar, Ean13Encoding, Ean13Geometry, Ean13Validation } from "./barcode/ean13.js";

export { atLeast, defineRule, PreflightError, runPreflight } from "./preflight/engine.js";
export { bottom, EPSILON_MM, inset, intersect, overhang, rect, right, trimRect, union } from "./preflight/geometry.js";
export {
  BLEED_SLIVER_MM,
  bleedRule,
  checkDigitRule,
  defaultRules,
  inkLimitRule,
  minXHeightMm,
  missingContentRule,
  overflowRule,
  quietZoneRule,
  safeZoneRule,
  xDimensionRule,
  xHeightRule,
} from "./preflight/rules/index.js";
export { createPreflightStore, defaultPreflightStore } from "./preflight/store.js";
export type { PreflightStore } from "./preflight/store.js";
export type {
  ArtboardSpec,
  BarcodeNode,
  CustomNode,
  Issue,
  Level,
  PanelNode,
  PreflightDocument,
  PreflightNode,
  PreflightRule,
  Rect,
  RuleFinding,
  TextNode,
} from "./preflight/types.js";

export { buildMarks, resolveMarks } from "./export/marks.js";
export type { MarksOptions, ResolvedMarks } from "./export/marks.js";
export { applyColorPass, cmykColorPass, rgbColorPass } from "./export/color.js";
export type { ColoredPrimitive, ColorPass, DeviceColor } from "./export/color.js";
export { writePDF } from "./export/exportPDF.js";
export type { ExportPDFOptions, ExportResult, ExportSource, WritePDFOptions } from "./export/exportPDF.js";
export type { CirclePrimitive, FontRef, LinePrimitive, Primitive, RectPrimitive, TextPrimitive } from "./export/types.js";

export { registerFont, xHeightRatioOf } from "./measure/fonts.js";
export type { FontSource, LoadedFont } from "./measure/fonts.js";
