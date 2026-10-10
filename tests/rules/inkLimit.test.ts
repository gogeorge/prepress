import { describe, expect, it } from "vitest";
import { inkLimitRule } from "../../src/core.js";
import { doc, panel, text } from "../fixtures.js";

describe("inkLimit", () => {
  it("passes declared inks within the limit; paper is free", () => {
    const nodes = [text({ inks: ["black"] }), text({ id: "t2", inks: ["paper"] }), panel({ inks: ["brand"], background: { ink: "brand", rect: { x: 0, y: 0, width: 1, height: 1 } } })];
    expect(inkLimitRule.check(doc(nodes))).toEqual([]);
  });

  it("fails when more inks are used than allowed", () => {
    const [f] = inkLimitRule.check(doc([text({ inks: ["black"] }), text({ id: "t2", inks: ["brand"] })], { maxInks: 1 }));
    expect(f!.message).toContain("2 inks used");
    expect(f!.message).toContain("limit is 1");
  });

  it("fails an undeclared ink name", () => {
    const [f] = inkLimitRule.check(doc([text({ inks: ["gold"] })]));
    expect(f!.message).toContain('"gold" is not declared');
  });

  it("fails a raw colour that is not an ink", () => {
    const [f] = inkLimitRule.check(doc([text({ undeclaredColors: ["rgb(0, 128, 0)"] })]));
    expect(f!.message).toContain("rgb(0, 128, 0)");
  });

  it("does not limit when maxInks is unset", () => {
    expect(inkLimitRule.check(doc([text({ inks: ["black"] }), text({ id: "t2", inks: ["brand"] })], { maxInks: undefined }))).toEqual([]);
  });
});
