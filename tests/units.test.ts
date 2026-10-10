import { describe, expect, it } from "vitest";
import { convert, fromMm, mmToPt, mmToPx, ptToMm, pxToMm, toMm } from "../src/core.js";

describe("units", () => {
  it("converts between mm, pt, in and px", () => {
    expect(toMm(1, "in")).toBe(25.4);
    expect(mmToPt(25.4)).toBeCloseTo(72);
    expect(ptToMm(72)).toBeCloseTo(25.4);
    expect(mmToPx(25.4)).toBeCloseTo(96);
    expect(pxToMm(96)).toBeCloseTo(25.4);
    expect(mmToPx(25.4, 300)).toBeCloseTo(300);
    expect(convert(1, "in", "pt")).toBeCloseTo(72);
    expect(fromMm(toMm(12.3, "pt"), "pt")).toBeCloseTo(12.3);
  });
});
