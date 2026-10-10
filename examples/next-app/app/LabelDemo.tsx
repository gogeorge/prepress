"use client";

import { useEffect, useRef, useState } from "react";
import { downloadPDF, exportPDF, PreflightError, registerFont, type ArtboardHandle } from "@crasi/prepress";
import { Label } from "./Label";
import { locales, type Locale } from "./product";

function ExportButtons({ locale, target }: { locale: Locale; target: React.RefObject<ArtboardHandle | null> }) {
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  async function run(failOn: "error" | "never") {
    setStatus({ text: "Exporting…", error: false });
    try {
      const result = await exportPDF(target, { marks: true, failOn, colorMode: "cmyk", title: `Label ${locale}` });
      downloadPDF(result, `label-${locale}.pdf`);
      const [w, h] = result.pageSizeMm;
      const lines = [`Exported ${w} × ${h} mm (trim + bleed + marks), ${result.bytes.length.toLocaleString()} bytes.`];
      if (result.issues.length) lines.push(`Exported despite ${result.issues.length} preflight issue(s).`);
      lines.push(...result.warnings.map((w) => `Warning: ${w}`));
      setStatus({ text: lines.join("\n"), error: false });
    } catch (e) {
      const text = e instanceof PreflightError ? `Blocked by preflight (failOn: "error"):\n${e.issues.map((i) => `• [${i.rule}] ${i.node}`).join("\n")}` : String(e);
      setStatus({ text, error: true });
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="buttons">
        <button className="action primary" onClick={() => run("error")}>Export PDF</button>
        <button className="action" onClick={() => run("never")}>Export anyway</button>
      </div>
      {status && <p className={`result${status.error ? " error" : ""}`} role="status">{status.text}</p>}
    </div>
  );
}

export function LabelDemo() {
  const [deliberateError, setDeliberateError] = useState(true);
  const [showDieline, setShowDieline] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const refs = { en: useRef<ArtboardHandle>(null), de: useRef<ArtboardHandle>(null) };

  // Font files give preflight exact x-heights and let the PDF embed the same font.
  useEffect(() => {
    void registerFont({ family: "Inter", weight: 400, src: "/fonts/inter-latin-400-normal.woff" });
    void registerFont({ family: "Inter", weight: 700, src: "/fonts/inter-latin-700-normal.woff" });
  }, []);

  return (
    <>
      <div className="controls">
        <label>
          <input type="checkbox" checked={deliberateError} onChange={(e) => setDeliberateError(e.target.checked)} />
          Deliberate error (5 pt storage text)
        </label>
        <label>
          <input type="checkbox" checked={showDieline} onChange={(e) => setShowDieline(e.target.checked)} />
          Dieline
        </label>
        <label>
          <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
          Guides
        </label>
      </div>
      <div className="labels">
        {locales.map((locale) => (
          <section key={locale} className="card" aria-label={`Label, ${locale}`}>
            <h2>{locale === "en" ? "English" : "Deutsch"}</h2>
            <Label ref={refs[locale]} locale={locale} deliberateError={deliberateError} showDieline={showDieline} showGuides={showGuides} />
            <div style={{ marginTop: 16 }}>
              <ExportButtons locale={locale} target={refs[locale]} />
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
