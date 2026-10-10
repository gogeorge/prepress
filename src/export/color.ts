/**
 * Colour stage: turns ink references into device colours. Pure: no DOM.
 *
 * v1 ships an RGB pass (ink previews) and a DeviceCMYK pass (ink CMYK builds).
 * A spot-colour pass would implement the same interface and map inks to
 * Separation colour spaces.
 */
import { parseColor, resolveInk, type InkMap } from "../inks/index.js";
import type { Primitive } from "./types.js";

export type DeviceColor = { space: "rgb"; r: number; g: number; b: number } | { space: "cmyk"; c: number; m: number; y: number; k: number };

export interface ColorPass {
  name: string;
  /** Maps an ink name (or a raw CSS colour) to a device colour. Return null when it cannot be mapped. */
  resolve(fill: string, inks: InkMap): DeviceColor | null;
}

const rgbFromCss = (css: string): DeviceColor | null => {
  const c = parseColor(css);
  return c ? { space: "rgb", r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 } : null;
};

/** Ink previews as RGB. */
export const rgbColorPass: ColorPass = {
  name: "rgb",
  resolve(fill, inks) {
    const ink = resolveInk(fill, inks);
    return rgbFromCss(ink ? ink.preview : fill);
  },
};

/** Ink CMYK builds as DeviceCMYK. Raw (undeclared) colours fall back to RGB. */
export const cmykColorPass: ColorPass = {
  name: "cmyk",
  resolve(fill, inks) {
    const ink = resolveInk(fill, inks);
    if (!ink) return rgbFromCss(fill);
    const [c, m, y, k] = ink.cmyk;
    return { space: "cmyk", c: c / 100, m: m / 100, y: y / 100, k: k / 100 };
  },
};

export type ColoredPrimitive = Primitive & { color: DeviceColor };

const MAGENTA: DeviceColor = { space: "rgb", r: 1, g: 0, b: 1 };

/** Applies a colour pass. Unmappable fills become magenta and are reported in `warnings`. */
export function applyColorPass(primitives: readonly Primitive[], pass: ColorPass, inks: InkMap, warnings: string[]): ColoredPrimitive[] {
  const reported = new Set<string>();
  return primitives.map((p) => {
    const fill = p.kind === "line" || p.kind === "circle" ? p.stroke : p.fill;
    let color = pass.resolve(fill, inks);
    if (!color) {
      color = MAGENTA;
      if (!reported.has(fill)) {
        reported.add(fill);
        warnings.push(`Colour "${fill}" could not be mapped by the ${pass.name} colour pass; drawn in magenta.`);
      }
    } else if (!resolveInk(fill, inks) && !reported.has(fill)) {
      reported.add(fill);
      warnings.push(`Colour "${fill}" is not a declared ink; exported as RGB.`);
    }
    return { ...p, color };
  });
}
