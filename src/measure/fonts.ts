/**
 * Font registry. Registering a font file gives preflight exact x-height
 * metrics read from the file, and lets exportPDF embed the same font.
 *
 * Nothing here runs at import time; fetching and parsing happen on demand.
 */

export interface FontSource {
  /** CSS font-family name the font is used under, e.g. "Inter". */
  family: string;
  /** Numeric weight, default 400. */
  weight?: number;
  style?: "normal" | "italic";
  /** URL, or the font file itself. TTF, OTF, WOFF and WOFF2 are supported. */
  src: string | ArrayBuffer | Uint8Array;
}

export interface LoadedFont {
  source: FontSource;
  bytes: Uint8Array;
  /** x-height divided by the em size, read from the font file. */
  xHeightRatio: number;
}

interface Entry {
  source: FontSource;
  promise: Promise<LoadedFont>;
  loaded?: LoadedFont;
  error?: unknown;
}

const entries: Entry[] = [];
const listeners = new Set<() => void>();

/** Lazily loads the font parser shared by preflight and export. */
export async function loadFontkit(): Promise<{ create(bytes: Uint8Array): FontkitFont }> {
  const mod: any = await import("@pdf-lib/fontkit");
  return mod.default ?? mod;
}

export interface FontkitFont {
  unitsPerEm: number;
  xHeight: number;
  glyphForCodePoint(cp: number): { id: number; bbox: { maxY: number } };
}

/** Reads the x-height ratio from a parsed font: OS/2 sxHeight, else the "x" glyph's bounds. */
export function xHeightRatioOf(font: FontkitFont): number {
  const fromTable = font.xHeight;
  if (fromTable > 0) return fromTable / font.unitsPerEm;
  const glyph = font.glyphForCodePoint(0x78);
  return glyph.id === 0 ? 0 : glyph.bbox.maxY / font.unitsPerEm;
}

async function load(source: FontSource): Promise<LoadedFont> {
  let bytes: Uint8Array;
  if (typeof source.src === "string") {
    const res = await fetch(source.src);
    if (!res.ok) throw new Error(`Failed to load font ${source.family} from ${source.src}: ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } else {
    bytes = source.src instanceof Uint8Array ? source.src : new Uint8Array(source.src);
  }
  const fontkit = await loadFontkit();
  const font = fontkit.create(bytes);
  return { source, bytes, xHeightRatio: xHeightRatioOf(font) };
}

function notify() {
  for (const l of [...listeners]) l();
}

/**
 * Registers a font file. Returns a promise that resolves once the file is
 * loaded and parsed. Registering the same family, weight and style again
 * replaces the earlier entry.
 */
export function registerFont(source: FontSource): Promise<LoadedFont> {
  const existing = entries.findIndex((e) => sameFace(e.source, source));
  if (existing >= 0) {
    const prev = entries[existing]!;
    if (prev.source.src === source.src) return prev.promise;
    entries.splice(existing, 1);
  }
  const entry: Entry = { source, promise: load(source) };
  entry.promise.then(
    (f) => {
      entry.loaded = f;
      notify();
    },
    (e) => {
      entry.error = e;
      notify();
    },
  );
  entries.push(entry);
  return entry.promise;
}

/** Waits for every registered font to finish loading (failures are ignored). */
export async function fontsSettled(): Promise<void> {
  await Promise.allSettled(entries.map((e) => e.promise));
}

export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Splits a CSS font-family list into lower-case names without quotes. */
export function parseFamilies(stack: string): string[] {
  return stack
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter(Boolean);
}

function sameFace(a: FontSource, b: FontSource) {
  return a.family.toLowerCase() === b.family.toLowerCase() && (a.weight ?? 400) === (b.weight ?? 400) && (a.style ?? "normal") === (b.style ?? "normal");
}

/**
 * Picks the best loaded face for a CSS font-family stack: first family in the
 * stack that is registered, then the closest weight, preferring a matching style.
 */
export function matchFont<T extends { source: FontSource }>(
  candidates: readonly T[],
  familyStack: string,
  weight: number,
  italic: boolean,
): T | undefined {
  for (const family of parseFamilies(familyStack)) {
    const faces = candidates.filter((c) => c.source.family.toLowerCase() === family);
    if (!faces.length) continue;
    const score = (c: T) =>
      Math.abs((c.source.weight ?? 400) - weight) + ((c.source.style ?? "normal") === (italic ? "italic" : "normal") ? 0 : 1000);
    return [...faces].sort((a, b) => score(a) - score(b))[0];
  }
  return undefined;
}

/** Loaded registered fonts. */
export function loadedFonts(): LoadedFont[] {
  return entries.flatMap((e) => (e.loaded ? [e.loaded] : []));
}
