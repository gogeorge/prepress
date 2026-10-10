"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { InkMap } from "../inks/index.js";
import { clearMetricsCache } from "../measure/metrics.js";
import { fontsSettled, subscribeFonts } from "../measure/fonts.js";
import { runPreflight } from "../preflight/engine.js";
import { defaultRules, minXHeightMm } from "../preflight/rules/index.js";
import { defaultPreflightStore, type PreflightStore } from "../preflight/store.js";
import type { ArtboardSpec, Issue, PreflightDocument, PreflightNode, PreflightRule } from "../preflight/types.js";
import type { Primitive } from "../export/types.js";
import { toMm, type Unit } from "../units/index.js";
import {
  ArtboardContext,
  useIsoLayoutEffect,
  useStableId,
  type ArtboardContextValue,
  type MeasureEnv,
  type NodeRegistration,
} from "./context.js";
import { useInks } from "./useInks.js";

export type ArtboardUnit = Exclude<Unit, "px">;

export interface ArtboardProps {
  /** Trim size [width, height] in `unit`. */
  trim: readonly [number, number];
  /** Bleed beyond the trim on every side, in `unit`. Default 3 mm. */
  bleed?: number;
  /** Safe margin inside the trim on every side, in `unit`. Default 3 mm. */
  safe?: number;
  /** Unit for trim, bleed, safe and Panel geometry. Default "mm". */
  unit?: ArtboardUnit;
  /** Area of the largest surface of the package in cm²; below 80 the x-height minimum drops to 0.9 mm. */
  largestSurfaceCm2?: number;
  /** Identifies this artboard in issues and in `usePreflight({ artboard })`. */
  id?: string;
  /** On-screen magnification. 1 renders at CSS millimetres. */
  zoom?: number;
  /** Show trim, bleed and safe-zone guides. Default true. */
  guides?: boolean;
  /** Outline nodes that have preflight issues. Default true. */
  showIssues?: boolean;
  /** Preflight rules. Default `defaultRules`. */
  rules?: readonly PreflightRule[];
  /** Where to publish issues. Default: the shared store read by `usePreflight()`. */
  store?: PreflightStore;
  /** Called whenever the set of issues changes. */
  onPreflight?: (issues: Issue[]) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Handle exposed through the Artboard ref; pass the ref to `exportPDF`. */
export interface ArtboardHandle {
  readonly id: string;
  readonly spec: ArtboardSpec;
  readonly inks: InkMap;
  readonly maxInks: number | undefined;
  readonly element: HTMLElement | null;
  /** Waits for fonts, measures synchronously and runs preflight. */
  flush(): Promise<{ document: PreflightDocument; issues: Issue[] }>;
  /** Vector display list of everything that prints, in paint order (mm, trim coordinates). */
  paint(): Primitive[];
}

interface Entry {
  reg: NodeRegistration;
}

/** Resolves after the next frame, or after a short timeout in background tabs where frames are paused. */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 50);
    if (typeof requestAnimationFrame !== "undefined")
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      });
  });

export const Artboard = forwardRef<ArtboardHandle, ArtboardProps>(function Artboard(props, ref) {
  const {
    trim,
    bleed,
    safe,
    unit = "mm",
    largestSurfaceCm2,
    zoom = 1,
    guides = true,
    showIssues = true,
    className,
    style,
    children,
  } = props;
  const generatedId = useStableId();
  const id = props.id ?? `artboard${generatedId.replace(/:/g, "")}`;
  const inkCtx = useInks();

  const spec = useMemo<ArtboardSpec>(() => {
    const s: ArtboardSpec = {
      id,
      trim: [toMm(trim[0], unit), toMm(trim[1], unit)],
      bleed: bleed === undefined ? 3 : toMm(bleed, unit),
      safe: safe === undefined ? 3 : toMm(safe, unit),
    };
    if (largestSurfaceCm2 !== undefined) s.largestSurfaceCm2 = largestSurfaceCm2;
    return s;
  }, [id, trim[0], trim[1], bleed, safe, unit, largestSurfaceCm2]);

  const [W, H] = spec.trim;
  const B = spec.bleed;
  const trimRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const entries = useRef(new Set<Entry>());
  const frame = useRef<number | null>(null);
  const [overlay, setOverlay] = useState<Issue[]>([]);

  // Latest values for callbacks that outlive a render.
  const latest = useRef({ spec, inkCtx, rules: props.rules ?? defaultRules, store: props.store ?? defaultPreflightStore, onPreflight: props.onPreflight });
  latest.current = { spec, inkCtx, rules: props.rules ?? defaultRules, store: props.store ?? defaultPreflightStore, onPreflight: props.onPreflight };
  const lastKey = useRef("");

  const env = useCallback((): MeasureEnv | null => {
    const el = trimRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const [w, h] = latest.current.spec.trim;
    if (!(r.width > 0 && r.height > 0)) return null;
    const sx = w / r.width;
    const sy = h / r.height;
    return {
      toMm: (b) => ({ x: (b.left - r.left) * sx, y: (b.top - r.top) * sy, width: (b.right - b.left) * sx, height: (b.bottom - b.top) * sy }),
      inks: latest.current.inkCtx.inks,
      trim: { x: 0, y: 0, width: w, height: h },
    };
  }, []);

  const ordered = useCallback((): NodeRegistration[] => {
    const regs = [...entries.current].map((e) => e.reg);
    return regs.sort((a, b) => {
      const ea = a.element();
      const eb = b.element();
      if (!ea || !eb) return ea ? -1 : eb ? 1 : 0;
      if (ea === eb) return 0;
      return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }, []);

  const measureNow = useCallback((): { document: PreflightDocument; issues: Issue[] } | null => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const e = env();
    if (!e) return null;
    const { spec, inkCtx, rules, store, onPreflight } = latest.current;
    const nodes: PreflightNode[] = [];
    const seen = new Map<string, number>();
    for (const reg of ordered()) {
      const m = reg.measure(e);
      if (!m) continue;
      const base = reg.baseId();
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      nodes.push({ ...m, id: n === 1 ? base : `${base}#${n}` } as PreflightNode);
    }
    const document: PreflightDocument = { artboard: spec, inks: inkCtx.inks, nodes };
    if (inkCtx.maxInks !== undefined) document.maxInks = inkCtx.maxInks;
    const issues = runPreflight(document, rules);
    const key = JSON.stringify(issues);
    store.set(spec.id, issues);
    if (key !== lastKey.current) {
      lastKey.current = key;
      setOverlay(issues);
      onPreflight?.(issues);
    }
    return { document, issues };
  }, [env, ordered]);

  const requestMeasure = useCallback(() => {
    if (frame.current !== null || typeof requestAnimationFrame === "undefined") return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      measureNow();
    });
  }, [measureNow]);

  const register = useCallback(
    (reg: NodeRegistration) => {
      const entry = { reg };
      entries.current.add(entry);
      requestMeasure();
      return () => {
        entries.current.delete(entry);
        requestMeasure();
      };
    },
    [requestMeasure],
  );

  const ctx = useMemo<ArtboardContextValue>(
    () => ({
      id,
      spec,
      unit,
      toMm: (v: number) => toMm(v, unit),
      minXHeightMm: minXHeightMm(spec.largestSurfaceCm2),
      register,
      requestMeasure,
    }),
    [id, spec, unit, register, requestMeasure],
  );

  // Re-measure after every render of the artboard and whenever its content changes.
  useIsoLayoutEffect(() => {
    requestMeasure();
  });

  useEffect(() => {
    const el = trimRef.current;
    if (!el) return;
    const mo = new MutationObserver(requestMeasure);
    mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(requestMeasure) : null;
    ro?.observe(el);
    const onFonts = () => {
      clearMetricsCache();
      requestMeasure();
    };
    document.fonts?.addEventListener?.("loadingdone", onFonts);
    const off = subscribeFonts(onFonts);
    return () => {
      mo.disconnect();
      ro?.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", onFonts);
      off();
    };
  }, [requestMeasure]);

  // Withdraw this artboard's issues when it unmounts or changes id/store.
  const store = props.store ?? defaultPreflightStore;
  useEffect(() => () => store.remove(id), [store, id]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );

  useImperativeHandle(
    ref,
    (): ArtboardHandle => ({
      get id() {
        return latest.current.spec.id;
      },
      get spec() {
        return latest.current.spec;
      },
      get inks() {
        return latest.current.inkCtx.inks;
      },
      get maxInks() {
        return latest.current.inkCtx.maxInks;
      },
      get element() {
        return rootRef.current;
      },
      async flush() {
        await document.fonts?.ready;
        await fontsSettled();
        clearMetricsCache();
        // Let components react to late font loads (e.g. re-fit text) before measuring.
        await nextFrame();
        await nextFrame();
        const result = measureNow();
        if (!result) throw new Error("Artboard is not mounted or has no size");
        return result;
      },
      paint() {
        const e = env();
        if (!e) throw new Error("Artboard is not mounted or has no size");
        return ordered().flatMap((r) => r.paint?.(e) ?? []);
      },
    }),
    [env, measureNow, ordered],
  );

  const sheetW = W + 2 * B;
  const sheetH = H + 2 * B;
  const S = spec.safe;
  const hair = { vectorEffect: "non-scaling-stroke" as const, strokeWidth: 1, fill: "none" };

  return (
    <ArtboardContext.Provider value={ctx}>
      <div
        ref={rootRef}
        className={className}
        data-prepress-artboard={id}
        style={{ position: "relative", width: `${sheetW * zoom}mm`, height: `${sheetH * zoom}mm`, flex: "none", ...style }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: `${sheetW}mm`,
            height: `${sheetH}mm`,
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            transformOrigin: "0 0",
            background: "#ffffff",
            color: inkCtx.preview(inkCtx.defaultInk),
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          }}
        >
          <div
            ref={trimRef}
            data-prepress-trim=""
            style={{ position: "absolute", left: `${B}mm`, top: `${B}mm`, width: `${W}mm`, height: `${H}mm`, lineHeight: 1.2 }}
          >
            {children}
          </div>
          {(guides || showIssues) && (
            <svg
              aria-hidden="true"
              viewBox={`${-B} ${-B} ${sheetW} ${sheetH}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
            >
              {guides && (
                <g>
                  <path
                    d={`M${-B} ${-B}h${sheetW}v${sheetH}h${-sheetW}z M0 0v${H}h${W}v${-H}z`}
                    fill="rgba(255,255,255,0.45)"
                    fillRule="evenodd"
                  />
                  <rect x={-B} y={-B} width={sheetW} height={sheetH} stroke="#e5484d" strokeDasharray="4 3" {...hair} />
                  <rect x={0} y={0} width={W} height={H} stroke="#111111" {...hair} />
                  {S > 0 && <rect x={S} y={S} width={W - 2 * S} height={H - 2 * S} stroke="#0090ff" strokeDasharray="2 3" {...hair} />}
                </g>
              )}
              {showIssues &&
                overlay
                  .filter((i) => i.bbox)
                  .map((i, k) => (
                    <rect
                      key={k}
                      x={i.bbox!.x}
                      y={i.bbox!.y}
                      width={Math.max(i.bbox!.width, 0.2)}
                      height={Math.max(i.bbox!.height, 0.2)}
                      stroke={i.level === "error" ? "#e5484d" : "#f5a623"}
                      fill={i.level === "error" ? "rgba(229,72,77,0.12)" : "rgba(245,166,35,0.12)"}
                      vectorEffect="non-scaling-stroke"
                      strokeWidth={1.5}
                    >
                      <title>{`[${i.rule}] ${i.node}: ${i.message}`}</title>
                    </rect>
                  ))}
            </svg>
          )}
        </div>
      </div>
    </ArtboardContext.Provider>
  );
});
