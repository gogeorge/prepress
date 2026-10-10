"use client";

import { forwardRef } from "react";
import {
  Artboard,
  Barcode,
  DeclarationList,
  Dieline,
  InkProvider,
  MandatoryText,
  Panel,
  PreflightPanel,
  usePreflight,
  type ArtboardHandle,
} from "@crasi/prepress";
import { inks, product, type Locale } from "./product";

export interface LabelProps {
  locale: Locale;
  /** Print the storage line at 5 pt, below the legal x-height minimum. */
  deliberateError: boolean;
  showDieline: boolean;
  showGuides: boolean;
}

export const Label = forwardRef<ArtboardHandle, LabelProps>(function Label({ locale, deliberateError, showDieline, showGuides }, ref) {
  const id = `label-${locale}`;
  const { issues } = usePreflight({ artboard: id });
  return (
    <InkProvider inks={inks} maxInks={2}>
      <div className="row">
        <div className="artboard-wrap">
          <Artboard
            ref={ref}
            id={id}
            trim={[120, 80]}
            bleed={3}
            safe={4}
            unit="mm"
            largestSurfaceCm2={96}
            zoom={1.6}
            guides={showGuides}
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            <Dieline src="/dies/flowpack.svg" visible={showDieline} />

            <Panel name="front" x={0} y={0} width={60} height={80} background="brand" bleed padding={6} style={{ justifyContent: "space-between" }}>
              <MandatoryText role="name" ink="paper" size={17} weight={700} lineHeight={1.05} lang={locale}>
                {product.name[locale]}
              </MandatoryText>
              <MandatoryText role="netQuantity" ink="paper" size={14} weight={700}>
                {product.netQuantity[locale]}
              </MandatoryText>
            </Panel>

            <Panel name="back" x={62} y={6} width={54} height={68} gap={1.6}>
              <MandatoryText role="name" ink="black" weight={700} lang={locale}>
                {product.name[locale]}
              </MandatoryText>
              <DeclarationList
                items={product.ingredients}
                locale={locale}
                preset="ingredients"
                highlightStyle="bold"
                fit="shrink"
                size={9}
                ink="black"
              />
              <MandatoryText role="storage" ink="black" size={deliberateError ? 5 : 6.5} lang={locale}>
                {product.storage[locale]}
              </MandatoryText>
              <Barcode type="ean13" value={product.gtin} magnification={0.9} ink="black" />
            </Panel>
          </Artboard>
        </div>
        <div className="side">
          <PreflightPanel issues={issues} title={`Preflight · ${locale.toUpperCase()}`} />
        </div>
      </div>
    </InkProvider>
  );
});
