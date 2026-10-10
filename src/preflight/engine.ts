import { defaultRules } from "./rules/index.js";
import type { Issue, Level, PreflightDocument, PreflightRule } from "./types.js";

const LEVEL_RANK: Record<Level, number> = { warn: 1, error: 2 };

/** True when `level` is at least as severe as `threshold`. */
export function atLeast(level: Level, threshold: Level): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[threshold];
}

/** Identity helper that gives custom rules full type checking. */
export function defineRule(rule: PreflightRule): PreflightRule {
  return rule;
}

/**
 * Runs every rule against a document. Pure and synchronous, so it can run on
 * the server or in tests. A rule that throws is reported as an error issue
 * instead of aborting the run. Errors are listed before warnings.
 */
export function runPreflight(doc: PreflightDocument, rules: readonly PreflightRule[] = defaultRules): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) throw new Error(`Duplicate preflight rule id "${rule.id}"`);
    seen.add(rule.id);
    let findings;
    try {
      findings = rule.check(doc);
    } catch (e) {
      findings = [{ level: "error" as const, node: doc.artboard.id, message: `Rule failed to run: ${e instanceof Error ? e.message : String(e)}` }];
    }
    for (const f of findings) {
      const issue: Issue = { level: f.level, rule: rule.id, node: f.node, message: f.message, artboard: doc.artboard.id };
      if (f.bbox) issue.bbox = f.bbox;
      issues.push(issue);
    }
  }
  return issues.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
}

/** Thrown (as a rejection) by `exportPDF` when preflight finds issues at or above `failOn`. */
export class PreflightError extends Error {
  readonly issues: Issue[];
  constructor(issues: Issue[], threshold: Level) {
    const n = issues.length;
    super(`Preflight found ${n} issue${n === 1 ? "" : "s"} at level "${threshold}" or above: ${issues.map((i) => `[${i.rule}] ${i.node}: ${i.message}`).join(" | ")}`);
    this.name = "PreflightError";
    this.issues = issues;
  }
}
