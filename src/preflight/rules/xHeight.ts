import { formatMm, mmToPt, round } from "../../units/index.js";
import type { PreflightRule, RuleFinding, TextNode } from "../types.js";

/** Minimum x-height under EU Regulation 1169/2011, Article 13(2) and (3). */
export function minXHeightMm(largestSurfaceCm2: number | undefined): number {
  return largestSurfaceCm2 !== undefined && largestSurfaceCm2 < 80 ? 0.9 : 1.2;
}

export const xHeightRule: PreflightRule = {
  id: "eu1169.xHeight",
  description:
    "Mandatory text x-height must be at least 1.2 mm, or 0.9 mm when the largest surface is under 80 cm² (EU 1169/2011, Art. 13).",
  check(doc) {
    const surface = doc.artboard.largestSurfaceCm2;
    const required = minXHeightMm(surface);
    const basis =
      surface === undefined
        ? "largestSurfaceCm2 not set, assuming ≥ 80 cm²"
        : `largest surface ${surface} cm² ${surface < 80 ? "<" : "≥"} 80 cm²`;
    const out: RuleFinding[] = [];
    for (const n of doc.nodes) {
      if (n.kind !== "text" || !n.mandatory || n.empty) continue;
      const t = n as TextNode;
      if (t.xHeightMm === null) {
        out.push({ level: "warn", node: t.id, bbox: t.bbox, message: "Could not measure the x-height of this text; check it manually." });
        continue;
      }
      if (t.xHeightMm < required - 1e-6) {
        const font = t.font ? ` (${t.font})` : "";
        const suggestion =
          t.xHeightRatio && t.xHeightRatio > 0
            ? ` Use at least ${round(Math.ceil(mmToPt(required / t.xHeightRatio) * 10) / 10, 1)} pt in this font.`
            : "";
        out.push({
          level: "error",
          node: t.id,
          bbox: t.bbox,
          message: `x-height ${formatMm(t.xHeightMm)}${font} is below the ${formatMm(required, 1)} minimum (${basis}).${suggestion}`,
        });
      }
    }
    return out;
  },
};
