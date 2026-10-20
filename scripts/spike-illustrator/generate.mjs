/**
 * Illustrator spike (DECISIONS.md §11): writes one test label in several
 * PDF variants so we can see which structures Illustrator keeps when it opens
 * a PDF that has no Illustrator private data.
 *
 *   npm run build
 *   node scripts/spike-illustrator/generate.mjs [outDir]
 *   osascript scripts/spike-illustrator/inspect.applescript <outDir>
 *
 * 01 is the print writer (`writePDF` from dist) and 20 is its `editable: true` mode. The rest are drawn
 * with pdf-lib operators directly so each variant changes one thing.
 * Text uses Arial (installed on every Mac), so font matching can be tested.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFOperator,
  PDFContentStream,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  showText,
  setFillingRgbColor,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  rectangle,
  clip,
  endPath,
  fill,
  moveTo,
  lineTo,
  stroke,
  setLineWidth,
  setStrokingRgbColor,
  drawObject,
  drawEllipsePath,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { registerFont, writePDF } from "../../dist/esm/core.js";

const out = resolve(process.argv[2] ?? "spike-out");
mkdirSync(out, { recursive: true });

const SUPP = "/System/Library/Fonts/Supplemental";
const arial = new Uint8Array(readFileSync(join(SUPP, "Arial.ttf")));
const arialBold = new Uint8Array(readFileSync(join(SUPP, "Arial Bold.ttf")));
const interPath = new URL("../../examples/next-app/public/fonts/", import.meta.url);
const inter = new Uint8Array(readFileSync(new URL("inter-latin-400-normal.woff", interPath)));
const interBold = new Uint8Array(readFileSync(new URL("inter-latin-700-normal.woff", interPath)));

const K = 72 / 25.4;
const spec = { id: "spike", trim: [90, 50], bleed: 3, safe: 3 };
const M = 10; // mark margin, as resolveMarks gives for bleed 3
const pageW = (spec.trim[0] + 2 * M) * K;
const pageH = (spec.trim[1] + 2 * M) * K;
const X = (mm) => (mm + M) * K;
const Y = (mm) => pageH - (mm + M) * K;

const BROWN = [0.23, 0.15, 0.145];
const CREAM = [0.98, 0.95, 0.9];
const REG = [0, 0, 0];

/**
 * The label, as logical groups. A line is a list of runs sharing a baseline.
 * `screen` is a fake on-screen width factor so the sx variants have something to match.
 */
const label = [
  { group: "Background", rects: [{ x: -3, y: -3, w: 96, h: 56, color: BROWN }] },
  { group: "Title", lines: [{ x: 5, baseline: 11, size: 6, screen: 1.03, runs: [{ text: "Dark Chocolate 70%", bold: true }] }] },
  {
    group: "Ingredients",
    lines: [
      {
        x: 5, baseline: 20, size: 2.6, screen: 0.98,
        runs: [
          { text: "Ingredients: cocoa mass, sugar, " },
          { text: "milk", bold: true },
          { text: " powder, " },
          { text: "hazelnuts", bold: true },
          { text: "." },
        ],
      },
      { x: 5, baseline: 24, size: 2.6, screen: 1.02, runs: [{ text: "May contain traces of nuts.", underline: true }] },
    ],
  },
  {
    group: "Storage",
    lines: [
      { x: 5, baseline: 40, size: 2.4, screen: 1.01, runs: [{ text: "Store in a cool, dry place" }] },
      { x: 5, baseline: 43.5, size: 2.4, screen: 0.99, runs: [{ text: "away from " }, { text: "direct sunlight." }] },
    ],
  },
];

function markLines() {
  const [w, h] = spec.trim;
  const a = 4, b = 9, lines = [], circles = [];
  for (const x of [0, w]) lines.push([x, -a, x, -b], [x, h + a, x, h + b]);
  for (const y of [0, h]) lines.push([-a, y, -b, y], [w + a, y, w + b, y]);
  const d = 6.5, r = 2;
  for (const [cx, cy] of [[w / 2, -d], [w / 2, h + d], [-d, h / 2], [w + d, h / 2]]) {
    circles.push([cx, cy, r * 0.6]);
    lines.push([cx - r, cy, cx + r, cy], [cx, cy - r, cx, cy + r]);
  }
  return { lines, circles };
}

// ---------------------------------------------------------------- 01 baseline

async function baseline() {
  await registerFont({ family: "Arial", weight: 400, src: arial });
  await registerFont({ family: "Arial", weight: 700, src: arialBold });
  const primitives = [];
  for (const g of label) {
    for (const r of g.rects ?? []) primitives.push({ kind: "rect", x: r.x, y: r.y, width: r.w, height: r.h, fill: "brand" });
    for (const line of g.lines ?? []) {
      // The real render stage emits one primitive per style run, with its measured width.
      let x = line.x;
      for (const run of line.runs) {
        const font = fontkit.create(run.bold ? arialBold : arial);
        const width = (font.layout(run.text).advanceWidth / font.unitsPerEm) * line.size * line.screen;
        primitives.push({
          kind: "text", text: run.text, x, baseline: line.baseline, fontSize: line.size,
          font: { family: "Arial", weight: run.bold ? 700 : 400, italic: false }, fill: "paper", width, underline: run.underline,
        });
        x += width;
      }
    }
  }
  const inks = { brand: { cmyk: [0, 35, 40, 75], preview: "#3b2625" } };
  const res = await writePDF({ spec, inks, primitives }, { marks: true });
  writeFileSync(join(out, "01-baseline.pdf"), res.bytes);
  if (res.warnings.length) console.log("01 warnings:", res.warnings);
  // The shipped editable mode, for checking the acceptance criteria.
  const editable = await writePDF({ spec, inks, primitives }, { marks: true, editable: true });
  writeFileSync(join(out, "20-editable.pdf"), editable.bytes);
  console.log("20 warnings:", editable.warnings);
}

// ---------------------------------------------------------------- variants

/**
 * @param {object} o
 * @param {boolean} [o.clip]       outer bleed clip
 * @param {boolean} [o.sx]         per-run q/cm/Q with horizontal scale (baseline text)
 * @param {"run"|"line"|"para"} [o.bt]  one BT per run, per line (font switches), or per group
 * @param {"none"|"q"|"xobject"} [o.groups]  how logical groups are wrapped
 * @param {boolean} [o.ocg]        artwork and marks in two optional content groups
 * @param {"pdflib"|"ps"|"tag"} [o.fontName]
 * @param {boolean} [o.subset]
 * @param {"arial"|"inter"|"standard"} [o.face]  "standard": Helvetica and Times-Bold, not embedded
 * @param {boolean} [o.sameFontNoTf]  skip Tf between consecutive runs in the same font
 * @param {boolean} [o.tgroup]     mark Form XObjects as transparency groups
 */
async function variant(file, o) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([pageW, pageH]);
  page.setBleedBox(X(-3), Y(53), 96 * K, 56 * K);
  page.setTrimBox(X(0), Y(50), 90 * K, 50 * K);
  const ctx = doc.context;

  const face = o.face ?? "arial";
  const files = face === "arial" ? [arial, arialBold] : [inter, interBold];
  const psNames = face === "arial" ? ["ArialMT", "Arial-BoldMT"] : ["Inter-Regular", "Inter-Bold"];
  const subset = o.subset ?? face === "inter";
  const fonts = face === "standard" ? [doc.embedStandardFont("Helvetica"), doc.embedStandardFont("Times-Bold")] : await Promise.all(
    files.map((bytes, i) => {
      const fontName = o.fontName ?? "ps";
      const opts = { subset };
      if (fontName === "ps") opts.customName = psNames[i];
      if (fontName === "tag") opts.customName = `${i ? "BCDEFG" : "ABCDEF"}+${psNames[i]}`;
      return doc.embedFont(bytes, opts);
    }),
  );
  const fontKeys = fonts.map((f) => page.node.newFontDictionary(f.name, f.ref));
  const formResources = ctx.obj({ Font: Object.fromEntries(fontKeys.map((k, i) => [k.asString().slice(1), fonts[i].ref])) });

  const ops = [];
  const emit = (target, ...xs) => target.push(...xs);

  const ocgs = {};
  if (o.ocg) {
    const names = ["Artwork", "Crop marks"];
    const refs = names.map((n) => ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of(n) })));
    const props = ctx.obj({});
    names.forEach((n, i) => props.set(PDFName.of(`OC${i}`), refs[i]));
    page.node.Resources().set(PDFName.of("Properties"), props);
    doc.catalog.set(
      PDFName.of("OCProperties"),
      ctx.obj({ OCGs: refs, D: { Name: PDFString.of("Layers"), Order: refs, ON: refs, OFF: [] } }),
    );
    names.forEach((n, i) => (ocgs[n] = `OC${i}`));
  }
  const bdc = (key) => PDFOperator.of("BDC", [PDFName.of("OC"), PDFName.of(key)]);
  const emc = () => PDFOperator.of("EMC");

  const drawGroup = (g, target) => {
    for (const r of g.rects ?? []) {
      emit(target, setFillingRgbColor(...r.color), rectangle(X(r.x), Y(r.y + r.h), r.w * K, r.h * K), fill());
    }
    for (const line of g.lines ?? []) {
      const size = line.size * K;
      const widthOf = (run) => fonts[run.bold ? 1 : 0].widthOfTextAtSize(run.text, size);
      if (o.sx) {
        let x = X(line.x);
        for (const run of line.runs) {
          const natural = widthOf(run);
          const sx = line.screen;
          emit(target, pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, 1, x, Y(line.baseline)));
          emit(target, beginText(), setFillingRgbColor(...CREAM), setFontAndSize(fontKeys[run.bold ? 1 : 0], size), setTextMatrix(1, 0, 0, 1, 0, 0));
          emit(target, showText(fonts[run.bold ? 1 : 0].encodeText(run.text)), endText());
          if (run.underline) emit(target, rectangle(0, -size * 0.12, natural, size * 0.06), fill());
          emit(target, popGraphicsState());
          x += natural * sx;
        }
        continue;
      }
      let x = X(line.x);
      const y = Y(line.baseline);
      const perLine = o.bt === "line" || o.bt === "para";
      if (perLine && (o.bt === "line" || line === g.lines[0])) emit(target, beginText(), setFillingRgbColor(...CREAM));
      for (const run of line.runs) {
        if (!perLine) emit(target, beginText(), setFillingRgbColor(...CREAM));
        const prev = line.runs[line.runs.indexOf(run) - 1];
        if (!perLine || !o.sameFontNoTf || !prev || !!prev.bold !== !!run.bold) emit(target, setFontAndSize(fontKeys[run.bold ? 1 : 0], size));
        // Absolute Tm for the first run of a line; later runs follow on from the previous Tj.
        if (!perLine || run === line.runs[0]) emit(target, setTextMatrix(1, 0, 0, 1, x, y));
        emit(target, showText(fonts[run.bold ? 1 : 0].encodeText(run.text)));
        if (!perLine) emit(target, endText());
        x += widthOf(run);
      }
      if (o.bt === "line" || (o.bt === "para" && line === g.lines.at(-1))) emit(target, endText());
      x = X(line.x);
      for (const run of line.runs) {
        if (run.underline) emit(target, setFillingRgbColor(...CREAM), rectangle(x, y - size * 0.12, widthOf(run), size * 0.06), fill());
        x += widthOf(run);
      }
    }
  };

  const wrapGroup = (name, body, target) => {
    if (o.groups === "q") {
      emit(target, pushGraphicsState(), ...body, popGraphicsState());
    } else if (o.groups === "xobject") {
      const dict = ctx.obj({ Type: "XObject", Subtype: "Form", BBox: [0, 0, pageW, pageH], Resources: formResources });
      if (o.tgroup) dict.set(PDFName.of("Group"), ctx.obj({ S: "Transparency" }));
      const ref = ctx.register(PDFContentStream.of(dict, body, false));
      const key = page.node.newXObject(name.replace(/\s/g, ""), ref);
      emit(target, drawObject(key));
    } else {
      emit(target, ...body);
    }
  };

  // Artwork
  if (o.ocg) emit(ops, bdc(ocgs.Artwork));
  if (o.clip) emit(ops, pushGraphicsState(), rectangle(X(-3), Y(53), 96 * K, 56 * K), clip(), endPath());
  for (const g of label) {
    const body = [];
    drawGroup(g, body);
    wrapGroup(g.group, body, ops);
  }
  if (o.clip) emit(ops, popGraphicsState());
  if (o.ocg) emit(ops, emc());

  // Marks
  const marks = [];
  const { lines, circles } = markLines();
  emit(marks, setStrokingRgbColor(...REG), setLineWidth(0.1 * K));
  for (const [x1, y1, x2, y2] of lines) emit(marks, moveTo(X(x1), Y(y1)), lineTo(X(x2), Y(y2)), stroke());
  for (const [cx, cy, r] of circles) emit(marks, ...drawEllipsePath({ x: X(cx), y: Y(cy), xScale: r * K, yScale: r * K }), stroke());
  if (o.ocg) emit(ops, bdc(ocgs["Crop marks"]));
  wrapGroup("Marks", marks, ops);
  if (o.ocg) emit(ops, emc());

  page.pushOperators(...ops);
  doc.setTitle(file);
  doc.setProducer("@crasi/prepress spike");
  writeFileSync(join(out, `${file}.pdf`), await doc.save());
}

await baseline();
const plain = { clip: false, bt: "run", groups: "none" };
await variant("02-noclip", { ...plain, sx: true });
await variant("03-nosx", { ...plain });
await variant("04-merged-runs", { ...plain, bt: "line" });
await variant("05-one-bt-per-group", { ...plain, bt: "para" });
await variant("06-ocg", { ...plain, bt: "line", ocg: true });
await variant("07-xobject", { ...plain, bt: "line", groups: "xobject" });
await variant("08-q-groups", { ...plain, bt: "line", groups: "q" });
await variant("09-ocg-xobject", { ...plain, bt: "line", ocg: true, groups: "xobject" });
await variant("10-font-pdflib-name", { ...plain, bt: "line", fontName: "pdflib" });
await variant("11-font-subset-tag", { ...plain, bt: "line", fontName: "tag", subset: true });
await variant("12-font-subset-notag", { ...plain, bt: "line", fontName: "ps", subset: true });
await variant("13-font-not-installed", { ...plain, bt: "line", face: "inter" });
await variant("14-xobject-transparency-group", { ...plain, bt: "line", groups: "xobject", tgroup: true });
await variant("15-same-font-no-tf", { ...plain, bt: "line", sameFontNoTf: true });
await variant("16-standard-fonts", { ...plain, bt: "line", face: "standard" });
console.log(`Wrote variants to ${out}`);
