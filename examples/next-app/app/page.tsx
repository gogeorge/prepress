// Server component. Pure helpers from "@crasi/prepress/core" run here; the
// label itself is a client component because it measures the DOM.
import { ean13Geometry, validateEan13 } from "@crasi/prepress/core";
import { LabelDemo } from "./LabelDemo";
import { product } from "./product";

export default function Page() {
  const gtin = validateEan13(product.gtin);
  const g = ean13Geometry(0.9);
  return (
    <main>
      <h1>@crasi/prepress example</h1>
      <p className="lede">
        One 120 × 80 mm label in two locales. GTIN {gtin.valid ? gtin.digits : product.gtin} ({gtin.valid ? "valid" : "invalid"}, checked on the
        server); barcode at 90% is {g.totalWidth.toFixed(2)} mm wide including quiet zones. The storage line is set at 5 pt on purpose so preflight
        reports an x-height error; untick the box to fix it.
      </p>
      <LabelDemo />
      <p className="note">Preflight checks assist review. They are not legal or regulatory sign-off.</p>
    </main>
  );
}
