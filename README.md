# @crasi/prepress

React components for building print-ready labels and packaging artwork in the browser. You work in millimetres, inks and regulations instead of pixels, hex codes and viewports. A preflight engine reports production and compliance problems before a file reaches a printer, and `exportPDF()` writes a vector PDF with crop and registration marks.

It is a library, not an app. It is meant for developers building their own tools: internal label managers, web-to-print storefronts, artwork approval portals.

> **Preflight assists review. It is not legal or regulatory sign-off.** The checks catch common production and labelling mistakes, but they do not cover every requirement of any regulation, and a passing preflight does not mean a label is compliant. A qualified person must still review every label before it is printed or sold.

## Installation

```bash
npm install @crasi/prepress
```

`react` and `react-dom` 18 or 19 are peer dependencies. `pdf-lib` and `@pdf-lib/fontkit` are installed as dependencies and loaded on demand (only when you export or register a font file).

No CSS framework is required; components use inline styles.

## Example

```jsx
"use client";
import {
  Artboard, Dieline, Panel, InkProvider,
  MandatoryText, DeclarationList, Barcode,
  usePreflight, PreflightPanel,
} from "@crasi/prepress";

const inks = {
  black: { cmyk: [0, 0, 0, 100], preview: "#000000" },
  brand: { cmyk: [0, 90, 80, 5], preview: "#d42a2a" },
};

export function Label({ product, locale }) {
  const { issues } = usePreflight();
  return (
    <InkProvider inks={inks} maxInks={2}>
      <Artboard trim={[120, 80]} bleed={3} safe={4} unit="mm" largestSurfaceCm2={96}>
        <Dieline src="/dies/flowpack.svg" />
        <Panel name="back" x={62} y={6} width={54} height={68}>
          <MandatoryText role="name" ink="black">{product.name[locale]}</MandatoryText>
          <DeclarationList items={product.ingredients} locale={locale} preset="ingredients" highlightStyle="bold" fit="shrink" />
          <Barcode type="ean13" value={product.gtin} magnification={0.9} ink="black" />
        </Panel>
      </Artboard>
      <PreflightPanel issues={issues} />
    </InkProvider>
  );
}
```

Exporting:

```jsx
import { useRef } from "react";
import { exportPDF, downloadPDF, PreflightError } from "@crasi/prepress";

const ref = useRef(null); // <Artboard ref={ref} ...>

try {
  const result = await exportPDF(ref, { marks: true, failOn: "error" });
  downloadPDF(result, "label.pdf");
} catch (e) {
  if (e instanceof PreflightError) console.table(e.issues);
}
```

A complete Next.js App Router example lives in [`examples/next-app`](examples/next-app): one label in English and German, a deliberate preflight error, and PDF export.

```bash
npm install && npm run build && npm run dev --workspace prepress-next-example
```

## Concepts

- **Units.** All geometry is in millimetres internally. `Artboard` accepts `unit="mm" | "pt" | "in"` for its own and its panels' geometry. Font sizes are always in points.
- **Coordinates.** The origin is the top-left corner of the trim. Bleed extends into negative coordinates.
- **Inks.** Every colour is a named ink declared on `InkProvider`. Components take ink names, never raw colours. The reserved ink `paper` means "no ink" (knocked-out text) and does not count towards `maxInks`.
- **Next.js.** Components that measure the DOM are client components (`"use client"`). Nothing touches `window` or `document` at import time. Pure logic is available from `@crasi/prepress/core`, which has no React or DOM dependency and is safe in server components and Node.

## Components

### `InkProvider`

Declares the inks the artwork may use.

| Prop | Type | Default | Description |
|---|---|---|---|
| `inks` | `Record<string, { cmyk: [c, m, y, k]; preview: string; label?: string }>` | required | Allowed inks. CMYK values are 0–100; `preview` is the on-screen colour (hex). |
| `maxInks` | `number` | none | Maximum number of distinct inks used. Checked by `inkLimit`. |
| `defaultInk` | `string` | first declared ink | Ink for components without an `ink` prop. |
| `children` | `ReactNode` | | |

Without an `InkProvider`, components use a single `black` ink.

### `Artboard`

Root canvas. Renders the bleed area, trim, and guides; measures its content; runs preflight; publishes issues.

| Prop | Type | Default | Description |
|---|---|---|---|
| `trim` | `[width, height]` | required | Trim size in `unit`. |
| `bleed` | `number` | `3` mm | Bleed on every side, in `unit`. |
| `safe` | `number` | `3` mm | Safe margin inside the trim, in `unit`. |
| `unit` | `"mm" \| "pt" \| "in"` | `"mm"` | Unit for `trim`, `bleed`, `safe` and `Panel` geometry. |
| `largestSurfaceCm2` | `number` | none | Area of the package's largest surface. Below 80 cm² the x-height minimum is 0.9 mm instead of 1.2 mm. When unset, 1.2 mm is assumed. |
| `id` | `string` | generated | Identifies the artboard in issues and in `usePreflight({ artboard })`. |
| `zoom` | `number` | `1` | On-screen magnification. `1` renders at CSS millimetres. Does not affect measurements. |
| `guides` | `boolean` | `true` | Show bleed (red dashed), trim (black) and safe-zone (blue dashed) guides. The bleed area is shaded. |
| `showIssues` | `boolean` | `true` | Outline areas with issues (red for errors, amber for warnings). |
| `rules` | `PreflightRule[]` | `defaultRules` | Rules to run. |
| `store` | `PreflightStore` | shared store | Where issues are published. |
| `onPreflight` | `(issues: Issue[]) => void` | | Called when the set of issues changes. |
| `className`, `style` | | | Applied to the outer element. Set `fontFamily` here to style all text. |
| `ref` | `Ref<ArtboardHandle>` | | Pass to `exportPDF`. |

`ArtboardHandle` exposes `id`, `spec` (trim/bleed/safe in mm), `inks`, `maxInks`, `element`, `flush()` (wait for fonts, measure and run preflight now) and `paint()` (the vector display list).

### `Dieline`

Overlays an SVG dieline. Non-printing: it is never measured, preflighted or exported.

| Prop | Type | Default | Description |
|---|---|---|---|
| `src` | `string` | required | SVG URL. Loaded as an `<img>`, so scripts inside the file never run. |
| `visible` | `boolean` | `true` | Toggle on-screen display. |
| `area` | `"trim" \| "bleed"` | `"trim"` | Box the SVG's viewBox is stretched over. |
| `opacity` | `number` | `0.9` | On-screen opacity. |
| `className`, `style` | | | |

### `Panel`

A positioned region of the artboard. Children are laid out in a flex column.

| Prop | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | Prefixes the identifiers of its contents in issues (`back/Barcode`). |
| `x`, `y`, `width`, `height` | `number` | required | Geometry in the artboard's `unit`, relative to the trim's top-left. |
| `background` | `string` (ink) | none | Fill the panel with an ink. |
| `bleed` | `boolean` | `false` | Extend the background into the bleed on every side where the panel touches the trim edge. |
| `padding` | `number` | `0` | Inner padding, in the artboard's `unit`. |
| `gap` | `number` | `0` | Gap between children, in the artboard's `unit`. |
| `className`, `style` | | | `style` can override the flex layout. |

Panels do not clip their content. Anything that overflows is visible on screen, is exported, and is reported by `layout.overflow`.

### `MandatoryText`

Text that must meet the legal minimum x-height.

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | | The text. Nested elements are fine; every run is measured. |
| `role` | `string` | none | What the text is (`"name"`, `"netQuantity"`, `"storage"`...). Appears in issue identifiers. |
| `ink` | `string` | provider default | Ink name. |
| `size` | `number` | `9` | Font size in points. |
| `weight` | `number` | `400` | Font weight. |
| `fontFamily` | `string` | inherited | CSS font family. |
| `align` | `"left" \| "center" \| "right"` | | Text alignment. |
| `lineHeight` | `number` | `1.2` | Multiple of the font size. |
| `as` | `"div" \| "p" \| "span" \| "h1"`–`"h6"` | `"div"` | Element to render. |
| `lang` | `string` | | Language, for hyphenation and case mapping. |
| `name` | `string` | derived | Overrides the identifier in issues. |
| `className`, `style` | | | |

The x-height is measured from the font, not inferred from the font size: from the font file when it is registered with `registerFont`, otherwise from the rendered `x` glyph. Issue messages say which source was used.

### `DeclarationList`

A localised list of declared components: food or cosmetic ingredients, textile fibre composition, detergent components and similar. Highlighted items (allergens, substances of concern) are emphasised.

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `DeclarationItem[]` | required | See below. |
| `locale` | `string` | required | Locale to render (`"de"`, `"de-AT"`...). Falls back from region to language. |
| `fallbackLocale` | `string` | first available | Used when an item has no translation. Missing translations are still reported by `content.missing`. |
| `preset` | `"ingredients" \| "composition" \| "none"` | `"none"` | Localised heading for the 24 EU languages ("Ingredients:", "Zusammensetzung:"...). Review the defaults for your product. |
| `heading` | `LocalizedString \| false` | from preset | Custom heading, or `false` for none. |
| `highlightStyle` | `"bold" \| "uppercase" \| "underline" \| "bold-uppercase"` | `"bold"` | How highlighted items are emphasised. |
| `fit` | `"none" \| "shrink"` | `"none"` | `"shrink"` fills the remaining height of the panel and reduces the font size until the list fits, never below the legal minimum x-height (or `minSize`). If it still does not fit, `layout.overflow` reports it. |
| `size` | `number` | `8` | Font size in points. |
| `minSize` | `number` | | Smallest size for `fit="shrink"`, in points. The legal minimum always applies too. |
| `ink` | `string` | provider default | Ink name. |
| `fontFamily`, `lineHeight` | | inherited, `1.2` | |
| `separator` | `string` | `", "` | Between items. |
| `terminator` | `string` | `"."` | After the last item. |
| `mandatory` | `boolean` | `true` | Subject to the x-height rule. |
| `role` | `string` | preset or `"list"` | Used in issue identifiers. |
| `name` | `string` | derived | Overrides the identifier in issues. |
| `className`, `style` | | | |

```ts
type LocalizedString = string | Record<string, string>;

interface DeclarationItem {
  name: LocalizedString;
  highlight?: boolean | LocalizedString; // true, or the part of the name to emphasise
  percent?: number;                      // printed after the name, formatted for the locale
  children?: DeclarationItem[];          // compound item, printed in parentheses
}
```

```jsx
<DeclarationList
  locale="de"
  preset="ingredients"
  items={[
    { name: { en: "Sugar", de: "Zucker" } },
    { name: { en: "Skimmed milk powder", de: "Magermilchpulver" }, highlight: { en: "milk", de: "milch" } },
  ]}
/>
// Zutaten: Zucker, Mager**milch**pulver.

<DeclarationList locale="en" preset="composition" mandatory={false}
  items={[{ name: "Cotton", percent: 80 }, { name: "Polyester", percent: 20 }]} />
// Composition: Cotton 80%, Polyester 20%.
```

### `Barcode`

EAN-13 rendered as SVG, with quiet zones reserved on both sides.

| Prop | Type | Default | Description |
|---|---|---|---|
| `type` | `"ean13"` | required | Only EAN-13 in v1. |
| `value` | `string` | required | 13 digits, or 12 digits to have the check digit computed. |
| `magnification` | `number` | `1` | 1 = 100% = 0.330 mm X-dimension. GS1 allows 0.8–2.0. |
| `ink` | `string` | provider default | Ink for bars and digits. |
| `showDigits` | `boolean` | `true` | Print the human-readable digits. |
| `digitFont` | `string` | OCR-B / monospace stack | Font for the digits. |
| `name` | `string` | derived | Overrides the identifier in issues. |
| `className`, `style` | | | |

The X-dimension is measured from the rendered size, so CSS scaling is detected.

### `PreflightPanel`

Lists issues, errors first.

| Prop | Type | Default | Description |
|---|---|---|---|
| `issues` | `Issue[]` | required | Usually from `usePreflight()`. |
| `title` | `ReactNode` | `"Preflight"` | Heading. |
| `emptyMessage` | `ReactNode` | `"No issues found."` | Shown when there are no issues. |
| `showArtboard` | `boolean` | `false` | Prefix issues with their artboard id. |
| `onSelect` | `(issue: Issue) => void` | | Makes issues clickable. |
| `className`, `style` | | | |

## Hooks and functions

### `usePreflight(options?)`

Returns `{ issues, errors, warnings, ok }`. Works anywhere in the tree, including above the `Artboard` and `InkProvider`. Options:

- `artboard`: only issues from the artboard with this `id` (use this when a page shows several labels).
- `store`: read from a custom store created with `createPreflightStore()`.

Issues appear after the artboard has been measured in the browser; during server rendering the list is empty.

### `exportPDF(ref, options?)`

Exports a mounted artboard. Returns `Promise<ExportResult>`.

Pipeline: **render** (vector display list measured from the DOM) → **marks** → **colour pass** → **write**.

| Option | Type | Default | Description |
|---|---|---|---|
| `failOn` | `"error" \| "warn" \| "never"` | `"error"` | Reject with a `PreflightError` (carrying `issues`) when preflight has issues at or above this level. |
| `marks` | `boolean \| { crop?, registration?, offset?, length?, strokeWidth? }` | `true` | Crop and registration marks, drawn as vectors outside the bleed. Offset defaults to bleed + 1 mm, length to 5 mm. `false` gives a page of trim + bleed. |
| `colorMode` | `"rgb" \| "cmyk"` | `"rgb"` | `rgb` uses ink previews; `cmyk` writes DeviceCMYK from the ink builds. |
| `colorPass` | `ColorPass` | | Custom colour pass; overrides `colorMode`. |
| `fonts` | `FontSource[]` | | Fonts to embed in addition to registered ones. |
| `title` | `string` | artboard id | PDF title. |
| `editable` | `boolean` | `false` | PDF for editing in Adobe Illustrator. See [PDF for Illustrator](#pdf-for-illustrator). When `false`, output is unchanged. |

`ExportResult`: `bytes` (`Uint8Array`), `blob`, `inks` (ink-to-CMYK map of the inks used), `issues`, `warnings` (font substitutions and similar), `pageSizeMm`.

The page is trim + bleed + mark area. TrimBox and BleedBox are set. Artwork is clipped to the bleed. Text is vector text; each line is scaled horizontally to match its measured on-screen width so line breaks match the screen. The ink map is embedded as an attached `prepress-inks.json` and in the `PrepressInks` Info entry. v1 output is not PDF/X and has no ICC output intent.

#### PDF for Illustrator

`editable: true` writes a PDF that a designer can open in Illustrator and edit without cleaning it up first:

```tsx
const result = await exportPDF(ref, { marks: true, editable: true });
downloadPDF(result, "label-illustrator.pdf");
```

- **No clip group.** There is no clip around the artwork. TrimBox and BleedBox are still set.
- **Editable text.** Every text run is a point-text object at 100% horizontal scale, in the right font when that font is installed. Embedded fonts keep their real PostScript name so Illustrator can match them. `warnings` lists every font used.
- **Marks.** Crop and registration marks are one group that you can select and delete separately from the artwork.

What it costs, and what Illustrator does not keep (tested in Illustrator 2024, see `DECISIONS.md` §11):

- Text is drawn at the PDF font's natural width, not squeezed to the screen. A line can come out slightly longer or shorter than on screen. `warnings` lists runs that differ by more than 3%.
- Each style run is its own text object: a line with bold allergens is several objects. Illustrator splits text at every font change, whatever the PDF says.
- Everything is on one layer. Illustrator flattens PDF layers.
- The marks group is a clip group, clipped to the page. That is how Illustrator opens every PDF group.
- Dielines are not included. Illustrator would open them as printing paths.

Other export helpers: `downloadPDF(result, filename)` (browser) and `writePDF({ spec, inks, primitives }, options)`, which runs the marks, colour and write stages on a display list without a DOM (Node or server).

### `registerFont({ family, weight?, style?, src })`

Registers a font file (URL or bytes). Preflight then reads the x-height from the file, and `exportPDF` embeds the font. TTF, OTF and WOFF work for both; WOFF2 works for preflight metrics only and is replaced by a standard font in the PDF (with a warning), because the font library cannot yet subset it reliably. Unregistered fonts are replaced in the PDF by the nearest standard PDF font (Helvetica, Times or Courier) with a warning. Call it in an effect or event handler, not at module scope, so it does not run during server rendering.

## Preflight rules

| Rule id | Level | Check |
|---|---|---|
| `eu1169.xHeight` | error (warn if unmeasurable) | Mandatory text x-height ≥ 1.2 mm, or ≥ 0.9 mm when `largestSurfaceCm2` < 80 (EU Regulation 1169/2011, Article 13). Measured from font metrics, not the nominal font size. The message suggests the smallest point size that passes. |
| `gs1.xDimension` | error | EAN-13 X-dimension between 0.264 mm and 0.660 mm (0.330 mm = 100%). |
| `gs1.quietZone` | error | EAN-13 quiet zone ≥ 11X on the left and ≥ 7X on the right, inside the trim, with no other text or barcode intruding. |
| `gs1.checkDigit` | error | EAN-13 value is 12 or 13 digits and the check digit is valid. |
| `safeZone` | error | No text or barcode between the safe margin and the trim edge. |
| `bleed` | error / warn | Backgrounds that touch the trim edge extend to the full bleed (error). Backgrounds that stop less than 1 mm short of the trim risk a sliver after cutting (warn). |
| `inkLimit` | error | Distinct inks used ≤ `maxInks`; every ink name is declared; no rendered colour that is not a declared ink. |
| `layout.overflow` | error | Text and barcodes stay inside their panel; `fit="shrink"` text fits its box at the smallest allowed size. |
| `content.missing` | error | Mandatory text is not empty; every list item has a translation for the label's locale. |

`eu1169.xHeight` is an EU food-labelling rule. For other products, set `mandatory={false}` on text it should not apply to, or leave it out of `rules`.

### Issue shape

```ts
type Issue = {
  level: "error" | "warn";
  rule: string;      // e.g. "eu1169.xHeight"
  node: string;      // e.g. "back/MandatoryText[storage]"
  message: string;   // includes measured and required values
  artboard?: string; // artboard id
  bbox?: Rect;       // affected area in mm
};
```

### Custom rules

Rules are plain objects with an `id` and a pure `check(document)` function. The document contains the artboard spec, inks, and every measured node (panels, text, barcodes) with geometry in mm.

```ts
import { defaultRules, defineRule } from "@crasi/prepress/core";

const barcodeOnBack = defineRule({
  id: "acme.barcodeOnBack",
  description: "Barcodes go on the back panel",
  check: (doc) =>
    doc.nodes
      .filter((n) => n.kind === "barcode" && n.panel !== "back")
      .map((n) => ({ level: "warn", node: n.id, message: `Barcode is on panel "${n.panel}", expected "back".`, bbox: n.bbox })),
});

<Artboard rules={[...defaultRules, barcodeOnBack]} ... />
```

`runPreflight(document, rules)` runs rules outside React, for example on the server against a stored document. A rule that throws is reported as an error issue instead of stopping the run.

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
```

## Out of scope for v1

Spot colour separations, barcode types other than EAN-13, non-EU regulations, a visual drag-and-drop editor, and multi-page documents. The ink model and export pipeline are structured so spot colours can be added without changing the public API.

## License

MIT
