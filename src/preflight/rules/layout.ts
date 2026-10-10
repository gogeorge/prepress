import { formatMm } from "../../units/index.js";
import { overhang } from "../geometry.js";
import type { PanelNode, PreflightRule, RuleFinding } from "../types.js";

export const overflowRule: PreflightRule = {
  id: "layout.overflow",
  description: "Text and barcodes must fit inside their panel, and text must fit inside its own box.",
  check(doc) {
    const panels = new Map<string, PanelNode>();
    for (const n of doc.nodes) if (n.kind === "panel") panels.set((n as PanelNode).name, n as PanelNode);
    const out: RuleFinding[] = [];
    for (const n of doc.nodes) {
      if (n.kind !== "text" && n.kind !== "barcode") continue;
      if (n.kind === "text" && n.empty) continue;
      const panel = n.panel !== undefined ? panels.get(n.panel) : undefined;
      if (panel) {
        const o = overhang(n.bbox, panel.rect);
        const worst = Object.entries(o).filter(([, v]) => v > 0.05);
        if (worst.length) {
          out.push({
            level: "error",
            node: n.id,
            bbox: n.bbox,
            message: `Extends beyond panel "${panel.name}" by ${worst.map(([s, v]) => `${formatMm(v)} (${s})`).join(", ")}.`,
          });
          continue;
        }
      }
      if (n.kind === "text" && n.overflowMm !== undefined && n.overflowMm > 0.05) {
        out.push({
          level: "error",
          node: n.id,
          bbox: n.bbox,
          message: `Text overflows its box by ${formatMm(n.overflowMm)} even at the smallest allowed size; shorten the text or enlarge the box.`,
        });
      }
    }
    return out;
  },
};

export const missingContentRule: PreflightRule = {
  id: "content.missing",
  description: "Mandatory text must not be empty, and every list item must have a translation for the label's locale.",
  check(doc) {
    const out: RuleFinding[] = [];
    for (const n of doc.nodes) {
      if (n.kind !== "text") continue;
      if (n.mandatory && n.empty) {
        out.push({ level: "error", node: n.id, bbox: n.bbox, message: "Mandatory text is empty." });
      }
      if (n.missingTranslations?.length) {
        out.push({
          level: "error",
          node: n.id,
          bbox: n.bbox,
          message: `No "${n.locale ?? "?"}" translation for: ${n.missingTranslations.join(", ")}.`,
        });
      }
    }
    return out;
  },
};
