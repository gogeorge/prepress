"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Issue } from "../preflight/types.js";

export interface PreflightPanelProps {
  issues: readonly Issue[];
  /** Heading. Default "Preflight". */
  title?: ReactNode;
  /** Shown when there are no issues. */
  emptyMessage?: ReactNode;
  /** Prefix each issue with its artboard id (useful when several artboards publish to one list). */
  showArtboard?: boolean;
  /** Called when an issue is clicked. */
  onSelect?: (issue: Issue) => void;
  className?: string;
  style?: CSSProperties;
}

const COLORS = { error: "#e5484d", warn: "#d97706" } as const;

/** Lists preflight issues, errors first. Unstyled apart from minimal inline styles; inherits font and colour. */
export function PreflightPanel({
  issues,
  title = "Preflight",
  emptyMessage = "No issues found.",
  showArtboard = false,
  onSelect,
  className,
  style,
}: PreflightPanelProps) {
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.length - errors;
  return (
    <section aria-label="Preflight" className={className} data-prepress-preflight="" style={{ fontSize: 14, lineHeight: 1.4, ...style }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <strong>{title}</strong>
        <span role="status" style={{ opacity: 0.75 }}>
          {errors} error{errors === 1 ? "" : "s"}, {warnings} warning{warnings === 1 ? "" : "s"}
        </span>
      </header>
      {issues.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.75 }}>{emptyMessage}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {issues.map((issue, k) => {
            const body = (
              <>
                <span
                  style={{
                    display: "inline-block",
                    minWidth: 44,
                    marginRight: 8,
                    padding: "0 6px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    textAlign: "center",
                    textTransform: "uppercase",
                    color: "#fff",
                    background: COLORS[issue.level],
                  }}
                >
                  {issue.level}
                </span>
                <code style={{ fontSize: 12, marginRight: 8 }}>{issue.rule}</code>
                <span style={{ opacity: 0.75, marginRight: 8 }}>
                  {showArtboard && issue.artboard ? `${issue.artboard} › ` : ""}
                  {issue.node}
                </span>
                <span style={{ display: "block", marginTop: 2 }}>{issue.message}</span>
              </>
            );
            return (
              <li key={k} style={{ borderLeft: `3px solid ${COLORS[issue.level]}`, paddingLeft: 8 }}>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(issue)}
                    style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
                  >
                    {body}
                  </button>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
