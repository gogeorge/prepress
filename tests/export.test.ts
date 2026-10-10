import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildMarks, PreflightError, resolveMarks, writePDF, type ArtboardSpec, type Issue, type Primitive } from "../src/core.js";
import { exportPDF } from "../src/index.js";
import { inks } from "./fixtures.js";

const spec: ArtboardSpec = { id: "label", trim: [120, 80], bleed: 3, safe: 4 };
const MM = 72 / 25.4;

const primitives: Primitive[] = [
  { kind: "rect", x: -3, y: -3, width: 63, height: 86, fill: "brand" },
  { kind: "text", text: "Hazelnut Spread", x: 6, baseline: 12, fontSize: 4, font: { family: "Inter, sans-serif", weight: 700, italic: false }, fill: "paper", width: 35 },
  { kind: "text", text: "1", x: 70, baseline: 70, fontSize: 2.6, font: { family: "monospace", weight: 400, italic: false }, fill: "black", align: "center" },
];

describe("marks", () => {
  it("places crop marks outside the bleed and sizes the page", () => {
    const m = resolveMarks(spec, true);
    expect(m.offset).toBe(4);
    expect(m.margin).toBe(10);
    const lines = buildMarks(spec, { ...m, registration: false });
    expect(lines).toHaveLength(8);
    for (const l of lines) {
      if (l.kind !== "line") throw new Error("expected lines");
      // Every crop mark stays clear of the bleed area.
      const outside = (v: number, max: number) => v <= -spec.bleed || v >= max + spec.bleed;
      expect(outside(l.x1, 120) || outside(l.y1, 80)).toBe(true);
      expect(l.stroke).toBe("registration");
    }
  });

  it("keeps the offset at least the bleed", () => {
    expect(resolveMarks(spec, { offset: 1 }).offset).toBe(3);
  });

  it("has no mark area when marks are off", () => {
    expect(resolveMarks(spec, false).margin).toBe(3);
  });
});

describe("writePDF", () => {
  it("writes trim + bleed + marks page with boxes, metadata and the ink map", async () => {
    const res = await writePDF({ spec, inks, primitives });
    expect(res.pageSizeMm).toEqual([140, 100]);
    const pdf = await PDFDocument.load(res.bytes, { updateMetadata: false });
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(140 * MM, 1);
    expect(page.getHeight()).toBeCloseTo(100 * MM, 1);
    const trim = page.getTrimBox();
    expect(trim.x).toBeCloseTo(10 * MM, 1);
    expect(trim.width).toBeCloseTo(120 * MM, 1);
    const bleed = page.getBleedBox();
    expect(bleed.width).toBeCloseTo(126 * MM, 1);
    expect(pdf.getProducer()).toBe("@crasi/prepress");
    expect(Object.keys(res.inks).sort()).toEqual(["black", "brand"]);
    // Ink map attached as a file.
    const names = pdf.catalog.lookup(PDFName.of("Names"));
    expect(String(names)).toContain("EmbeddedFiles");
    // Inter is not registered: substituted, with a warning.
    expect(res.warnings.join(" ")).toMatch(/Inter.*Helvetica-Bold/);
  });

  it("supports a page without marks and a CMYK colour pass", async () => {
    const res = await writePDF({ spec, inks, primitives }, { marks: false, colorMode: "cmyk" });
    expect(res.pageSizeMm).toEqual([126, 86]);
    const pdf = await PDFDocument.load(res.bytes, { updateMetadata: false });
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(126 * MM, 1);
  });

  it("warns about colours that are not inks", async () => {
    const res = await writePDF({ spec, inks, primitives: [{ kind: "rect", x: 0, y: 0, width: 1, height: 1, fill: "rgb(0, 128, 0)" }] });
    expect(res.warnings.join(" ")).toContain("not a declared ink");
  });
});

describe("exportPDF", () => {
  const source = (issues: Issue[]) => ({ spec, inks, flush: async () => ({ issues }), paint: () => primitives });
  const err: Issue = { level: "error", rule: "eu1169.xHeight", node: "n", message: "too small" };
  const warn: Issue = { level: "warn", rule: "bleed", node: "n", message: "sliver" };

  it("rejects on errors by default", async () => {
    await expect(exportPDF(source([err]))).rejects.toBeInstanceOf(PreflightError);
  });

  it("exports with warnings unless failOn is warn", async () => {
    await expect(exportPDF(source([warn]))).resolves.toHaveProperty("bytes");
    await expect(exportPDF(source([warn]), { failOn: "warn" })).rejects.toBeInstanceOf(PreflightError);
  });

  it("exports anyway with failOn: never and returns the issues", async () => {
    const res = await exportPDF({ current: source([err]) }, { failOn: "never" });
    expect(res.issues).toEqual([err]);
  });

  it("rejects an unattached ref", async () => {
    await expect(exportPDF({ current: null })).rejects.toThrow(/not attached/);
  });
});
