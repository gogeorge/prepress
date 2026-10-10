import type { PreflightRule } from "../types.js";
import { bleedRule } from "./bleed.js";
import { checkDigitRule, quietZoneRule, xDimensionRule } from "./gs1.js";
import { inkLimitRule } from "./inkLimit.js";
import { missingContentRule, overflowRule } from "./layout.js";
import { safeZoneRule } from "./safeZone.js";
import { xHeightRule } from "./xHeight.js";

export { bleedRule, BLEED_SLIVER_MM } from "./bleed.js";
export { checkDigitRule, quietZoneRule, xDimensionRule } from "./gs1.js";
export { inkLimitRule } from "./inkLimit.js";
export { missingContentRule, overflowRule } from "./layout.js";
export { safeZoneRule } from "./safeZone.js";
export { minXHeightMm, xHeightRule } from "./xHeight.js";

/** The built-in rule set. Spread it to add your own: `[...defaultRules, myRule]`. */
export const defaultRules: readonly PreflightRule[] = [
  xHeightRule,
  xDimensionRule,
  quietZoneRule,
  checkDigitRule,
  safeZoneRule,
  bleedRule,
  inkLimitRule,
  overflowRule,
  missingContentRule,
];
