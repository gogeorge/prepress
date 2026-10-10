import { PAPER } from "../../inks/index.js";
import type { PreflightRule, RuleFinding } from "../types.js";

export const inkLimitRule: PreflightRule = {
  id: "inkLimit",
  description: "Number of distinct inks used must not exceed maxInks; every colour must be a declared ink.",
  check(doc) {
    const out: RuleFinding[] = [];
    const used = new Set<string>();
    for (const n of doc.nodes) {
      for (const ink of n.inks) {
        if (ink === PAPER) continue;
        if (!(ink in doc.inks)) {
          out.push({ level: "error", node: n.id, bbox: n.bbox, message: `Ink "${ink}" is not declared in the InkProvider.` });
          continue;
        }
        used.add(ink);
      }
      for (const color of n.undeclaredColors ?? []) {
        out.push({
          level: "error",
          node: n.id,
          bbox: n.bbox,
          message: `Colour ${color} does not match any declared ink; reference inks by name instead of raw colours.`,
        });
      }
    }
    if (doc.maxInks !== undefined && used.size > doc.maxInks) {
      out.push({
        level: "error",
        node: doc.artboard.id,
        message: `${used.size} inks used (${[...used].join(", ")}); the limit is ${doc.maxInks}.`,
      });
    }
    return out;
  },
};
