import { describe, expect, it } from "vitest";
import { minXHeightMm, xHeightRule } from "../../src/core.js";
import { doc, text } from "../fixtures.js";

describe("eu1169.xHeight", () => {
  it("uses 1.2 mm, or 0.9 mm below 80 cm²", () => {
    expect(minXHeightMm(96)).toBe(1.2);
    expect(minXHeightMm(80)).toBe(1.2);
    expect(minXHeightMm(79.9)).toBe(0.9);
    expect(minXHeightMm(undefined)).toBe(1.2);
  });

  it("passes mandatory text at or above the minimum", () => {
    expect(xHeightRule.check(doc([text({ xHeightMm: 1.2 })]))).toEqual([]);
    expect(xHeightRule.check(doc([text({ xHeightMm: 0.95 })], {}, { largestSurfaceCm2: 60 }))).toEqual([]);
  });

  it("fails mandatory text below the minimum and suggests a size", () => {
    const [f, ...rest] = xHeightRule.check(doc([text({ xHeightMm: 1.08, xHeightRatio: 0.5, font: "6 pt Arial 400" })]));
    expect(rest).toEqual([]);
    expect(f!.level).toBe("error");
    expect(f!.message).toContain("1.08 mm");
    expect(f!.message).toContain("1.2 mm");
    // 1.2 / 0.5 = 2.4 mm = 6.8 pt
    expect(f!.message).toContain("6.9 pt");
  });

  it("applies the small-package minimum", () => {
    expect(xHeightRule.check(doc([text({ xHeightMm: 0.85 })], {}, { largestSurfaceCm2: 60 }))).toHaveLength(1);
  });

  it("ignores non-mandatory and empty text", () => {
    expect(xHeightRule.check(doc([text({ xHeightMm: 0.5, mandatory: false }), text({ xHeightMm: 0.5, empty: true })]))).toEqual([]);
  });

  it("warns when the x-height could not be measured", () => {
    const [f] = xHeightRule.check(doc([text({ xHeightMm: null })]));
    expect(f!.level).toBe("warn");
  });
});
