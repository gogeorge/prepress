"use client";

import { createElement, useContext, useRef, type CSSProperties, type ReactNode } from "react";
import { PanelContext, useArtboardNode, useFontsVersion } from "./context.js";
import { measureTextNode, nodeId, paintText } from "./textNode.js";
import { useInks } from "./useInks.js";

export interface MandatoryTextProps {
  children?: ReactNode;
  /** What the text is, e.g. "name", "netQuantity", "bestBefore". Used in issue identifiers. */
  role?: string;
  /** Ink name. Default: the InkProvider's default ink. */
  ink?: string;
  /** Font size in points. Default 9. */
  size?: number;
  /** CSS font weight. Default 400. */
  weight?: number;
  /** CSS font family. Inherits by default. */
  fontFamily?: string;
  align?: "left" | "center" | "right";
  /** Line height as a multiple of the font size. Default 1.2. */
  lineHeight?: number;
  /** Element to render. Default "div". */
  as?: "div" | "p" | "span" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  /** Language of the text (BCP 47), used for hyphenation and case mapping. */
  lang?: string;
  /** Overrides the identifier used in issues. */
  name?: string;
  className?: string;
  style?: CSSProperties;
}

/** Text that must meet the legal minimum x-height. */
export function MandatoryText({
  children,
  role,
  ink,
  size = 9,
  weight = 400,
  fontFamily,
  align,
  lineHeight = 1.2,
  as = "div",
  lang,
  name,
  className,
  style,
}: MandatoryTextProps) {
  const inks = useInks();
  const panel = useContext(PanelContext);
  useFontsVersion();
  const ref = useRef<HTMLElement>(null);
  const inkName = ink ?? inks.defaultInk;
  const color = inks.preview(inkName);

  useArtboardNode({
    baseId: () => name ?? nodeId(panel?.name, "MandatoryText", role),
    element: () => ref.current,
    measure: (env) => {
      const el = ref.current;
      if (!el) return null;
      const o: Parameters<typeof measureTextNode>[2] = { component: "MandatoryText", panel: panel?.name, ink: inkName, appliedColor: color, mandatory: true };
      if (role !== undefined) o.role = role;
      return measureTextNode(el, env, o);
    },
    paint: (env) => (ref.current ? paintText(ref.current, env) : []),
  });

  return createElement(
    as,
    {
      ref,
      lang,
      className,
      "data-prepress-node": "MandatoryText",
      style: {
        margin: 0,
        color,
        fontSize: `${size}pt`,
        fontWeight: weight,
        fontFamily,
        textAlign: align,
        lineHeight,
        ...style,
      } satisfies CSSProperties,
    },
    children,
  );
}
