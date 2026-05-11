export type BuyType =
  | "package"
  | "spots"
  | "cpt"
  | "cpp"
  | "panels"
  | "insertions"
  | "cpm"
  | "cpc"
  | "screens"
  | "cpcv"
  | "cpi"
  | "cps"
  | "cpv"
  | "fixed_cost"
  | "weekly_rate"
  | "monthly_rate"
  | "package_inclusions"
  | "bonus";

const BUY_TYPE_RUNTIME_SET = new Set<string>([
  "package",
  "spots",
  "cpt",
  "cpp",
  "panels",
  "insertions",
  "cpm",
  "cpc",
  "screens",
  "cpcv",
  "cpi",
  "cps",
  "cpv",
  "fixed_cost",
  "weekly_rate",
  "monthly_rate",
  "package_inclusions",
  "bonus",
]);

/** Warn once per unknown buy type string in development (containers should extend {@link BuyType}). */
export function coerceBuyTypeWithDevWarn(
  buyType: string | undefined | null,
  context: string
): BuyType {
  const bt = String(buyType || "").toLowerCase() as BuyType;
  if (!BUY_TYPE_RUNTIME_SET.has(bt) && process.env.NODE_ENV === "development") {
    console.warn(
      `[deliverableBudget] Unrecognised buyType "${String(buyType)}" in ${context}; using string as BuyType (may default to 0).`
    );
  }
  return bt;
}

/** Buy types where deliverables are derived from budget + unit rate (not expert weekly qty). */
export const BUY_TYPES_WITH_DERIVED_DELIVERABLES: readonly BuyType[] = [
  "package",
  "spots",
  "cpt",
  "cpp",
  "panels",
  "insertions",
  "cpm",
  "cpc",
  "screens",
  "cpv",
  "cpcv",
  "cpi",
  "cps",
  "weekly_rate",
  "monthly_rate",
  "fixed_cost",
] as const;

function invalidUnitRate(unitRate: number): boolean {
  return !Number.isFinite(unitRate) || unitRate === 0;
}

function nonFiniteInputs(deliverables: number, unitRate: number): boolean {
  return !Number.isFinite(deliverables) || !Number.isFinite(unitRate);
}

export function deliverablesFromBudget(
  buyType: BuyType,
  netBudget: number,
  unitRate: number
): number {
  if (buyType === "bonus" || buyType === "package_inclusions") {
    return NaN;
  }
  if (invalidUnitRate(unitRate)) {
    return 0;
  }

  switch (buyType) {
    case "package":
    case "spots":
    case "cpt":
    case "cpp":
    case "panels":
    case "weekly_rate":
    case "monthly_rate":
      return netBudget / unitRate;
    case "cpm":
      return (netBudget / unitRate) * 1000;
    case "cpc":
    case "insertions":
    case "screens":
    case "cpv":
    case "cpcv":
    case "cpi":
    case "cps":
      return netBudget / unitRate;
    case "fixed_cost":
      return 1;
    default:
      return 0;
  }
}

export interface ComputeDeliverableInput {
  buyType: BuyType
  /** Raw budget value as entered by the user, before fee adjustments. */
  rawBudget: number
  /** Unit rate for the buy type (e.g. CPM rate, CPC rate, spot rate, panel rate). */
  buyAmount: number
  /** When true, rawBudget includes fees and is split to derive net media. */
  budgetIncludesFees: boolean
  /**
   * Fee percentage for this client/channel (e.g. 12 for 12%). Pass 0 for
   * fee-free channels or fee-free clients. Caller is responsible for
   * sourcing this from the client/channel-specific fee config.
   */
  feePct: number
}

/**
 * Single source of truth for deliverable computation from a burst-level
 * budget. Strips fees from the raw budget first using netFromGross (linear
 * fee-as-percent-of-gross model), then applies the per-buy-type formula.
 * Always computes deliverable from MEDIA cost, never raw budget.
 *
 * Used by:
 *   - computeLoadedDeliverables (data load) in every Container
 *   - handleValueChange (form interaction) in every Container
 *   - CpcFamilyBurstCalculatedField / SocialLineBurstCalculatedField /
 *     TelevisionBurstTarpsField (live display) in burst-calculated-fields.tsx
 *
 * Replaces inline switch statements duplicated across 19+ container files.
 *
 * Fee model: net = gross × (1 - feePct/100). Same linear split as
 * netFromGross. Replaces OOH's previous divide-based netFromGrossOoh model
 * once stage 3 migration completes.
 */
export function computeDeliverableFromMedia({
  buyType,
  rawBudget,
  buyAmount,
  budgetIncludesFees,
  feePct,
}: ComputeDeliverableInput): number {
  if (buyType === "bonus" || buyType === "package_inclusions") {
    // Manual qty - caller preserves existing calculatedValue. Return NaN to
    // signal "no recompute".
    return NaN;
  }
  const netMedia = netFromGross(rawBudget, budgetIncludesFees, feePct);
  return deliverablesFromBudget(buyType, netMedia, buyAmount);
}

export function netMediaFromDeliverables(
  buyType: BuyType,
  deliverables: number,
  unitRate: number
): number {
  if (buyType === "bonus" || buyType === "package_inclusions") {
    return 0;
  }
  if (nonFiniteInputs(deliverables, unitRate)) {
    return 0;
  }

  switch (buyType) {
    case "package":
    case "spots":
    case "cpt":
    case "cpp":
    case "panels":
    case "weekly_rate":
    case "monthly_rate":
    case "cpc":
    case "insertions":
    case "screens":
    case "cpv":
    case "cpcv":
    case "cpi":
    case "cps":
      return deliverables * unitRate;
    case "cpm":
      return (deliverables / 1000) * unitRate;
    case "fixed_cost":
      return unitRate;
    default:
      return 0;
  }
}

export function grossFromNet(
  netMedia: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) {
    return netMedia;
  }
  if (feePct >= 100) {
    return 0;
  }
  return netMedia / (1 - feePct / 100);
}

export function netFromGross(
  grossBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) {
    return grossBudget;
  }
  return grossBudget * (1 - feePct / 100);
}

/** OOH fee-on-gross model: net = gross / (1 + fee%/100) when budget includes fees. */
export function netFromGrossOoh(
  grossBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) {
    return grossBudget;
  }
  return grossBudget / (1 + (feePct || 0) / 100);
}

export function grossFromNetOoh(
  netMedia: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) {
    return netMedia;
  }
  return netMedia * (1 + (feePct || 0) / 100);
}

/**
 * Net media $ from an OOH expert row cell / merged span qty.
 * OOH CPM weekly values are thousand-impression blocks → gross = qty × CPM; other buy types match {@link netMediaFromDeliverables}.
 */
export function netMediaFromOohExpertQuantity(
  buyType: BuyType,
  qty: number,
  unitRate: number
): number {
  if (buyType === "cpm") {
    const q = Number.isFinite(qty) ? qty : 0;
    const r = Number.isFinite(unitRate) ? unitRate : 0;
    return q * r;
  }
  return netMediaFromDeliverables(buyType, qty, unitRate);
}

export function roundDeliverables(buyType: BuyType, value: number): number {
  switch (buyType) {
    case "cpm":
    case "cpc":
    case "insertions":
    case "screens":
    case "cpv":
    case "cpcv":
    case "cpi":
    case "cps":
      return Math.round(value);
    case "fixed_cost":
      return 1;
    default:
      return Math.round(value * 100) / 100;
  }
}

function parseWeekCell(prev: number | string | undefined | null): number {
  if (prev === "" || prev === undefined || prev === null) return 0;
  if (typeof prev === "number") return Number.isFinite(prev) ? prev : 0;
  const n = Number.parseFloat(String(prev).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Add a quantity into an expert-style weeklyValues cell (number or ""). */
export function addExpertWeekColumnDelta(
  weeklyValues: Record<string, number | "">,
  key: string,
  add: number
): void {
  const prevNum = parseWeekCell(weeklyValues[key]);
  weeklyValues[key] = prevNum + add;
}

/**
 * Split standard-burst deliverables across overlapping Gantt week keys; last key absorbs rounding.
 * Used when mapping standard line items → expert weekly rows.
 */
export function distributeBurstDeliverablesToExpertWeeks(
  buyType: BuyType,
  total: number,
  overlapKeys: string[],
  weeklyValues: Record<string, number | "">
): void {
  if (overlapKeys.length === 0 || !Number.isFinite(total)) return;

  if (buyType === "fixed_cost") {
    addExpertWeekColumnDelta(weeklyValues, overlapKeys[0]!, 1);
    return;
  }

  const n = overlapKeys.length;
  const each = total / n;
  let allocated = 0;
  for (let i = 0; i < n - 1; i++) {
    const v = roundDeliverables(buyType, each);
    addExpertWeekColumnDelta(weeklyValues, overlapKeys[i]!, v);
    allocated += v;
  }
  addExpertWeekColumnDelta(
    weeklyValues,
    overlapKeys[n - 1]!,
    roundDeliverables(buyType, total - allocated)
  );
}
