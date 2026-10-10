import {
  EAN13_QUIET_LEFT,
  EAN13_QUIET_RIGHT,
  EAN13_X_MAX_MM,
  EAN13_X_MIN_MM,
  EAN13_X_NOMINAL_MM,
  validateEan13,
} from "../../barcode/ean13.js";
import { formatMm, round } from "../../units/index.js";
import { intersect, trimRect } from "../geometry.js";
import type { BarcodeNode, PreflightNode, PreflightRule, Rect, RuleFinding } from "../types.js";

const barcodes = (nodes: PreflightNode[]): BarcodeNode[] =>
  nodes.filter((n): n is BarcodeNode => n.kind === "barcode" && n.symbology === "ean13");

export const xDimensionRule: PreflightRule = {
  id: "gs1.xDimension",
  description: `EAN-13 X-dimension must be between ${EAN13_X_MIN_MM} mm and ${EAN13_X_MAX_MM} mm (${EAN13_X_NOMINAL_MM} mm = 100% magnification).`,
  check(doc) {
    const out: RuleFinding[] = [];
    for (const b of barcodes(doc.nodes)) {
      const x = b.xDimensionMm;
      if (x < EAN13_X_MIN_MM - 1e-6 || x > EAN13_X_MAX_MM + 1e-6) {
        out.push({
          level: "error",
          node: b.id,
          bbox: b.bbox,
          message: `X-dimension ${formatMm(x, 3)} (${round(x / EAN13_X_NOMINAL_MM * 100, 0)}% magnification) is outside ${EAN13_X_MIN_MM}–${EAN13_X_MAX_MM} mm (80–200%).`,
        });
      }
    }
    return out;
  },
};

export const quietZoneRule: PreflightRule = {
  id: "gs1.quietZone",
  description: "EAN-13 needs a quiet zone of at least 11X on the left and 7X on the right, inside the trim, with nothing intruding.",
  check(doc) {
    const out: RuleFinding[] = [];
    const trim = trimRect(doc.artboard.trim);
    for (const b of barcodes(doc.nodes)) {
      const sides: Array<[string, Rect, number, number]> = [
        ["left", b.quietZones.left, EAN13_QUIET_LEFT, EAN13_QUIET_LEFT * b.xDimensionMm],
        ["right", b.quietZones.right, EAN13_QUIET_RIGHT, EAN13_QUIET_RIGHT * b.xDimensionMm],
      ];
      for (const [side, zone, modules, required] of sides) {
        const visible = intersect(zone, trim);
        const available = visible ? Math.min(visible.width, zone.width) : 0;
        if (available < required - 0.005) {
          out.push({
            level: "error",
            node: b.id,
            bbox: zone,
            message: `${side === "left" ? "Left" : "Right"} quiet zone is ${formatMm(available)} inside the trim; needs ${formatMm(required)} (${modules}X).`,
          });
        }
        for (const other of doc.nodes) {
          if (other === b || other.kind === "panel") continue;
          const hit = intersect(zone, other.bbox);
          if (hit) {
            out.push({
              level: "error",
              node: b.id,
              bbox: hit,
              message: `"${other.id}" intrudes ${formatMm(hit.width)} into the ${side} quiet zone (${modules}X = ${formatMm(required)} must stay clear).`,
            });
          }
        }
      }
    }
    return out;
  },
};

export const checkDigitRule: PreflightRule = {
  id: "gs1.checkDigit",
  description: "EAN-13 value must be 13 digits with a valid GS1 check digit (12 digits get one computed).",
  check(doc) {
    const out: RuleFinding[] = [];
    for (const b of barcodes(doc.nodes)) {
      const v = validateEan13(b.value);
      if (!v.valid) out.push({ level: "error", node: b.id, bbox: b.bbox, message: v.message + "." });
    }
    return out;
  },
};
