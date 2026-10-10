/**
 * Display list produced by the render stage of the export pipeline.
 * All coordinates are in mm, origin at the top-left of the trim, y down.
 */

export interface FontRef {
  /** CSS font-family stack as rendered. */
  family: string;
  weight: number;
  italic: boolean;
}

export interface RectPrimitive {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ink name. */
  fill: string;
}

export interface TextPrimitive {
  kind: "text";
  text: string;
  x: number;
  /** Baseline position. */
  baseline: number;
  /** Font size in mm. */
  fontSize: number;
  font: FontRef;
  /** Ink name, or a raw CSS colour when the text did not use a declared ink. */
  fill: string;
  /** Measured on-screen width; the writer scales glyphs horizontally to match it. */
  width?: number;
  /** "center" places `x` at the centre of the text. */
  align?: "left" | "center";
  underline?: boolean;
}

export interface LinePrimitive {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
  stroke: string;
}

export interface CirclePrimitive {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
  stroke: string;
  strokeWidth: number;
}

export type Primitive = RectPrimitive | TextPrimitive | LinePrimitive | CirclePrimitive;
