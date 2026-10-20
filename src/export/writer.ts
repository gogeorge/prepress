/**
 * Write stage: draws a coloured display list into a PDF with pdf-lib.
 * Runs in the browser and in Node (no DOM). pdf-lib and fontkit are loaded
 * on first use so they stay out of the main bundle.
 */
import type { PDFFont, PDFName, PDFOperator, PDFPage, Color } from "pdf-lib";
import { loadFontkit, loadedFonts, matchFont, parseFamilies, type LoadedFont } from "../measure/fonts.js";
import type { ArtboardSpec } from "../preflight/types.js";
import { MM_PER_INCH, PT_PER_INCH } from "../units/index.js";
import type { ColoredPrimitive, DeviceColor } from "./color.js";
import type { ResolvedMarks } from "./marks.js";
import type { FontRef } from "./types.js";

const K = PT_PER_INCH / MM_PER_INCH;
const GENERIC = new Set(["serif", "sans-serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace"]);

export interface WriteInput {
  spec: ArtboardSpec;
  marks: ResolvedMarks;
  /** Artwork, clipped to the bleed box. */
  artwork: ColoredPrimitive[];
  /** Printer's marks, drawn outside the clip. */
  markPrimitives: ColoredPrimitive[];
  title?: string;
  /** Files to attach to the PDF (e.g. the ink map). */
  attachments?: Array<{ name: string; data: Uint8Array; mimeType: string; description: string }>;
  /** Extra Info dictionary entries. */
  info?: Record<string, string>;
  /** Fonts to embed, in addition to fonts registered with `registerFont`. */
  fonts?: LoadedFont[];
  /** Illustrator-friendly output (DECISIONS.md §11): no outer clip, unscaled text, marks in their own group, real font names. */
  editable?: boolean;
}

/** Text runs whose natural width differs from the measured width by more than this fraction get a warning in editable mode. */
const WIDTH_TOLERANCE = 0.03;

/**
 * A six-letter subset tag (PDF 32000 §9.6.4) derived from the font name, so
 * output is deterministic. Illustrator strips the tag when matching fonts.
 */
export function subsetTag(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  let tag = "";
  for (let i = 0; i < 6; i++, h = Math.floor(h / 26)) tag += String.fromCharCode(65 + (h % 26));
  return tag;
}

type StandardName =
  | "Helvetica" | "Helvetica-Bold" | "Helvetica-Oblique" | "Helvetica-BoldOblique"
  | "Times-Roman" | "Times-Bold" | "Times-Italic" | "Times-BoldItalic"
  | "Courier" | "Courier-Bold" | "Courier-Oblique" | "Courier-BoldOblique";

/** True for WOFF ("wOFF") files. */
export function isWoff(bytes: Uint8Array): boolean {
  return bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x46;
}

/**
 * True for WOFF2 ("wOF2") files. @pdf-lib/fontkit reads their metrics but
 * fails while subsetting composite glyphs, and unsubsetted WOFF2 is not valid
 * inside a PDF, so WOFF2 is never embedded.
 */
export function isWoff2(bytes: Uint8Array): boolean {
  return bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
}

/** Picks the closest PDF standard font for a CSS font stack. */
export function standardFontFor(font: FontRef): StandardName {
  const fams = parseFamilies(font.family);
  const bold = font.weight >= 600;
  const it = font.italic;
  const mono = fams.some((f) => /mono|courier|ocr/.test(f));
  const serif = !mono && fams.some((f) => f === "serif" || /times|georgia|garamond|serif$/.test(f) && !/sans/.test(f));
  if (mono) return (bold ? (it ? "Courier-BoldOblique" : "Courier-Bold") : it ? "Courier-Oblique" : "Courier") as StandardName;
  if (serif) return (bold ? (it ? "Times-BoldItalic" : "Times-Bold") : it ? "Times-Italic" : "Times-Roman") as StandardName;
  return (bold ? (it ? "Helvetica-BoldOblique" : "Helvetica-Bold") : it ? "Helvetica-Oblique" : "Helvetica") as StandardName;
}

/** Content-stream operators for a shape primitive, matching what the page draw calls emit. */
function shapeOperators(
  lib: typeof import("pdf-lib"),
  p: ColoredPrimitive,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  color: Color,
): PDFOperator[] {
  const zero = lib.degrees(0);
  switch (p.kind) {
    case "rect":
      return lib.drawRectangle({ x: X(p.x), y: Y(p.y + p.height), width: p.width * K, height: p.height * K, color, borderWidth: 0, borderColor: undefined, rotate: zero, xSkew: zero, ySkew: zero });
    case "line":
      return lib.drawLine({ start: { x: X(p.x1), y: Y(p.y1) }, end: { x: X(p.x2), y: Y(p.y2) }, thickness: p.strokeWidth * K, color });
    case "circle":
      return lib.drawEllipse({ x: X(p.cx), y: Y(p.cy), xScale: p.r * K, yScale: p.r * K, color: undefined, borderColor: color, borderWidth: p.strokeWidth * K });
    case "text":
      throw new Error("shapeOperators: text is not a shape");
  }
}

/** Writes the PDF and returns its bytes. `warnings` collects font substitutions and similar. */
export async function writePdf(input: WriteInput, warnings: string[]): Promise<Uint8Array> {
  const lib = await import("pdf-lib");
  const { PDFDocument, rgb, cmyk, pushGraphicsState, popGraphicsState, concatTransformationMatrix, rectangle, clip, endPath, PDFName, PDFString } = lib;
  const { beginText, endText, setFillingColor, setFontAndSize, setTextMatrix, showText } = lib;
  const { spec, marks } = input;
  const editable = input.editable === true;
  const [w, h] = spec.trim;
  const M = marks.margin;
  const pageW = (w + 2 * M) * K;
  const pageH = (h + 2 * M) * K;
  const X = (mm: number) => (mm + M) * K;
  const Y = (mm: number) => pageH - (mm + M) * K;

  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([pageW, pageH]);
  page.setMediaBox(0, 0, pageW, pageH);
  page.setBleedBox(X(-spec.bleed), Y(h + spec.bleed), (w + 2 * spec.bleed) * K, (h + 2 * spec.bleed) * K);
  page.setTrimBox(X(0), Y(h), w * K, h * K);

  const toColor = (c: DeviceColor): Color => (c.space === "rgb" ? rgb(c.r, c.g, c.b) : cmyk(c.c, c.m, c.y, c.k));

  // Fonts: registered font files are embedded; anything else maps to a standard font.
  const candidates = [...loadedFonts(), ...(input.fonts ?? [])];
  const fontCache = new Map<string, Promise<PDFFont>>();
  let fontkitRegistered = false;
  const woff2Warned = new Set<string>();
  // Family -> PostScript names, for the editable-mode font list.
  const fontsUsed = new Map<string, Set<string>>();
  const usedFonts = (family: string) => {
    let names = fontsUsed.get(family);
    if (!names) fontsUsed.set(family, (names = new Set()));
    return names;
  };
  const fontFor = (f: FontRef): Promise<PDFFont> => {
    let custom = matchFont(candidates, f.family, f.weight, f.italic);
    if (custom && isWoff2(custom.bytes)) {
      if (!woff2Warned.has(custom.source.family)) {
        woff2Warned.add(custom.source.family);
        warnings.push(
          editable
            ? `Font "${custom.source.family}" is WOFF2, which cannot be embedded; text in ${custom.source.family} will open in Illustrator as ${standardFontFor(f)}. Register a TTF, OTF or WOFF file for export.`
            : `Font "${custom.source.family}" is WOFF2, which cannot be embedded in v1; register a TTF, OTF or WOFF file for export.`,
        );
      }
      custom = undefined;
    }
    const key = custom ? `custom:${custom.source.family}:${custom.source.weight ?? 400}:${custom.source.style ?? "normal"}` : `std:${standardFontFor(f)}`;
    let p = fontCache.get(key);
    if (!p) {
      p = (async () => {
        if (custom) {
          if (!fontkitRegistered) {
            doc.registerFontkit((await loadFontkit()) as never);
            fontkitRegistered = true;
          }
          // pdf-lib copies unsubsetted font data verbatim, which is only valid for TTF/OTF.
          // Subsetting re-encodes WOFF as TrueType.
          const subset = isWoff(custom.bytes);
          if (!editable) return doc.embedFont(custom.bytes, { subset });
          // pdf-lib names fonts "<PostScript name>-<random digits>", which Illustrator
          // cannot match to an installed font. Use the real name, tagged when subset.
          const psName = ((await loadFontkit()).create(custom.bytes).postscriptName || custom.source.family).replace(/[^\x21-\x7e]|[()<>[\]{}/%#]/g, "");
          usedFonts(custom.source.family).add(psName);
          return doc.embedFont(custom.bytes, { subset, customName: subset ? `${subsetTag(psName)}+${psName}` : psName });
        }
        const std = standardFontFor(f);
        const first = (f.family.split(",")[0] ?? f.family).trim().replace(/^["']|["']$/g, "");
        if (!GENERIC.has(first.toLowerCase())) {
          const face = `${f.weight}${f.italic ? " italic" : ""}`;
          warnings.push(
            editable
              ? `Font "${first}" (${face}) is not registered; text in ${first} will open in Illustrator as ${std}. Register the font file with registerFont() to embed it.`
              : `Font "${first}" (${face}) is not registered; substituted ${std}. Register the font file with registerFont() to embed it.`,
          );
        }
        if (editable) usedFonts(std.split("-")[0]!).add(std);
        return doc.embedFont(std);
      })();
      fontCache.set(key, p);
    }
    return p;
  };

  const fontKeys = new Map<PDFFont, PDFName>();
  const fontKey = (font: PDFFont) => {
    let key = fontKeys.get(font);
    if (!key) fontKeys.set(font, (key = page.node.newFontDictionary(font.name, font.ref)));
    return key;
  };
  const widthMismatches: string[] = [];
  // Where the last text run ended, on screen (mm) and as drawn (pt), so the next
  // run on the same line follows the drawn text instead of overlapping it.
  let prevRun: { baseline: number; screenEnd: number; drawnEnd: number } | undefined;

  const draw = async (items: ColoredPrimitive[]) => {
    for (const p of items) {
      const color = toColor(p.color);
      switch (p.kind) {
        case "rect":
          page.drawRectangle({ x: X(p.x), y: Y(p.y + p.height), width: p.width * K, height: p.height * K, color });
          break;
        case "line":
          page.drawLine({ start: { x: X(p.x1), y: Y(p.y1) }, end: { x: X(p.x2), y: Y(p.y2) }, thickness: p.strokeWidth * K, color });
          break;
        case "circle":
          page.drawCircle({ x: X(p.cx), y: Y(p.cy), size: p.r * K, borderColor: color, borderWidth: p.strokeWidth * K });
          break;
        case "text": {
          const font = await fontFor(p.font);
          let text = p.text;
          if (font.getCharacterSet) {
            const set = new Set(font.getCharacterSet());
            const missing = [...text].filter((ch) => !set.has(ch.codePointAt(0)!));
            if (missing.length) {
              warnings.push(`Characters ${[...new Set(missing)].join(" ")} are not available in the PDF font for "${text}"; replaced with "?".`);
              text = [...text].map((ch) => (set.has(ch.codePointAt(0)!) ? ch : "?")).join("");
            }
          }
          const size = p.fontSize * K;
          const natural = font.widthOfTextAtSize(text, size);
          if (editable) {
            // Natural width, no transform: Illustrator shows 100% horizontal scale.
            if (p.width !== undefined && p.width > 0 && Math.abs(natural / (p.width * K) - 1) > WIDTH_TOLERANCE) {
              widthMismatches.push(`"${text}" (${Math.round((natural / (p.width * K)) * 100)}%)`);
            }
            const follows =
              prevRun && p.align !== "center" && Math.abs(p.baseline - prevRun.baseline) < 0.01 && Math.abs(p.x - prevRun.screenEnd) < 0.1;
            const x = follows ? prevRun!.drawnEnd : X(p.x) - (p.align === "center" ? natural / 2 : 0);
            const y = Y(p.baseline);
            prevRun = p.width !== undefined && p.align !== "center" ? { baseline: p.baseline, screenEnd: p.x + p.width, drawnEnd: x + natural } : undefined;
            page.pushOperators(
              beginText(),
              setFillingColor(color),
              setFontAndSize(fontKey(font), size),
              setTextMatrix(1, 0, 0, 1, x, y),
              showText(font.encodeText(text)),
              endText(),
            );
            if (p.underline) page.drawRectangle({ x, y: y - size * 0.12, width: natural, height: size * 0.06, color });
            break;
          }
          let sx = 1;
          if (p.width !== undefined && natural > 0) {
            sx = (p.width * K) / natural;
            if (sx < 0.5 || sx > 2) {
              warnings.push(`Text "${text}" would need ${Math.round(sx * 100)}% horizontal scaling to match the screen layout; drawn unscaled.`);
              sx = 1;
            }
          }
          const x = X(p.x) - (p.align === "center" ? (natural * sx) / 2 : 0);
          page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, 1, x, Y(p.baseline)));
          page.drawText(text, { x: 0, y: 0, size, font, color });
          if (p.underline) page.drawRectangle({ x: 0, y: -size * 0.12, width: natural, height: size * 0.06, color });
          page.pushOperators(popGraphicsState());
          break;
        }
      }
    }
  };

  if (editable) {
    // No outer clip: Illustrator turns it into a clip group around everything,
    // and the TrimBox and BleedBox already record the page geometry.
    await draw(input.artwork);
    // Illustrator flattens optional content (layers) and ignores q/Q, but opens a
    // Form XObject as a group, so the marks become one group that can be deleted.
    if (input.markPrimitives.length) {
      const ops = input.markPrimitives.flatMap((p) => shapeOperators(lib, p, X, Y, toColor(p.color)));
      const form = doc.context.obj({ Type: "XObject", Subtype: "Form", BBox: [0, 0, pageW, pageH] });
      const ref = doc.context.register(lib.PDFContentStream.of(form, ops));
      page.pushOperators(lib.drawObject(page.node.newXObject("Marks", ref)));
    }
    if (widthMismatches.length) {
      const shown = widthMismatches.slice(0, 5).join(", ");
      const more = widthMismatches.length > 5 ? ` and ${widthMismatches.length - 5} more` : "";
      warnings.push(
        `Text drawn at its natural width differs from the screen layout by more than ${WIDTH_TOLERANCE * 100}%: ${shown}${more}. Lines may break differently when edited in Illustrator.`,
      );
    }
    if (fontsUsed.size) {
      const list = [...fontsUsed].map(([family, names]) => `${family} (${[...names].join(", ")})`).join("; ");
      warnings.push(`Fonts used: ${list}. Text stays editable in Illustrator only where these fonts are installed.`);
    }
  } else {
    // Artwork, clipped to the bleed box.
    page.pushOperators(
      pushGraphicsState(),
      rectangle(X(-spec.bleed), Y(h + spec.bleed), (w + 2 * spec.bleed) * K, (h + 2 * spec.bleed) * K),
      clip(),
      endPath(),
    );
    await draw(input.artwork);
    page.pushOperators(popGraphicsState());
    await draw(input.markPrimitives);
  }

  doc.setTitle(input.title ?? spec.id);
  doc.setProducer("@crasi/prepress");
  doc.setCreator("@crasi/prepress");
  const now = new Date();
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  if (input.info) {
    const infoDict = (doc as unknown as { getInfoDict(): { set(k: unknown, v: unknown): void } }).getInfoDict();
    for (const [k, v] of Object.entries(input.info)) infoDict.set(PDFName.of(k), PDFString.of(v));
  }
  for (const a of input.attachments ?? []) {
    await doc.attach(a.data, a.name, { mimeType: a.mimeType, description: a.description, creationDate: now, modificationDate: now });
  }
  // pdf-lib otherwise yields with setTimeout every 50 objects; background tabs
  // throttle timers to as little as once a minute, which stalls the export.
  return doc.save({ objectsPerTick: Infinity });
}
