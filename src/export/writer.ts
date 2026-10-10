/**
 * Write stage: draws a coloured display list into a PDF with pdf-lib.
 * Runs in the browser and in Node (no DOM). pdf-lib and fontkit are loaded
 * on first use so they stay out of the main bundle.
 */
import type { PDFFont, PDFPage, Color } from "pdf-lib";
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

/** Writes the PDF and returns its bytes. `warnings` collects font substitutions and similar. */
export async function writePdf(input: WriteInput, warnings: string[]): Promise<Uint8Array> {
  const lib = await import("pdf-lib");
  const { PDFDocument, rgb, cmyk, pushGraphicsState, popGraphicsState, concatTransformationMatrix, rectangle, clip, endPath, PDFName, PDFString } = lib;
  const { spec, marks } = input;
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
  const fontFor = (f: FontRef): Promise<PDFFont> => {
    let custom = matchFont(candidates, f.family, f.weight, f.italic);
    if (custom && isWoff2(custom.bytes)) {
      if (!woff2Warned.has(custom.source.family)) {
        woff2Warned.add(custom.source.family);
        warnings.push(`Font "${custom.source.family}" is WOFF2, which cannot be embedded in v1; register a TTF, OTF or WOFF file for export.`);
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
          return doc.embedFont(custom.bytes, { subset: isWoff(custom.bytes) });
        }
        const std = standardFontFor(f);
        const first = (f.family.split(",")[0] ?? f.family).trim().replace(/^["']|["']$/g, "");
        if (!GENERIC.has(first.toLowerCase())) warnings.push(`Font "${first}" (${f.weight}${f.italic ? " italic" : ""}) is not registered; substituted ${std}. Register the font file with registerFont() to embed it.`);
        return doc.embedFont(std);
      })();
      fontCache.set(key, p);
    }
    return p;
  };

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
