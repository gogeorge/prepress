import { describe, expect, it } from "vitest";
import { ean13CheckDigit, ean13Geometry, encodeEan13, validateEan13 } from "../src/core.js";

describe("EAN-13", () => {
  it("computes check digits", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13CheckDigit("590123412345")).toBe(7);
    expect(ean13CheckDigit("000000000000")).toBe(0);
  });

  it("validates values", () => {
    expect(validateEan13("4006381333931")).toEqual({ valid: true, digits: "4006381333931" });
    expect(validateEan13("400638133393")).toEqual({ valid: true, digits: "4006381333931" });
    const bad = validateEan13("4006381333932");
    expect(bad.valid).toBe(false);
    expect(bad.valid === false && bad.reason).toBe("checkDigit");
    expect(validateEan13("12345").valid).toBe(false);
    expect(validateEan13("40063813339a1").valid).toBe(false);
  });

  it("encodes guard patterns, parity and right-hand digits", () => {
    const { modules, bars, digits } = encodeEan13("4006381333931");
    expect(digits).toBe("4006381333931");
    expect(modules).toHaveLength(95);
    expect(modules.slice(0, 3)).toBe("101");
    expect(modules.slice(45, 50)).toBe("01010");
    expect(modules.slice(92)).toBe("101");
    // First digit 4 selects parity LGLLGG: digit 2 ("0") is L, digit 3 ("0") is G.
    expect(modules.slice(3, 10)).toBe("0001101");
    expect(modules.slice(10, 17)).toBe("0100111");
    // Last digit "1" in R encoding.
    expect(modules.slice(85, 92)).toBe("1100110");
    expect(bars.filter((b) => b.guard)).toHaveLength(6);
    expect(bars.reduce((n, b) => n + b.width, 0)).toBe([...modules].filter((m) => m === "1").length);
  });

  it("computes the check digit for 12-digit input", () => {
    expect(encodeEan13("590123412345").digits).toBe("5901234123457");
  });

  it("rejects malformed input", () => {
    expect(() => encodeEan13("abc")).toThrow();
  });

  it("scales geometry with magnification", () => {
    const g = ean13Geometry(1);
    expect(g.x).toBeCloseTo(0.33);
    expect(g.totalWidth).toBeCloseTo(113 * 0.33);
    expect(g.totalHeight).toBeCloseTo(25.93);
    expect(ean13Geometry(0.8).x).toBeCloseTo(0.264);
  });
});
