import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Artboard,
  Barcode,
  DeclarationList,
  Dieline,
  InkProvider,
  localize,
  MandatoryText,
  Panel,
  PreflightPanel,
  usePreflight,
} from "../src/index.js";

const inks = {
  black: { cmyk: [0, 0, 0, 100] as const, preview: "#000000" },
  brand: { cmyk: [0, 90, 80, 5] as const, preview: "#d42a2a" },
};

const product = {
  name: { en: "Hazelnut spread", de: "Haselnusscreme" },
  gtin: "4006381333931",
  ingredients: [
    { name: { en: "Sugar", de: "Zucker" } },
    { name: { en: "Hazelnuts", de: "Haselnüsse" }, highlight: true, percent: 13 },
    { name: { en: "Skimmed milk powder", de: "Magermilchpulver" }, highlight: { en: "milk", de: "milch" } },
  ],
};

function Label({ locale }: { locale: "en" | "de" }) {
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

describe("server rendering", () => {
  it("imports without touching window or document", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("renders the target API to HTML", () => {
    const html = renderToString(<Label locale="de" />);
    expect(html).toContain("Haselnusscreme");
    expect(html).toContain("Zutaten: </strong>");
    expect(html).toMatch(/<strong style="font-weight:700">Haselnüsse<\/strong> 13\s%/);
    expect(html).toContain("Mager<strong style=\"font-weight:700\">milch</strong>pulver");
    expect(html).toContain('aria-label="EAN-13 4006381333931"');
    expect(html).toContain("width:126mm");
    expect(html).toContain("No issues found.");
  });

  it("uppercases highlights per locale", () => {
    const html = renderToString(
      <DeclarationList items={[{ name: "Nuts", highlight: true }]} locale="en" highlightStyle="uppercase" heading={false} />,
    );
    expect(html).toContain("NUTS");
  });
});

describe("localize", () => {
  it("matches exact locale, then language, then falls back", () => {
    expect(localize({ en: "a", "de-AT": "b" }, "de-AT")).toEqual({ text: "b", missing: false });
    expect(localize({ en: "a", de: "b" }, "de-CH")).toEqual({ text: "b", missing: false });
    expect(localize({ en: "a", de: "b" }, "fr", "de")).toEqual({ text: "b", missing: true });
    expect(localize("plain", "fr")).toEqual({ text: "plain", missing: false });
  });
});
