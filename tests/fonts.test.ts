import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { registerFont, writePDF, xHeightRatioOf } from "../src/core.js";
import { loadFontkit } from "../src/measure/fonts.js";
import { isWoff, isWoff2, writePdf } from "../src/export/writer.js";
import { resolveMarks } from "../src/core.js";
import { inks } from "./fixtures.js";

const inter = new Uint8Array(readFileSync(new URL("../examples/next-app/public/fonts/inter-latin-400-normal.woff", import.meta.url)));
const fakeWoff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]);

describe("font files", () => {
  it("reads the x-height ratio from OS/2", async () => {
    const font = (await loadFontkit()).create(inter);
    expect(xHeightRatioOf(font)).toBeCloseTo(1118 / 2048, 4);
  });

  it("detects WOFF and WOFF2", () => {
    expect(isWoff(inter)).toBe(true);
    expect(isWoff2(inter)).toBe(false);
    expect(isWoff2(fakeWoff2)).toBe(true);
    expect(isWoff(new Uint8Array([0, 1, 0, 0]))).toBe(false);
  });

  it("embeds a registered WOFF font as TrueType, including composite glyphs", async () => {
    await registerFont({ family: "Inter", weight: 400, src: inter });
    const res = await writePDF({
      spec: { id: "t", trim: [50, 20], bleed: 3, safe: 3 },
      inks,
      primitives: [{ kind: "text", text: "Zutaten: Haselnüsse, Palmöl", x: 5, baseline: 10, fontSize: 4, font: { family: "Inter", weight: 400, italic: false }, fill: "black" }],
    });
    expect(res.warnings).toEqual([]);
    // The embedded font program must be TrueType, not the original WOFF bytes.
    const pdf = await PDFDocument.load(res.bytes);
    const descriptors = pdf.context
      .enumerateIndirectObjects()
      .map(([, o]) => o)
      .filter((o): o is PDFDict => o instanceof PDFDict && o.has(PDFName.of("FontFile2")));
    expect(descriptors).toHaveLength(1);
    const stream = pdf.context.lookup(descriptors[0]!.get(PDFName.of("FontFile2"))) as PDFRawStream;
    const program = inflateSync(stream.getContents());
    // TrueType files start with 0x00010000 or "true".
    const tag = program.subarray(0, 4).toString("latin1");
    expect(["\0\x01\0\0", "true"]).toContain(tag);
  });

  it("falls back to a standard font for WOFF2, with a warning", async () => {
    const spec = { id: "t", trim: [50, 20] as const, bleed: 3, safe: 3 };
    const warnings: string[] = [];
    await writePdf(
      {
        spec,
        marks: resolveMarks(spec, false),
        artwork: [{ kind: "text", text: "a", x: 1, baseline: 5, fontSize: 3, font: { family: "Woffy", weight: 400, italic: false }, fill: "black", color: { space: "rgb", r: 0, g: 0, b: 0 } }],
        markPrimitives: [],
        fonts: [{ source: { family: "Woffy", src: fakeWoff2 }, bytes: fakeWoff2, xHeightRatio: 0.5 }],
      },
      warnings,
    );
    expect(warnings.join(" ")).toContain("WOFF2");
  });
});
