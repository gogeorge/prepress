/**
 * Export pipeline: render -> marks -> colour pass -> write.
 *
 * `exportPDF` runs the render stage from a mounted Artboard. `writePDF` runs
 * the remaining stages from a display list and works without a DOM.
 */
import { PAPER, REGISTRATION, resolveInk, type Ink, type InkMap } from "../inks/index.js";
import { atLeast, PreflightError } from "../preflight/engine.js";
import type { ArtboardSpec, Issue, Level } from "../preflight/types.js";
import { registerFont, type FontSource, type LoadedFont } from "../measure/fonts.js";
import { applyColorPass, cmykColorPass, rgbColorPass, type ColorPass } from "./color.js";
import { buildMarks, resolveMarks, type MarksOptions } from "./marks.js";
import type { Primitive } from "./types.js";
import { writePdf } from "./writer.js";

/** What `exportPDF` needs from an Artboard: its ref handle satisfies this. */
export interface ExportSource {
  readonly spec: ArtboardSpec;
  readonly inks: InkMap;
  flush(): Promise<{ issues: Issue[] }>;
  paint(): Primitive[];
}

export interface WritePDFOptions {
  /** Crop and registration marks. `false` for none (page = trim + bleed). Default true. */
  marks?: boolean | MarksOptions;
  /** "rgb" (ink previews, default) or "cmyk" (DeviceCMYK from the ink builds). */
  colorMode?: "rgb" | "cmyk";
  /** Custom colour pass; overrides `colorMode`. */
  colorPass?: ColorPass;
  /** Fonts to embed in addition to those registered with `registerFont`. */
  fonts?: FontSource[];
  /** PDF document title. Default: the artboard id. */
  title?: string;
}

export interface ExportPDFOptions extends WritePDFOptions {
  /** Reject when preflight has issues at or above this level. "never" always exports. Default "error". */
  failOn?: Level | "never";
}

export interface ExportResult {
  /** The PDF file. */
  bytes: Uint8Array;
  /** The PDF as a Blob, where Blob is available. */
  blob: Blob | undefined;
  /** Ink-to-CMYK map for the inks the artwork uses (paper excluded) (also embedded in the PDF as prepress-inks.json). */
  inks: Record<string, Ink>;
  /** Preflight issues at the time of export. */
  issues: Issue[];
  /** Non-fatal export problems, such as font substitutions. */
  warnings: string[];
  /** Page size [width, height] in mm (trim + bleed + mark area). */
  pageSizeMm: [number, number];
}

/** Runs the marks, colour and write stages on a display list. Works in Node. */
export async function writePDF(
  input: { spec: ArtboardSpec; inks: InkMap; primitives: readonly Primitive[]; issues?: Issue[] },
  options: WritePDFOptions = {},
): Promise<ExportResult> {
  const warnings: string[] = [];
  const { spec, inks } = input;

  // Marks
  const marks = resolveMarks(spec, options.marks);
  const markPrims = buildMarks(spec, marks);

  // Colour pass
  const pass = options.colorPass ?? (options.colorMode === "cmyk" ? cmykColorPass : rgbColorPass);
  const artwork = applyColorPass(input.primitives, pass, inks, warnings);
  const markColored = applyColorPass(markPrims, pass, inks, warnings);

  const used: Record<string, Ink> = {};
  for (const p of input.primitives) {
    const name = p.kind === "line" || p.kind === "circle" ? p.stroke : p.fill;
    const ink = name !== REGISTRATION && name !== PAPER ? resolveInk(name, inks) : undefined;
    if (ink) used[name] = ink;
  }

  // Write
  const fonts: LoadedFont[] = options.fonts ? await Promise.all(options.fonts.map(registerFont)) : [];
  const inkJson = JSON.stringify({ colorMode: pass.name, inks: used }, null, 2);
  const writeInput: Parameters<typeof writePdf>[0] = {
    spec,
    marks,
    artwork,
    markPrimitives: markColored,
    fonts,
    info: { PrepressInks: JSON.stringify(used), PrepressColorMode: pass.name },
    attachments: [
      { name: "prepress-inks.json", data: new TextEncoder().encode(inkJson), mimeType: "application/json", description: "Ink to CMYK map" },
    ],
  };
  if (options.title !== undefined) writeInput.title = options.title;
  const bytes = await writePdf(writeInput, warnings);

  return {
    bytes,
    blob: typeof Blob !== "undefined" ? new Blob([bytes as BlobPart], { type: "application/pdf" }) : undefined,
    inks: used,
    issues: input.issues ?? [],
    warnings,
    pageSizeMm: [spec.trim[0] + 2 * marks.margin, spec.trim[1] + 2 * marks.margin],
  };
}

/**
 * Exports a mounted Artboard to PDF. Pass the Artboard's ref (or its handle).
 * Rejects with a `PreflightError` when preflight has issues at or above `failOn`.
 */
export async function exportPDF(
  source: ExportSource | { readonly current: ExportSource | null },
  options: ExportPDFOptions = {},
): Promise<ExportResult> {
  const handle = "current" in source ? source.current : source;
  if (!handle) throw new Error("exportPDF: the Artboard ref is not attached; is the Artboard mounted?");

  const { issues } = await handle.flush();
  const failOn = options.failOn ?? "error";
  if (failOn !== "never") {
    const blocking = issues.filter((i) => atLeast(i.level, failOn));
    if (blocking.length) throw new PreflightError(blocking, failOn);
  }

  // Render
  const primitives = handle.paint();
  return writePDF({ spec: handle.spec, inks: handle.inks, primitives, issues }, options);
}

/** Saves an export result as a file download (browser only). */
export function downloadPDF(result: Pick<ExportResult, "bytes">, filename = "label.pdf"): void {
  const url = URL.createObjectURL(new Blob([result.bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
