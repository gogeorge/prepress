import type { Rect } from "./types.js";

/** Tolerance for geometric comparisons, in mm. */
export const EPSILON_MM = 0.01;

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export const right = (r: Rect): number => r.x + r.width;
export const bottom = (r: Rect): number => r.y + r.height;

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(right(a), right(b)) - x;
  const h = Math.min(bottom(a), bottom(b)) - y;
  return w > EPSILON_MM && h > EPSILON_MM ? { x, y, width: w, height: h } : null;
}

export function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, right(r));
    y2 = Math.max(y2, bottom(r));
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function inset(r: Rect, by: number): Rect {
  return { x: r.x + by, y: r.y + by, width: r.width - 2 * by, height: r.height - 2 * by };
}

/**
 * How far `inner` extends beyond `outer` on each side, in mm (0 when inside).
 */
export function overhang(inner: Rect, outer: Rect): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.max(0, outer.x - inner.x),
    top: Math.max(0, outer.y - inner.y),
    right: Math.max(0, right(inner) - right(outer)),
    bottom: Math.max(0, bottom(inner) - bottom(outer)),
  };
}

export function trimRect(trim: readonly [number, number]): Rect {
  return { x: 0, y: 0, width: trim[0], height: trim[1] };
}
