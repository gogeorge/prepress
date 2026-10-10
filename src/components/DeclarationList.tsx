"use client";

import { Fragment, useContext, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fontMetrics } from "../measure/metrics.js";
import { mmToPt } from "../units/index.js";
import { ArtboardContext, PanelContext, useArtboardNode, useFontsVersion, useIsoLayoutEffect } from "./context.js";
import { HEADINGS } from "./declarationHeadings.js";
import { measureTextNode, nodeId, paintText } from "./textNode.js";
import { useInks } from "./useInks.js";

/** A plain string, or translations keyed by locale ("en", "de", "pt-BR", ...). */
export type LocalizedString = string | Readonly<Record<string, string>>;

export interface DeclarationItem {
  name: LocalizedString;
  /**
   * Emphasise this item: `true` for the whole name, or the part of the name
   * to emphasise (e.g. the allergen "milk" in "skimmed milk powder").
   */
  highlight?: boolean | LocalizedString;
  /** Percentage, printed after the name (e.g. QUID for food, fibre share for textiles). */
  percent?: number;
  /** Components of a compound item, printed in parentheses. */
  children?: readonly DeclarationItem[];
}

export type HighlightStyle = "bold" | "uppercase" | "underline" | "bold-uppercase";

export interface DeclarationListProps {
  items: readonly DeclarationItem[];
  /** Locale to render, e.g. "de" or "de-AT". */
  locale: string;
  /** Locale to fall back to when an item has no translation (still reported by preflight). */
  fallbackLocale?: string;
  /** Built-in localised heading: "ingredients", "composition", or "none" (default). */
  preset?: "ingredients" | "composition" | "none";
  /** Heading text; overrides the preset. `false` for no heading. */
  heading?: LocalizedString | false;
  /** How highlighted items are emphasised. Default "bold". */
  highlightStyle?: HighlightStyle;
  /** "shrink" reduces the font size until the list fits its box, never below the legal minimum. Default "none". */
  fit?: "none" | "shrink";
  /** Font size in points. Default 8. */
  size?: number;
  /** Smallest size `fit="shrink"` may use, in points. The legal minimum always applies as well. */
  minSize?: number;
  /** Ink name. Default: the InkProvider's default ink. */
  ink?: string;
  fontFamily?: string;
  lineHeight?: number;
  /** Separator between items. Default ", ". */
  separator?: string;
  /** Text after the last item. Default ".". */
  terminator?: string;
  /** Subject to the legal x-height minimum. Default true. */
  mandatory?: boolean;
  /** Used in issue identifiers. Default: the preset, or "list". */
  role?: string;
  /** Overrides the identifier used in issues. */
  name?: string;
  className?: string;
  style?: CSSProperties;
}

function baseLang(locale: string) {
  return locale.toLowerCase().split(/[-_]/)[0]!;
}

/** Picks the translation for `locale` (exact, then language), else the fallback. */
export function localize(
  value: LocalizedString,
  locale: string,
  fallbackLocale?: string,
): { text: string; missing: boolean } {
  if (typeof value === "string") return { text: value, missing: false };
  const keys = Object.keys(value);
  const find = (loc: string) =>
    value[loc] ?? value[keys.find((k) => k.toLowerCase() === loc.toLowerCase()) ?? ""] ?? value[keys.find((k) => baseLang(k) === baseLang(loc)) ?? ""];
  const hit = find(locale);
  if (hit !== undefined) return { text: hit, missing: false };
  const fb = (fallbackLocale && find(fallbackLocale)) ?? value[keys[0] ?? ""] ?? "";
  return { text: fb, missing: true };
}

function emphasise(text: string, style: HighlightStyle, locale: string, key: string): ReactNode {
  const upper = style === "uppercase" || style === "bold-uppercase";
  const t = upper ? text.toLocaleUpperCase(locale) : text;
  if (style === "bold" || style === "bold-uppercase") return <strong key={key} style={{ fontWeight: 700 }}>{t}</strong>;
  if (style === "underline") return <span key={key} style={{ textDecoration: "underline" }}>{t}</span>;
  return <Fragment key={key}>{t}</Fragment>;
}

function renderName(item: DeclarationItem, locale: string, fallback: string | undefined, style: HighlightStyle, missing: string[], key: string): ReactNode {
  const name = localize(item.name, locale, fallback);
  if (name.missing) missing.push(name.text || "(unnamed)");
  if (!item.highlight) return name.text;
  if (item.highlight === true) return emphasise(name.text, style, locale, key);
  const part = localize(item.highlight, locale, fallback).text;
  const at = part ? name.text.toLocaleLowerCase(locale).indexOf(part.toLocaleLowerCase(locale)) : -1;
  if (at < 0) return emphasise(name.text, style, locale, key);
  return (
    <Fragment key={key}>
      {name.text.slice(0, at)}
      {emphasise(name.text.slice(at, at + part.length), style, locale, "h")}
      {name.text.slice(at + part.length)}
    </Fragment>
  );
}

/**
 * A localised list of declared components: food or cosmetic ingredients,
 * textile fibre composition, detergent components and the like. Highlighted
 * items (allergens, substances of concern) are emphasised, and `fit="shrink"`
 * never goes below the legal minimum x-height.
 */
export function DeclarationList({
  items,
  locale,
  fallbackLocale,
  preset = "none",
  heading,
  highlightStyle = "bold",
  fit = "none",
  size = 8,
  minSize,
  ink,
  fontFamily,
  lineHeight = 1.2,
  separator = ", ",
  terminator = ".",
  mandatory = true,
  role,
  name,
  className,
  style,
}: DeclarationListProps) {
  const inks = useInks();
  const panel = useContext(PanelContext);
  const artboard = useContext(ArtboardContext);
  const fontsVersion = useFontsVersion();
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [resizeTick, setResizeTick] = useState(0);
  const inkName = ink ?? inks.defaultInk;
  const color = inks.preview(inkName);
  const nodeRole = role ?? (preset !== "none" ? preset : "list");
  const requiredXHeight = artboard?.minXHeightMm ?? 1.2;

  const { content, missing } = useMemo(() => {
    const missing: string[] = [];
    const list = (xs: readonly DeclarationItem[], prefix: string): ReactNode[] =>
      xs.map((item, i) => {
        const key = `${prefix}${i}`;
        const pct =
          item.percent !== undefined
            ? " " + new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(item.percent / 100)
            : "";
        return (
          <Fragment key={key}>
            {i > 0 && separator}
            {renderName(item, locale, fallbackLocale, highlightStyle, missing, key)}
            {pct}
            {item.children?.length ? (
              <>
                {" ("}
                {list(item.children, key + ".")}
                {")"}
              </>
            ) : null}
          </Fragment>
        );
      });
    let headingText: string | undefined;
    if (heading !== false) {
      const source = heading ?? (preset !== "none" ? HEADINGS[preset] : undefined);
      if (source !== undefined) {
        const h = localize(source, locale, heading === undefined ? "en" : fallbackLocale);
        if (h.missing && heading !== undefined) missing.push(`heading "${h.text}"`);
        headingText = h.text;
      }
    }
    const content = (
      <>
        {headingText && <strong style={{ fontWeight: 700 }}>{`${headingText}: `}</strong>}
        {list(items, "")}
        {items.length > 0 && terminator}
      </>
    );
    return { content, missing };
  }, [items, locale, fallbackLocale, preset, heading, highlightStyle, separator, terminator]);

  // Re-fit when the available box changes size.
  useIsoLayoutEffect(() => {
    if (fit !== "shrink" || !outerRef.current || typeof ResizeObserver === "undefined") return;
    let last = -1;
    const ro = new ResizeObserver(([e]) => {
      const h = e?.contentRect.height ?? 0;
      if (Math.abs(h - last) > 0.5) {
        last = h;
        setResizeTick((t) => t + 1);
      }
    });
    ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [fit]);

  // Shrink to fit: binary search between the legal minimum and the nominal size.
  useIsoLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    inner.style.fontSize = "";
    if (fit !== "shrink") return;
    const cs = getComputedStyle(inner);
    const ratios = [400, 700].map((w) => fontMetrics({ family: cs.fontFamily, weight: w, italic: false })?.xHeightRatio ?? 0);
    const ratio = Math.min(...ratios);
    // Without metrics we cannot know the legal minimum, so we do not shrink below the nominal size.
    const legalMinPt = ratio > 0 ? mmToPt(requiredXHeight / ratio) : size;
    const min = Math.min(size, Math.max(legalMinPt, minSize ?? 0));
    const fits = () => inner.offsetHeight <= outer.clientHeight + 0.5;
    const set = (pt: number) => (inner.style.fontSize = `${pt}pt`);
    set(size);
    if (fits()) return;
    let lo = min;
    let hi = size;
    set(lo);
    if (!fits()) return;
    while (hi - lo > 0.05) {
      const mid = (lo + hi) / 2;
      set(mid);
      if (fits()) lo = mid;
      else hi = mid;
    }
    set(lo);
  }, [content, fit, size, minSize, requiredXHeight, fontsVersion, resizeTick, fontFamily, lineHeight]);

  useArtboardNode({
    baseId: () => name ?? nodeId(panel?.name, "DeclarationList", nodeRole),
    element: () => outerRef.current,
    measure: (env) => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return null;
      const o: Parameters<typeof measureTextNode>[2] = {
        component: "DeclarationList",
        panel: panel?.name,
        ink: inkName,
        appliedColor: color,
        mandatory,
        role: nodeRole,
        missingTranslations: missing,
        locale,
      };
      if (fit === "shrink") {
        const overflow = env.toMm(inner.getBoundingClientRect()).height - env.toMm(outer.getBoundingClientRect()).height;
        o.overflowMm = Math.max(0, overflow);
      }
      return measureTextNode(inner, env, o);
    },
    paint: (env) => (innerRef.current ? paintText(innerRef.current, env) : []),
  });

  return (
    <div
      ref={outerRef}
      className={className}
      data-prepress-node="DeclarationList"
      style={{
        color,
        fontSize: `${size}pt`,
        fontFamily,
        lineHeight,
        ...(fit === "shrink" ? { flex: "1 1 0%", minHeight: 0 } : null),
        ...style,
      }}
    >
      <div ref={innerRef} lang={locale}>
        {content}
      </div>
    </div>
  );
}

