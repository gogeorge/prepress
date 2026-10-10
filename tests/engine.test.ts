import { describe, expect, it } from "vitest";
import { createPreflightStore, defaultRules, defineRule, PreflightError, runPreflight, type Issue } from "../src/core.js";
import { barcode, doc, panel, text } from "./fixtures.js";

describe("runPreflight", () => {
  it("returns no issues for a clean document", () => {
    expect(runPreflight(doc([panel(), text(), barcode()]))).toEqual([]);
  });

  it("tags issues with rule id and artboard, errors first", () => {
    const r = { x: 0.5, y: 10, width: 30, height: 30 };
    const issues = runPreflight(doc([panel({ name: "p", rect: r, background: { ink: "brand", rect: r } }), text({ xHeightMm: 1 })]));
    expect(issues.map((i) => [i.level, i.rule])).toEqual([
      ["error", "eu1169.xHeight"],
      ["warn", "bleed"],
    ]);
    expect(issues[0]!.artboard).toBe("label");
  });

  it("accepts custom rules", () => {
    const logo = defineRule({
      id: "acme.noBarcodeOnFront",
      description: "Barcodes go on the back",
      check: (d) => d.nodes.filter((n) => n.kind === "barcode" && n.panel === "front").map((n) => ({ level: "warn", node: n.id, message: "Barcode on front panel" })),
    });
    const issues = runPreflight(doc([barcode(10, 10, { panel: "front" })]), [...defaultRules, logo]);
    expect(issues.find((i) => i.rule === "acme.noBarcodeOnFront")).toBeDefined();
  });

  it("reports a throwing rule instead of aborting", () => {
    const broken = defineRule({ id: "broken", description: "", check: () => { throw new Error("boom"); } });
    const issues = runPreflight(doc([]), [broken]);
    expect(issues).toEqual([expect.objectContaining({ rule: "broken", level: "error", message: expect.stringContaining("boom") })]);
  });

  it("rejects duplicate rule ids", () => {
    expect(() => runPreflight(doc([]), [defaultRules[0]!, defaultRules[0]!])).toThrow(/Duplicate/);
  });
});

describe("PreflightError", () => {
  it("carries the blocking issues", () => {
    const issue: Issue = { level: "error", rule: "x", node: "n", message: "m" };
    const e = new PreflightError([issue], "error");
    expect(e.issues).toEqual([issue]);
    expect(e.message).toContain("[x] n: m");
  });
});

describe("preflight store", () => {
  it("merges artboards and only notifies on change", () => {
    const store = createPreflightStore();
    let calls = 0;
    store.subscribe(() => calls++);
    const a: Issue = { level: "error", rule: "r", node: "n", message: "a", artboard: "a" };
    store.set("a", [a]);
    store.set("a", [{ ...a }]);
    expect(calls).toBe(1);
    const snapshot = store.getIssues();
    store.set("b", [{ ...a, artboard: "b" }]);
    expect(store.getIssues()).toHaveLength(2);
    expect(store.getIssues()).not.toBe(snapshot);
    store.remove("a");
    expect(store.getIssues()).toHaveLength(1);
    expect(calls).toBe(3);
  });
});
