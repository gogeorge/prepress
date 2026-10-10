import type { InkMap } from "../inks/index.js";

export type Level = "error" | "warn";

/** Axis-aligned rectangle in mm. Origin is the top-left corner of the trim; y grows downwards. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Issue {
  level: Level;
  /** Rule id, e.g. "eu1169.xHeight". */
  rule: string;
  /** Identifier of the component that caused the issue, e.g. "back/MandatoryText[name]". */
  node: string;
  /** Human-readable message including measured and required values. */
  message: string;
  /** Id of the artboard the issue belongs to. */
  artboard?: string;
  /** Area of the artboard the issue refers to, in mm. */
  bbox?: Rect;
}

export interface ArtboardSpec {
  id: string;
  /** Trim size [width, height] in mm. */
  trim: readonly [number, number];
  /** Bleed beyond the trim on every side, in mm. */
  bleed: number;
  /** Safe margin inside the trim on every side, in mm. */
  safe: number;
  /** Area of the largest surface of the package, in cm². Selects the x-height minimum. */
  largestSurfaceCm2?: number;
}

interface NodeBase {
  /** Unique identifier used in issues. */
  id: string;
  /** Component that produced the node, e.g. "MandatoryText". */
  component: string;
  /** Name of the enclosing Panel, if any. */
  panel?: string;
  /** Extent of the printed content, in mm. */
  bbox: Rect;
  /** Names of the inks the node prints with. */
  inks: string[];
  /** Rendered colours that do not match any declared ink. */
  undeclaredColors?: string[];
}

export interface PanelNode extends NodeBase {
  kind: "panel";
  name: string;
  rect: Rect;
  /** Filled background, with its painted extent (which may reach into the bleed). */
  background?: { ink: string; rect: Rect };
}

export interface TextNode extends NodeBase {
  kind: "text";
  /** Text that is legally required; subject to minimum x-height checks. */
  mandatory: boolean;
  role?: string;
  /** Smallest measured x-height across all text runs, in mm. Null when it could not be measured. */
  xHeightMm: number | null;
  /** Font size of the run with the smallest x-height, in mm. */
  fontSizeMm: number | null;
  /** x-height divided by font size for that run. */
  xHeightRatio: number | null;
  /** Description of the font of that run, for messages. */
  font?: string;
  /** How far the content overflows its own box, in mm. */
  overflowMm?: number;
  /** True when the node renders no text. */
  empty?: boolean;
  /** Content items that have no translation for the requested locale. */
  missingTranslations?: string[];
  locale?: string;
}

export interface BarcodeNode extends NodeBase {
  kind: "barcode";
  symbology: "ean13";
  value: string;
  magnification: number;
  /** Narrowest module width, in mm. */
  xDimensionMm: number;
  /** Bars only, in mm. */
  barsRect: Rect;
  /** Quiet zones as reserved by the component (full required width), in mm. */
  quietZones: { left: Rect; right: Rect };
}

/** Node type for consumer-defined components checked by custom rules. */
export interface CustomNode extends NodeBase {
  kind: `custom:${string}`;
  data?: Record<string, unknown>;
}

export type PreflightNode = PanelNode | TextNode | BarcodeNode | CustomNode;

/** Everything a rule can inspect. Plain data: rules never touch the DOM. */
export interface PreflightDocument {
  artboard: ArtboardSpec;
  inks: InkMap;
  maxInks?: number;
  nodes: PreflightNode[];
}

export interface RuleFinding {
  level: Level;
  node: string;
  message: string;
  bbox?: Rect;
}

export interface PreflightRule {
  /** Unique id, used as `Issue.rule`. Namespace custom rules, e.g. "acme.logoSize". */
  id: string;
  description: string;
  check(doc: PreflightDocument): RuleFinding[];
}
