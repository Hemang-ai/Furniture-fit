/**
 * FitVision AI — Fit Engine
 * ---------------------------------------------------------------------------
 * Pure, dependency-free fit-estimation logic. This module NEVER claims an
 * exact measurement: verdicts are estimates derived from the dimensions and
 * clearance assumptions provided, and are explicitly NOT an installer
 * guarantee. All clearance rules below are editable assumptions.
 */

export type Verdict = "FITS" | "TIGHT_FIT" | "DOES_NOT_FIT" | "NEED_MORE_DATA";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
  unit: string;
}

/** Clearance requirement, in the same unit as the dimensions (default inches). */
export interface ClearanceRule {
  /** Required gap on EACH side (left and right). */
  side: number;
  /** Required gap above the product. */
  top: number;
  /** Required gap behind the product (depth direction). */
  rear: number;
}

export interface Margins {
  /** Space remaining on the left of the product after centering. */
  sideLeft: number;
  /** Space remaining on the right of the product after centering. */
  sideRight: number;
  /** Space remaining above the product. */
  top: number;
  /** Space remaining behind the product. */
  rear: number;
  /** Combined horizontal slack (left + right = availableWidth - productWidth). */
  total: number;
}

export interface FitReport {
  verdict: Verdict;
  confidence: Confidence;
  productDimensions: Dimensions | null;
  availableDimensions: Dimensions | null;
  requiredClearances: ClearanceRule;
  margins: Margins;
  warnings: string[];
  plainEnglishSummary: string;
}

export interface CalculateFitInput {
  productDimensions?: Partial<Dimensions> | null;
  availableDimensions?: Partial<Dimensions> | null;
  category: string;
  /** Per-call override of the resolved clearance rule for this category. */
  customClearanceRules?: Partial<ClearanceRule>;
  /** Forces NEED_MORE_DATA / LOW confidence (the "I don't know" path). */
  forceNeedMoreData?: boolean;
  /**
   * Caps the reported confidence. Used when dimensions were AI-estimated from a
   * photo rather than measured — e.g. pass "LOW" so even a clear verdict stays
   * low confidence.
   */
  confidenceCeiling?: Confidence;
  unit?: string;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

/** Returns the lower of the two confidence levels. */
export function capConfidence(value: Confidence, ceiling?: Confidence): Confidence {
  if (!ceiling) return value;
  return CONFIDENCE_RANK[value] <= CONFIDENCE_RANK[ceiling] ? value : ceiling;
}

/**
 * Default clearance rules. CLEARLY MARKED AS ASSUMPTIONS — these are typical
 * manufacturer minimums and should be confirmed against the actual product's
 * installation manual. Editable at runtime via updateClearanceRules().
 */
export const DEFAULT_CLEARANCE_RULES: Record<string, ClearanceRule> = {
  refrigerator: { side: 0.5, top: 1, rear: 2 },
  range: { side: 0.25, top: 0, rear: 1 },
  dishwasher: { side: 0.25, top: 0.25, rear: 1 },
  washer: { side: 1, top: 0, rear: 4 },
  dryer: { side: 1, top: 0, rear: 4 },
  tv: { side: 0, top: 0, rear: 1 },
  furniture: { side: 0, top: 0, rear: 1 },
  electronics: { side: 0, top: 0, rear: 1 },
  // Fallback used when a category is unknown.
  default: { side: 0, top: 0, rear: 1 },
};

/** The standard caveats appended to EVERY fit report. */
export const STANDARD_WARNINGS: string[] = [
  "Door swing and delivery path not verified.",
  "Floor levelness not checked.",
  "Electrical, water, and gas connections not checked.",
];

/** Threshold (in inches) below which remaining clearance is considered "tight". */
const TIGHT_THRESHOLD = 1;

/** Mutable in-memory copy of the clearance rules. */
let clearanceRules: Record<string, ClearanceRule> = cloneRules(DEFAULT_CLEARANCE_RULES);

function cloneRules(rules: Record<string, ClearanceRule>): Record<string, ClearanceRule> {
  const out: Record<string, ClearanceRule> = {};
  for (const key of Object.keys(rules)) {
    out[key] = { ...rules[key] };
  }
  return out;
}

/** Returns a copy of the current clearance rule map. */
export function getClearanceRules(): Record<string, ClearanceRule> {
  return cloneRules(clearanceRules);
}

/**
 * Merge/replace clearance rules at runtime. Pass a partial map keyed by
 * normalized category, e.g. updateClearanceRules({ refrigerator: { side: 1, top: 1, rear: 2 } }).
 */
export function updateClearanceRules(
  updates: Record<string, Partial<ClearanceRule>>
): Record<string, ClearanceRule> {
  for (const key of Object.keys(updates)) {
    const normalized = normalizeCategory(key);
    const base = clearanceRules[normalized] ?? clearanceRules.default;
    clearanceRules[normalized] = { ...base, ...updates[key] };
  }
  return getClearanceRules();
}

/** Reset rules to defaults (primarily for tests). */
export function resetClearanceRules(): void {
  clearanceRules = cloneRules(DEFAULT_CLEARANCE_RULES);
}

/** Map free-text categories to a known clearance key. */
export function normalizeCategory(category: string | undefined | null): string {
  const c = (category ?? "").toLowerCase().trim();
  if (!c) return "default";
  if (c.includes("refrig") || c.includes("fridge")) return "refrigerator";
  if (c.includes("dishwash")) return "dishwasher";
  if (c.includes("range") || c.includes("stove") || c.includes("oven") || c.includes("cooktop"))
    return "range";
  if (c.includes("wash")) return "washer";
  if (c.includes("dry")) return "dryer";
  if (c.includes("tv") || c.includes("television")) return "tv";
  if (c.includes("furnitur") || c.includes("sofa") || c.includes("couch") || c.includes("cabinet"))
    return "furniture";
  if (c.includes("electronic")) return "electronics";
  // exact key match (e.g. already-normalized values)
  if (clearanceRules[c]) return c;
  return "default";
}

/** Resolve the effective clearance rule for a category, applying any override. */
export function resolveClearance(
  category: string,
  override?: Partial<ClearanceRule>
): ClearanceRule {
  const key = normalizeCategory(category);
  const base = clearanceRules[key] ?? clearanceRules.default;
  return { ...base, ...(override ?? {}) };
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isCompleteDimensions(d?: Partial<Dimensions> | null): d is Dimensions {
  return (
    !!d && isFiniteNumber(d.width) && isFiniteNumber(d.height) && isFiniteNumber(d.depth)
  );
}

/** Round to a fixed number of decimals to tame floating-point noise. */
function round(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function toDimensions(d: Partial<Dimensions> | null | undefined, unit: string): Dimensions | null {
  if (!isCompleteDimensions(d)) return null;
  return { width: d.width, height: d.height, depth: d.depth, unit: d.unit ?? unit };
}

const ZERO_MARGINS: Margins = { sideLeft: 0, sideRight: 0, top: 0, rear: 0, total: 0 };

/**
 * Estimate whether a product fits the available space.
 *
 * Logic:
 *  - Missing product OR available dimensions (or forceNeedMoreData) -> NEED_MORE_DATA / LOW.
 *  - For each dimension, slack = (space remaining) - (required clearance).
 *  - Any slack < 0 -> DOES_NOT_FIT / HIGH (with dimension-specific warnings).
 *  - Else any slack < 1" -> TIGHT_FIT / MEDIUM.
 *  - Else -> FITS / HIGH.
 */
export function calculateFit(input: CalculateFitInput): FitReport {
  const requiredClearances = resolveClearance(input.category, input.customClearanceRules);
  const unit =
    input.unit ||
    input.availableDimensions?.unit ||
    input.productDimensions?.unit ||
    "inches";

  const product = toDimensions(input.productDimensions, unit);
  const available = toDimensions(input.availableDimensions, unit);

  // ---- NEED_MORE_DATA ----------------------------------------------------
  if (input.forceNeedMoreData || !product || !available) {
    const missing: string[] = [];
    if (!product) missing.push("product dimensions");
    if (!available) missing.push("available space dimensions");
    const reason = input.forceNeedMoreData
      ? "Dimensions were marked as unknown"
      : `Missing ${missing.join(" and ")}`;

    return {
      verdict: "NEED_MORE_DATA",
      confidence: "LOW",
      productDimensions: product,
      availableDimensions: available,
      requiredClearances,
      margins: ZERO_MARGINS,
      warnings: [
        `${reason}. Enter manual measurements to get an estimated fit verdict.`,
        ...STANDARD_WARNINGS,
      ],
      plainEnglishSummary:
        "We don't have enough information to estimate fit yet. Add the product " +
        "dimensions and the available space (width, height, depth) and we'll " +
        "provide an estimated verdict. This is an estimate, not an installer guarantee.",
    };
  }

  // ---- Compute margins ---------------------------------------------------
  const horizontalSlackTotal = available.width - product.width;
  const margins: Margins = {
    sideLeft: round(horizontalSlackTotal / 2),
    sideRight: round(horizontalSlackTotal / 2),
    top: round(available.height - product.height),
    rear: round(available.depth - product.depth),
    total: round(horizontalSlackTotal),
  };

  // Per-dimension clearance checks. `space` is what's left for that gap.
  const checks = [
    { name: "Left side", space: horizontalSlackTotal / 2, required: requiredClearances.side },
    { name: "Right side", space: horizontalSlackTotal / 2, required: requiredClearances.side },
    { name: "Top", space: available.height - product.height, required: requiredClearances.top },
    { name: "Rear (depth)", space: available.depth - product.depth, required: requiredClearances.rear },
  ];

  const warnings: string[] = [];
  let hasFailure = false;
  let hasTight = false;

  for (const check of checks) {
    const slack = round(check.space - check.required, 4);
    if (slack < 0) {
      hasFailure = true;
      warnings.push(
        `${check.name}: needs ${check.required}" clearance but only ${round(check.space)}" ` +
          `is available — short by ${round(Math.abs(slack))}".`
      );
    } else if (slack < TIGHT_THRESHOLD) {
      hasTight = true;
      warnings.push(
        `${check.name}: only ${round(slack)}" of slack beyond the required ${check.required}" ` +
          `clearance — very tight.`
      );
    }
  }

  let verdict: Verdict;
  let confidence: Confidence;
  if (hasFailure) {
    verdict = "DOES_NOT_FIT";
    confidence = "HIGH";
  } else if (hasTight) {
    verdict = "TIGHT_FIT";
    confidence = "MEDIUM";
  } else {
    verdict = "FITS";
    confidence = "HIGH";
  }

  confidence = capConfidence(confidence, input.confidenceCeiling);

  if (input.confidenceCeiling === "LOW") {
    warnings.push(
      "One or more dimensions were AI-estimated from the photo, not measured — confidence is capped at LOW. Confirm real measurements before purchase."
    );
  }

  warnings.push(...STANDARD_WARNINGS);

  return {
    verdict,
    confidence,
    productDimensions: product,
    availableDimensions: available,
    requiredClearances,
    margins,
    warnings,
    plainEnglishSummary: buildSummary(verdict, product, available, margins, requiredClearances),
  };
}

function buildSummary(
  verdict: Verdict,
  product: Dimensions,
  available: Dimensions,
  margins: Margins,
  rules: ClearanceRule
): string {
  const u = product.unit || "inches";
  const dims = (d: Dimensions) => `${d.width} × ${d.height} × ${d.depth} ${u} (W×H×D)`;
  const base =
    `Estimated check: the ${dims(product)} product against an available space of ` +
    `${dims(available)}.`;
  const caveat =
    " This is an estimate based on the dimensions provided and standard clearance " +
    "assumptions — not an installer guarantee. Always verify before purchase.";

  switch (verdict) {
    case "FITS":
      return (
        `${base} It should fit with room to spare: about ${margins.sideLeft}${u[0]} on each side, ` +
        `${margins.top}${u[0]} above, and ${margins.rear}${u[0]} behind, which clears the assumed ` +
        `${rules.side}"/${rules.top}"/${rear(rules)}" side/top/rear requirements.${caveat}`
      );
    case "TIGHT_FIT":
      return (
        `${base} It looks like a tight fit — it should go in, but margins are slim relative to ` +
        `the assumed clearances (${rules.side}" sides, ${rules.top}" top, ${rear(rules)}" rear). ` +
        `Measure carefully and confirm the installation manual.${caveat}`
      );
    case "DOES_NOT_FIT":
      return (
        `${base} Based on these numbers it does not appear to fit once the assumed clearances ` +
        `(${rules.side}" sides, ${rules.top}" top, ${rear(rules)}" rear) are included. See the ` +
        `clearance analysis for the specific dimension(s) that exceed the space.${caveat}`
      );
    default:
      return base + caveat;
  }
}

function rear(rules: ClearanceRule): number {
  return rules.rear;
}
