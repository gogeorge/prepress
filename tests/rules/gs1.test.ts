import { describe, expect, it } from "vitest";
import { checkDigitRule, ean13Geometry, quietZoneRule, xDimensionRule } from "../../src/core.js";
import { barcode, doc, text } from "../fixtures.js";

describe("gs1.xDimension", () => {
  it("passes 80%–200%", () => {
    for (const m of [0.8, 0.9, 1, 2]) {
      expect(xDimensionRule.check(doc([barcode(66, 40, {}, m)]))).toEqual([]);
    }
  });
  it("fails below 0.264 mm and above 0.660 mm", () => {
    expect(xDimensionRule.check(doc([barcode(66, 40, {}, 0.75)]))[0]!.message).toContain("0.248 mm");
    expect(xDimensionRule.check(doc([barcode(66, 40, {}, 2.1)]))).toHaveLength(1);
  });
});

describe("gs1.quietZone", () => {
  it("passes when both quiet zones are clear and inside the trim", () => {
    expect(quietZoneRule.check(doc([barcode(), text()]))).toEqual([]);
  });

  it("fails when the left quiet zone is cut by the trim", () => {
    const issues = quietZoneRule.check(doc([barcode(-1, 40)]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/Left quiet zone is 2\.27 mm/);
    expect(issues[0]!.message).toContain("11X");
  });

  it("fails when the right quiet zone runs off the trim", () => {
    const g = ean13Geometry(0.9);
    const x = 120 - g.totalWidth + 1;
    const issues = quietZoneRule.check(doc([barcode(x, 40)]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("Right quiet zone");
  });

  it("fails when another element intrudes", () => {
    const b = barcode(66, 40);
    const intruder = text({ id: "back/MandatoryText[storage]", bbox: { x: 66, y: 45, width: 2, height: 3 } });
    const issues = quietZoneRule.check(doc([b, intruder]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("back/MandatoryText[storage]");
    expect(issues[0]!.message).toContain("left quiet zone");
  });
});

describe("gs1.checkDigit", () => {
  it("passes a valid value and a 12-digit value", () => {
    expect(checkDigitRule.check(doc([barcode(66, 40, { value: "4006381333931" }), barcode(66, 40, { id: "b2", value: "400638133393" })]))).toEqual([]);
  });
  it("fails a wrong check digit", () => {
    const [f] = checkDigitRule.check(doc([barcode(66, 40, { value: "4006381333932" })]));
    expect(f!.message).toContain("expected 1");
  });
  it("fails malformed values", () => {
    expect(checkDigitRule.check(doc([barcode(66, 40, { value: "12AB" })]))).toHaveLength(1);
  });
});
