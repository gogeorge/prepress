import { describe, expect, it } from "vitest";
import { safeZoneRule } from "../../src/core.js";
import { barcode, doc, text } from "../fixtures.js";

describe("safeZone", () => {
  it("passes content inside the safe area", () => {
    expect(safeZoneRule.check(doc([text({ bbox: { x: 4, y: 4, width: 112, height: 72 } }), barcode(66, 40)]))).toEqual([]);
  });

  it("fails text between the safe margin and the trim", () => {
    const [f] = safeZoneRule.check(doc([text({ bbox: { x: 2.5, y: 10, width: 20, height: 3 } })]));
    expect(f!.message).toContain("2.5 mm from the left trim edge");
    expect(f!.message).toContain("4 mm");
  });

  it("fails a barcode too close to the bottom", () => {
    const issues = safeZoneRule.check(doc([barcode(66, 58)]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("bottom");
  });

  it("ignores empty text and panels", () => {
    expect(safeZoneRule.check(doc([text({ empty: true, bbox: { x: 0, y: 0, width: 1, height: 1 } })]))).toEqual([]);
  });
});
