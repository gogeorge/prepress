import { describe, expect, it } from "vitest";
import { bleedRule } from "../../src/core.js";
import { doc, panel } from "../fixtures.js";

const rect = { x: 0, y: 0, width: 60, height: 80 };

describe("bleed", () => {
  it("passes a background extended to the full bleed", () => {
    const bg = { ink: "brand", rect: { x: -3, y: -3, width: 63, height: 86 } };
    expect(bleedRule.check(doc([panel({ name: "front", rect, background: bg })]))).toEqual([]);
  });

  it("passes a background well inside the trim", () => {
    const r = { x: 10, y: 10, width: 40, height: 40 };
    expect(bleedRule.check(doc([panel({ rect: r, background: { ink: "brand", rect: r } })]))).toEqual([]);
  });

  it("fails a background that stops at the trim edge", () => {
    const issues = bleedRule.check(doc([panel({ name: "front", rect, background: { ink: "brand", rect } })]));
    expect(issues.map((i) => i.level)).toEqual(["error", "error", "error"]);
    expect(issues[0]!.message).toContain("left trim edge");
    expect(issues[0]!.message).toContain("3 mm bleed");
  });

  it("fails a background with partial bleed", () => {
    const r = { x: -1, y: 10, width: 30, height: 30 };
    const [f] = bleedRule.check(doc([panel({ rect: r, background: { ink: "brand", rect: r } })]));
    expect(f!.message).toContain("extends only 1 mm");
  });

  it("warns about a background just short of the trim", () => {
    const r = { x: 0.5, y: 10, width: 30, height: 30 };
    const [f] = bleedRule.check(doc([panel({ rect: r, background: { ink: "brand", rect: r } })]));
    expect(f!.level).toBe("warn");
    expect(f!.message).toContain("0.5 mm short");
  });

  it("ignores panels without a background", () => {
    expect(bleedRule.check(doc([panel({ rect })]))).toEqual([]);
  });
});
