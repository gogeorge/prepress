# Decisions

Short records of choices that are not obvious from the code.

## 1. PDF writing: pdf-lib

**Choice:** [`pdf-lib`](https://github.com/Hopding/pdf-lib) 1.17, loaded with a dynamic `import()` so it only downloads when `exportPDF` runs.

**Considered:**

| Library | For | Against |
|---|---|---|
| **pdf-lib** | Pure TypeScript, runs in browsers and Node with no shims. DeviceCMYK colours built in (`cmyk()`). Can set TrimBox and BleedBox, attach files, and push raw content-stream operators (clip paths, transformation matrices). Embeds TTF/OTF/WOFF/WOFF2 through fontkit. MIT. | No releases since 2022. No HTML or SVG rendering, so we draw everything ourselves. No Separation (spot) colour helper. |
| jsPDF (+ svg2pdf.js) | Actively maintained, large community, `html()` method. | `html()` rasterises through html2canvas, which is not acceptable for print text and barcodes. CMYK support is partial. No TrimBox/BleedBox API. Larger bundle. |
| PDFKit | Mature, good text layout, CMYK. | Built for Node; browser use needs a bundler with `fs` shims and a large standalone build. |
| Write from scratch | No dependency. | PDF object model, xref tables, font embedding and subsetting are a lot of code to get right. |

pdf-lib does the low-level part we need (boxes, CMYK, fonts, raw operators) and leaves layout to us, which is what we want: the browser lays the label out and the exporter copies that layout into vectors. Its lack of recent releases is the main risk; the API we use is small and the maintained fork `@cantoo/pdf-lib` is a drop-in replacement if needed.

A spot-colour pass can be added without changing the public API: pdf-lib exposes the low-level object model, so a later colour pass can register Separation colour spaces and emit `cs`/`scn` operators.

## 2. Font metrics: fontkit (via `@pdf-lib/fontkit`), with a canvas fallback

**Choice:** read x-height from the font file with [`@pdf-lib/fontkit`](https://github.com/Hopding/fontkit) when the consumer registers the font (`registerFont`). Otherwise measure the rendered `x` glyph with `CanvasRenderingContext2D.measureText().actualBoundingBoxAscent`.

**Considered:**

| Option | For | Against |
|---|---|---|
| **@pdf-lib/fontkit** | pdf-lib already needs it to embed custom fonts, so preflight and export read the same file with the same parser and we add no extra dependency. Reads OS/2 `sxHeight` and glyph bounding boxes. Reads TTF, OTF, WOFF and WOFF2. | Large (about 1.2 MB unminified), so it is loaded on demand. Fork of fontkit 1.x. |
| opentype.js 2 | Smaller, well-known. | A second font parser alongside the one pdf-lib needs. No WOFF2. |
| fontkit 2 (upstream) | Maintained. | pdf-lib expects the `@pdf-lib/fontkit` API; using both would ship two copies. |
| Canvas only | No dependency; measures exactly what the browser renders, including fallback fonts. | Measures glyph ink (includes overshoot) rather than the designed x-height; needs a DOM. |

Known limitation, found while testing the example: `@pdf-lib/fontkit` throws while subsetting composite glyphs (`,` `:` `ü` in Inter) from WOFF2 files, and pdf-lib copies unsubsetted font data verbatim, which is only valid for TTF/OTF. So the writer embeds TTF/OTF as-is, subsets WOFF (which re-encodes it as TrueType), and replaces WOFF2 with a standard font plus a warning. WOFF2 still works for preflight metrics.

Using the font file means "x-height" is the font designer's value (OS/2 `sxHeight`, or the `x` glyph's bounds if the table has none), which matches how the regulation is usually checked. The canvas fallback means every label still gets a real measurement from the glyph, not an estimate from the nominal font size. The issue message says which source was used.

## 3. Rendering for export: DOM measurement, not HTML-to-PDF conversion

Browsers cannot produce print PDFs (no CMYK, no bleed or marks), and HTML-to-canvas tools rasterise text. Instead each component describes what it prints as vector primitives (rectangles, text runs, lines) measured from the live DOM:

- Text is extracted per line fragment with DOM `Range` rectangles, so wrapping, hyphenation and `fit="shrink"` results are copied exactly. Each run is drawn with a horizontal scale that matches its measured width, so line breaks in the PDF match the screen even when the PDF font differs slightly.
- Barcodes are drawn from the encoder output, not from the SVG.
- Panels contribute background rectangles, extended into the bleed.

Pipeline: `render` (Artboard handle → display list) → `marks` → `colour pass` → `write`. Every stage after `render` is pure and runs in Node (`writePDF`), which is how it is unit-tested.

## 4. Colour in v1

Two colour passes ship: `rgb` (ink previews; default) and `cmyk` (DeviceCMYK from each ink's CMYK build). Either way the ink-to-CMYK map is returned from `exportPDF` and embedded in the PDF as an attached `prepress-inks.json` plus a `PrepressInks` Info entry. There is no ICC output intent; the PDF is not PDF/X.

The reserved ink name `paper` means "no ink" (knocked-out text). It never counts towards `maxInks`.

## 5. Build: plain `tsc`, twice

`tsc` emits one file per source module for ESM (`dist/esm`) and CJS (`dist/cjs`). Bundlers strip `"use client"` when they merge modules; per-file output keeps the directive on exactly the component modules, so Next.js treats them as client components while pure modules stay importable from server components. TypeScript 7 removed `moduleResolution: node10`, so the CJS build uses `module: CommonJS` with `moduleResolution: Bundler`.

Two entry points:

- `@crasi/prepress`: components, hooks and everything in `core`.
- `@crasi/prepress/core`: no React, no DOM. Units, inks, EAN-13, preflight engine and rules, DOM-free export stages.

## 6. `usePreflight` reads a module-level store

In the target API `usePreflight()` is called in the component that renders the `InkProvider` and `Artboard`, so it sits above them and cannot read their context. Artboards publish issues to a store (by default a shared module-level one) and the hook subscribes with `useSyncExternalStore`. The server snapshot is always empty, and artboards only publish from effects, so nothing leaks between server requests. Pass `{ artboard: id }` to scope the hook to one label, or a custom `store` to isolate trees.

## 7. `IngredientList` became `DeclarationList`

Not every label is food. The list component is generic: items with optional `highlight` (allergens, substances of concern), `percent` and nested `children`. Presets supply localised headings for food/cosmetics ingredients and textile composition; any other heading can be passed in. The `eu1169.xHeight` rule only applies to nodes marked mandatory; for non-food work, mark lists `mandatory={false}` or replace the rule.

## 8. Rules added beyond the brief

- `layout.overflow`: needed so `fit="shrink"` can say when text still does not fit at the legal minimum, and to catch content leaving its panel.
- `content.missing`: empty mandatory text and missing translations in a locale.

Panels do not clip their content on screen, so anything that overflows is visible and is what the PDF will contain.

## 9. Dielines never print in v1

Printing a dieline properly means a spot colour (often named `CutContour` or `Dieline`) set to overprint, which is the out-of-scope spot-colour work. `Dieline` loads the SVG through `<img>`, so scripts inside an untrusted SVG never run.

## 10. Exports keep working in background tabs

Browsers pause `requestAnimationFrame` and throttle `setTimeout` (down to once a minute) in background tabs. `flush()` waits for a frame or 50 ms, whichever comes first, and the writer calls pdf-lib's `save({ objectsPerTick: Infinity })` so it never yields to a throttled timer. Live preflight still runs on animation frames, so it pauses while a tab is hidden and catches up when it is shown.
