import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { writePDF, type ArtboardSpec, type Primitive, type WritePDFOptions } from "../src/core.js";
import { inks } from "./fixtures.js";

const inter = new Uint8Array(readFileSync(new URL("../examples/next-app/public/fonts/inter-latin-400-normal.woff", import.meta.url)));
const interBold = new Uint8Array(readFileSync(new URL("../examples/next-app/public/fonts/inter-latin-700-normal.woff", import.meta.url)));
const fonts = [
  { family: "Inter", weight: 400, src: inter },
  { family: "Inter", weight: 700, src: interBold },
];

const spec: ArtboardSpec = { id: "label", trim: [120, 80], bleed: 3, safe: 4 };
const font = (family: string, weight = 400) => ({ family, weight, italic: false });

/** Covers every primitive kind and text option the writer handles. */
const primitives: Primitive[] = [
  { kind: "rect", x: -3, y: -3, width: 63, height: 86, fill: "brand" },
  { kind: "text", text: "Hazelnut Spread", x: 6, baseline: 12, fontSize: 4, font: font("Inter, sans-serif", 700), fill: "paper", width: 38 },
  { kind: "text", text: "Ingredients: sugar, ", x: 6, baseline: 20, fontSize: 2.6, font: font("Inter"), fill: "black", width: 22 },
  { kind: "text", text: "hazelnuts", x: 28, baseline: 20, fontSize: 2.6, font: font("Inter", 700), fill: "black", width: 12.4 },
  { kind: "text", text: "Store dry", x: 6, baseline: 30, fontSize: 2.6, font: font("Georgia, serif"), fill: "black", width: 12, underline: true },
  { kind: "text", text: "1", x: 70, baseline: 70, fontSize: 2.6, font: font("monospace"), fill: "black", align: "center" },
  { kind: "line", x1: 62, y1: 6, x2: 116, y2: 6, strokeWidth: 0.2, stroke: "black" },
  { kind: "circle", cx: 100, cy: 40, r: 5, stroke: "brand", strokeWidth: 0.3 },
];

/** Exports with a fixed clock, so CreationDate and ModDate are stable. */
async function bytes(options: WritePDFOptions = {}) {
  return writePDF({ spec, inks, primitives }, { fonts, ...options });
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterAll(() => vi.useRealTimers());

/** Decoded content of the page and of every Form XObject on it. */
async function contentOf(pdfBytes: Uint8Array) {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const page = pdf.getPage(0);
  const decode = (s: PDFStream) => {
    const raw = s instanceof PDFRawStream ? s.getContents() : (s as unknown as { getUnencodedContents(): Uint8Array }).getUnencodedContents();
    return Buffer.from(s.dict.get(PDFName.of("Filter")) ? inflateSync(raw) : raw).toString("latin1");
  };
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r) as PDFStream) : [contents as PDFStream];
  const xobjects: Record<string, string> = {};
  const xo = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  for (const [name, ref] of xo?.entries() ?? []) xobjects[name.asString()] = decode(pdf.context.lookup(ref as PDFRef) as PDFStream);
  return { pdf, page: streams.map(decode).join("\n"), xobjects };
}

describe("print output (editable off)", () => {
  // Generated from the v0.1.0 writer. Regenerate only for an intended change to print output:
  // UPDATE_GOLDEN=1 npx vitest run tests/editable.test.ts
  for (const [name, options] of [
    ["print-v0.1.0-rgb-marks.pdf", {}],
    ["print-v0.1.0-cmyk-nomarks.pdf", { colorMode: "cmyk", marks: false }],
  ] as const) {
    it(`is byte-for-byte unchanged: ${name}`, async () => {
      const golden = new URL(`./golden/${name}`, import.meta.url);
      const res = await bytes(options);
      expect(res.warnings.join(" ")).not.toMatch(/Illustrator/);
      if (process.env.UPDATE_GOLDEN) writeFileSync(golden, res.bytes);
      expect(existsSync(golden), `missing ${name}`).toBe(true);
      const expected = new Uint8Array(readFileSync(golden));
      expect(Buffer.compare(Buffer.from(res.bytes), Buffer.from(expected))).toBe(0);
      // `editable: false` is the default, not a different mode.
      const explicit = await bytes({ ...options, editable: false });
      expect(Buffer.compare(Buffer.from(explicit.bytes), Buffer.from(expected))).toBe(0);
    });
  }
});

describe("editable output", () => {
  const ops = (content: string) => content.split(/\n/).map((l) => l.trim()).filter(Boolean);
  /** `cm` operators that scale x (a != 1), as the print writer uses to squeeze text. */
  const xScales = (content: string) => ops(content).filter((l) => /^(\S+) 0 0 1 \S+ \S+ cm$/.test(l) && Number(l.split(" ")[0]) !== 1);

  it("has no outer clip", async () => {
    const print = await contentOf((await bytes()).bytes);
    expect(print.page).toMatch(/^W\s*\nn$/m);
    const { page } = await contentOf((await bytes({ editable: true })).bytes);
    expect(ops(page)).not.toContain("W");
  });

  it("draws text unscaled with Tm inside BT … ET, not inside q/cm/Q", async () => {
    const print = await contentOf((await bytes()).bytes);
    expect(xScales(print.page).length).toBeGreaterThan(0);
    const { page } = await contentOf((await bytes({ editable: true })).bytes);
    expect(xScales(page)).toEqual([]);
    const lines = ops(page);
    const bts = lines.flatMap((l, i) => (l === "BT" ? [i] : []));
    expect(bts).toHaveLength(primitives.filter((p) => p.kind === "text").length);
    for (const i of bts) {
      expect(lines[i - 1]).not.toMatch(/cm$/);
      const block = lines.slice(i, lines.indexOf("ET", i) + 1);
      expect(block.some((l) => /^1 0 0 1 \S+ \S+ Tm$/.test(l))).toBe(true);
    }
  });

  it("puts the marks in one Form XObject and leaves artwork on the page", async () => {
    const { pdf, page, xobjects } = await contentOf((await bytes({ editable: true })).bytes);
    const names = Object.keys(xobjects);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^\/Marks/);
    expect(page).toContain(`${names[0]} Do`);
    // 8 crop marks + 4 registration targets (circle + 2 lines), one stroke each.
    expect(ops(xobjects[names[0]!]!).filter((l) => l === "S")).toHaveLength(8 + 4 * 3);
    // Artwork strokes (one line, one circle) stay on the page.
    expect(ops(page).filter((l) => l === "S")).toHaveLength(2);
    // Boxes are unchanged.
    const p = pdf.getPage(0);
    expect(p.getTrimBox().width).toBeCloseTo(120 * (72 / 25.4), 1);
    expect(p.getBleedBox().width).toBeCloseTo(126 * (72 / 25.4), 1);
  });

  it("writes no XObject without marks", async () => {
    const { xobjects } = await contentOf((await bytes({ editable: true, marks: false })).bytes);
    expect(xobjects).toEqual({});
  });

  it("names embedded fonts by their PostScript name, with a subset tag", async () => {
    /** BaseFont of every embedded (Type0) font. */
    const baseFonts = async (pdfBytes: Uint8Array) =>
      (await PDFDocument.load(pdfBytes)).context
        .enumerateIndirectObjects()
        .map(([, o]) => o)
        .filter((o): o is PDFDict => o instanceof PDFDict && o.has(PDFName.of("DescendantFonts")))
        .map((d) => d.get(PDFName.of("BaseFont"))!.toString().slice(1));
    const editable = await baseFonts((await bytes({ editable: true })).bytes);
    expect(editable).toHaveLength(2);
    expect(editable.find((n) => n.endsWith("Inter-Regular"))).toMatch(/^[A-Z]{6}\+Inter-Regular$/);
    expect(editable.find((n) => n.endsWith("Inter-Bold"))).toMatch(/^[A-Z]{6}\+Inter-Bold$/);
    // Print output keeps pdf-lib's "<name>-<digits>" naming.
    expect((await baseFonts((await bytes()).bytes)).sort()).toEqual([expect.stringMatching(/^Inter-Bold-\d+$/), expect.stringMatching(/^Inter-Regular-\d+$/)]);
  });

  it("warns about fonts used, substitutions and width changes", async () => {
    const res = await writePDF(
      {
        spec,
        inks,
        primitives: [
          ...primitives,
          { kind: "text", text: "Squeezed", x: 6, baseline: 40, fontSize: 2.6, font: font("Inter"), fill: "black", width: 30 },
        ],
      },
      { fonts, editable: true },
    );
    const all = res.warnings.join("\n");
    expect(all).toMatch(/text in Georgia will open in Illustrator as Times-Roman/);
    expect(all).toMatch(/"Squeezed" \(\d+%\)/);
    const list = res.warnings.find((w) => w.startsWith("Fonts used:"));
    expect(list).toContain("Inter (Inter-Bold, Inter-Regular)");
    expect(list).toContain("Times (Times-Roman)");
    expect(list).toContain("Courier (Courier)");
  });
});

describe("editable text runs", () => {
  it("chains runs on one line so a longer run pushes the next one along instead of overlapping it", async () => {
    const size = 3;
    const helvetica = (await PDFDocument.create()).embedStandardFont(StandardFonts.Helvetica);
    const first = "Ingredients: sugar, ";
    const natural = helvetica.widthOfTextAtSize(first, size * (72 / 25.4)) / (72 / 25.4);
    const screen = natural * 0.9; // the screen font was narrower
    const res = await writePDF(
      {
        spec,
        inks,
        primitives: [
          { kind: "text", text: first, x: 6, baseline: 20, fontSize: size, font: font("sans-serif"), fill: "black", width: screen },
          { kind: "text", text: "milk", x: 6 + screen, baseline: 20, fontSize: size, font: font("sans-serif", 700), fill: "black", width: 5 },
          // Same x on another line: positioned from the screen, not chained.
          { kind: "text", text: "next", x: 6 + screen, baseline: 25, fontSize: size, font: font("sans-serif"), fill: "black", width: 5 },
        ],
      },
      { editable: true, marks: false },
    );
    const { page } = await contentOf(res.bytes);
    const xs = [...page.matchAll(/^1 0 0 1 (\S+) \S+ Tm$/gm)].map((m) => Number(m[1]) / (72 / 25.4) - spec.bleed);
    expect(xs[0]).toBeCloseTo(6, 3);
    expect(xs[1]).toBeCloseTo(6 + natural, 3);
    expect(xs[2]).toBeCloseTo(6 + screen, 3);
  });
});
