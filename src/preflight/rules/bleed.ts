import { formatMm } from "../../units/index.js";
import { EPSILON_MM } from "../geometry.js";
import type { PanelNode, PreflightRule, RuleFinding } from "../types.js";

/** Background edges closer than this to the trim, without reaching it, risk a sliver after cutting. */
export const BLEED_SLIVER_MM = 1;

export const bleedRule: PreflightRule = {
  id: "bleed",
  description: "Backgrounds that touch the trim edge must extend to the full bleed.",
  check(doc) {
    const [w, h] = doc.artboard.trim;
    const b = doc.artboard.bleed;
    const out: RuleFinding[] = [];
    for (const n of doc.nodes) {
      if (n.kind !== "panel" || !(n as PanelNode).background) continue;
      const bg = (n as PanelNode).background!;
      const r = bg.rect;
      // Distance of each painted edge from the trim edge, positive = outside the trim.
      const sides = {
        left: -r.x,
        top: -r.y,
        right: r.x + r.width - w,
        bottom: r.y + r.height - h,
      };
      for (const [side, beyond] of Object.entries(sides)) {
        if (beyond >= -EPSILON_MM && beyond < b - EPSILON_MM) {
          out.push({
            level: "error",
            node: n.id,
            bbox: r,
            message: `Background touches the ${side} trim edge but extends only ${formatMm(Math.max(0, beyond))} past it; extend it to the full ${formatMm(b, 1)} bleed.`,
          });
        } else if (beyond < -EPSILON_MM && beyond > -BLEED_SLIVER_MM) {
          out.push({
            level: "warn",
            node: n.id,
            bbox: r,
            message: `Background stops ${formatMm(-beyond)} short of the ${side} trim edge; cutting tolerance may leave a visible sliver. Extend it into the bleed or move it at least ${formatMm(BLEED_SLIVER_MM, 0)} in.`,
          });
        }
      }
    }
    return out;
  },
};
