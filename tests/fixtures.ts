import type { BarcodeNode, PanelNode, PreflightDocument, PreflightNode, TextNode } from "../src/core.js";
import { ean13Geometry } from "../src/core.js";

export const inks = {
  black: { cmyk: [0, 0, 0, 100] as const, preview: "#000000" },
  brand: { cmyk: [0, 90, 80, 5] as const, preview: "#d42a2a" },
};

export function doc(nodes: PreflightNode[], extra: Partial<PreflightDocument> = {}, artboard: Partial<PreflightDocument["artboard"]> = {}): PreflightDocument {
  return {
    artboard: { id: "label", trim: [120, 80], bleed: 3, safe: 4, largestSurfaceCm2: 96, ...artboard },
    inks,
    maxInks: 2,
    nodes,
    ...extra,
  };
}

export function text(over: Partial<TextNode> = {}): TextNode {
  return {
    id: "back/MandatoryText[name]",
    kind: "text",
    component: "MandatoryText",
    panel: "back",
    bbox: { x: 64, y: 8, width: 40, height: 4 },
    inks: ["black"],
    mandatory: true,
    xHeightMm: 1.4,
    fontSizeMm: 2.6,
    xHeightRatio: 0.54,
    ...over,
  };
}

export function panel(over: Partial<PanelNode> = {}): PanelNode {
  const rect = over.rect ?? { x: 62, y: 6, width: 54, height: 68 };
  return { id: "back", kind: "panel", component: "Panel", name: "back", rect, bbox: rect, inks: [], ...over };
}

/** EAN-13 node placed with the left edge of its quiet zone at (x, y). */
export function barcode(x = 66, y = 40, over: Partial<BarcodeNode> = {}, magnification = 0.9): BarcodeNode {
  const g = ean13Geometry(magnification);
  const bars = { x: x + g.quietLeft, y, width: g.barsWidth, height: g.guardHeight };
  return {
    id: "back/Barcode",
    kind: "barcode",
    component: "Barcode",
    panel: "back",
    symbology: "ean13",
    value: "4006381333931",
    magnification,
    xDimensionMm: g.x,
    bbox: { x: bars.x - 6 * g.x, y, width: bars.width + 6 * g.x, height: g.totalHeight },
    barsRect: bars,
    quietZones: {
      left: { x, y, width: g.quietLeft, height: g.guardHeight },
      right: { x: bars.x + bars.width, y, width: g.quietRight, height: g.guardHeight },
    },
    inks: ["black"],
    ...over,
  };
}
