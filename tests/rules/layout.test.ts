import { describe, expect, it } from "vitest";
import { missingContentRule, overflowRule } from "../../src/core.js";
import { barcode, doc, panel, text } from "../fixtures.js";

describe("layout.overflow", () => {
  it("passes content inside its panel", () => {
    expect(overflowRule.check(doc([panel(), text(), barcode()]))).toEqual([]);
  });

  it("fails content extending beyond its panel", () => {
    const [f] = overflowRule.check(doc([panel(), text({ bbox: { x: 64, y: 70, width: 40, height: 6 } })]));
    expect(f!.message).toContain('panel "back"');
    expect(f!.message).toContain("2 mm (bottom)");
  });

  it("fails text that overflows its own box", () => {
    const [f] = overflowRule.check(doc([panel(), text({ overflowMm: 1.5 })]));
    expect(f!.message).toContain("1.5 mm");
  });
});

describe("content.missing", () => {
  it("passes complete content", () => {
    expect(missingContentRule.check(doc([text()]))).toEqual([]);
  });
  it("fails empty mandatory text", () => {
    expect(missingContentRule.check(doc([text({ empty: true })]))[0]!.message).toContain("empty");
  });
  it("fails missing translations", () => {
    const [f] = missingContentRule.check(doc([text({ missingTranslations: ["Hazelnuts"], locale: "fr" })]));
    expect(f!.message).toBe('No "fr" translation for: Hazelnuts.');
  });
});
