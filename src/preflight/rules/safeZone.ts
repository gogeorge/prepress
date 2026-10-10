import { formatMm } from "../../units/index.js";
import { inset, overhang, trimRect } from "../geometry.js";
import type { PreflightRule, RuleFinding } from "../types.js";

export const safeZoneRule: PreflightRule = {
  id: "safeZone",
  description: "No text or barcode between the safe margin and the trim edge.",
  check(doc) {
    const { safe } = doc.artboard;
    const trim = trimRect(doc.artboard.trim);
    const safeArea = inset(trim, safe);
    const out: RuleFinding[] = [];
    for (const n of doc.nodes) {
      if (n.kind !== "text" && n.kind !== "barcode") continue;
      if (n.kind === "text" && n.empty) continue;
      const o = overhang(n.bbox, safeArea);
      const parts: string[] = [];
      const edge = { left: n.bbox.x, top: n.bbox.y, right: trim.width - n.bbox.x - n.bbox.width, bottom: trim.height - n.bbox.y - n.bbox.height };
      for (const side of ["left", "top", "right", "bottom"] as const) {
        if (o[side] > 0.005) parts.push(`${formatMm(edge[side])} from the ${side} trim edge`);
      }
      if (parts.length) {
        out.push({
          level: "error",
          node: n.id,
          bbox: n.bbox,
          message: `Content is ${parts.join(" and ")}; keep at least ${formatMm(safe, 1)} (safe margin).`,
        });
      }
    }
    return out;
  },
};
