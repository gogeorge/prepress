"use client";

import { inkForColor, parseColor, PAPER } from "../inks/index.js";
import { collectBackgrounds, collectTextRuns, type TextRun } from "../measure/text.js";
import { describeFont } from "../measure/metrics.js";
import { union } from "../preflight/geometry.js";
import type { TextNode } from "../preflight/types.js";
import type { Primitive } from "../export/types.js";
import { mmToPt } from "../units/index.js";
import type { MeasureEnv, MeasuredNode } from "./context.js";

export interface TextNodeOptions {
  component: string;
  panel: string | undefined;
  ink: string;
  /** Colour the component applied for `ink` (its preview). */
  appliedColor: string;
  mandatory: boolean;
  role?: string;
  overflowMm?: number;
  missingTranslations?: string[];
  locale?: string;
}

function sameColor(a: string, b: string) {
  const x = parseColor(a);
  const y = parseColor(b);
  return !!x && !!y && x.every((v, i) => Math.abs(v - y[i]!) <= 1);
}

/** Measures a text component's DOM into a preflight TextNode. */
export function measureTextNode(el: Element, env: MeasureEnv, o: TextNodeOptions): MeasuredNode {
  const runs = collectTextRuns(el, env.toMm);
  const bbox = union(runs.map((r) => r.rect)) ?? env.toMm(el.getBoundingClientRect());
  const inks = new Set<string>([o.ink]);
  const undeclared = new Set<string>();
  for (const r of runs) {
    const ink = inkForColor(r.color, env.inks);
    if (ink) inks.add(ink);
    else if (!sameColor(r.color, o.appliedColor)) undeclared.add(r.color);
  }
  for (const bg of collectBackgrounds(el)) {
    const ink = inkForColor(bg, env.inks);
    // Backgrounds inside text components are not exported; only Panel backgrounds print.
    undeclared.add(ink && ink !== PAPER ? `${bg} (background inside text; use a Panel background)` : bg);
  }

  let smallest: TextRun | undefined;
  let measurable = runs.length > 0;
  for (const r of runs) {
    if (!r.metrics) {
      measurable = false;
      continue;
    }
    if (!smallest || r.metrics.xHeightRatio * r.fontSizeMm < smallest.metrics!.xHeightRatio * smallest.fontSizeMm) smallest = r;
  }

  const node: TextNode = {
    id: "",
    kind: "text",
    component: o.component,
    bbox,
    inks: [...inks],
    mandatory: o.mandatory,
    xHeightMm: measurable && smallest ? smallest.metrics!.xHeightRatio * smallest.fontSizeMm : null,
    fontSizeMm: smallest?.fontSizeMm ?? null,
    xHeightRatio: smallest?.metrics?.xHeightRatio ?? null,
    empty: runs.length === 0,
  };
  if (smallest) node.font = `${describeFont(smallest.family, mmToPt(smallest.fontSizeMm), smallest.weight)}, x-height from ${smallest.metrics!.xHeightSource}`;
  if (o.panel !== undefined) node.panel = o.panel;
  if (undeclared.size) node.undeclaredColors = [...undeclared];
  if (o.role !== undefined) node.role = o.role;
  if (o.overflowMm !== undefined) node.overflowMm = o.overflowMm;
  if (o.missingTranslations?.length) node.missingTranslations = o.missingTranslations;
  if (o.locale !== undefined) node.locale = o.locale;
  const { id: _id, ...rest } = node;
  return rest;
}

/** Converts a text component's DOM into vector text primitives for export. */
export function paintText(el: Element, env: MeasureEnv): Primitive[] {
  return collectTextRuns(el, env.toMm).map((r) => ({
    kind: "text" as const,
    text: r.text,
    x: r.rect.x,
    baseline: r.baseline,
    fontSize: r.fontSizeMm,
    font: { family: r.family, weight: r.weight, italic: r.italic },
    fill: inkForColor(r.color, env.inks) ?? r.color,
    width: r.rect.width,
    underline: r.underline,
  }));
}

/** Builds the issue identifier for a component inside a panel. */
export function nodeId(panel: string | undefined, component: string, qualifier?: string): string {
  return `${panel ? panel + "/" : ""}${component}${qualifier ? `[${qualifier}]` : ""}`;
}
