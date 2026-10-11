import { parseMoneyInput, type MoneyInput } from "@/lib/format/money";

export type BuyType =
  | "package"
  | "spots"
  | "cpt"
  | "cpp"
  | "panels"
  | "insertions"
  | "cpm"
  | "cpc"
  | "guaranteed_leads"
  | "screens"
  | "cpcv"
  | "cpi"
  | "cps"
  | "cpv"
  | "fixed_cost"
  | "weekly_rate"
  | "monthly_rate"
  | "package_inclusions"
  | "bonus"
  | "production";

const BUY_TYPE_RUNTIME_SET = new Set<string>([
  "package",
  "spots",
  "cpt",
  "cpp",
  "panels",
  "insertions",
  "cpm",
  "cpc",
  "guaranteed_leads",
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
  "production",
]);

const warnedUnknownBuyType = new Set<string>()

function isProductionMediaType(channel: string | null | undefined): boolean {
  return String(channel ?? "").trim().toLowerCase() === "production"
}

/**
 * Read-side default: production lines with null/blank buyType are `"production"`.
 * Does not write the stored row. Other channels keep a blank string.
 */
export function resolveBuyTypeForChannel(
  channel: string | null | undefined,
  buyType: string | null | undefined
): string {
  const raw = String(buyType ?? "").trim()
  if (raw) return raw
  if (isProductionMediaType(channel)) return "production"
  return ""
}

/** Production has no deliverable maths — do not mount CpcFamilyBurstCalculatedField. */
export function shouldMountCpcFamilyBurstCalculatedField(args: {
  mediaTypeKey?: string | null
  buyType?: string | null
}): boolean {
  if (isProductionMediaType(args.mediaTypeKey)) return false
  if (String(args.buyType ?? "").trim().toLowerCase() === "production") return false
  return true
}

/** Warn once per unknown buy type string in development (containers should extend {@link BuyType}). */
export function coerceBuyTypeWithDevWarn(
  buyType: string | undefined | null,
  context: string
): BuyType {
  const bt = String(buyType || "").toLowerCase() as BuyType;
  if (!BUY_TYPE_RUNTIME_SET.has(bt) && process.env.NODE_ENV === "development") {
    const key = `${bt}\0${context}`
    if (!warnedUnknownBuyType.has(key)) {
      warnedUnknownBuyType.add(key)
      console.warn(
        `[deliverableBudget] Unrecognised buyType "${String(buyType)}" in ${context}; using string as BuyType (may default to 0).`
      );
    }
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
  "guaranteed_leads",
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
    case "production":
    case "cpt":
    case "cpp":
    case "panels":
    case "weekly_rate":
    case "monthly_rate":
      return netBudget / unitRate;
    case "cpm":
      return (netBudget / unitRate) * 1000;
    case "cpc":
    case "guaranteed_leads":
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
 * {@link netFromGross}.
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

function parseLoadedDeliverableValue(value: unknown): number {
  return Number.parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0;
}

function parseFirstPresentLoadedDeliverable(
  burst: { [k: string]: unknown },
  fields: string[]
): number {
  for (const field of fields) {
    const value = burst[field];
    if (value !== undefined && value !== null) {
      return parseLoadedDeliverableValue(value);
    }
  }

  return 0;
}

export function computeLoadedDeliverables(
  buyType: string,
  burst: {
    budget?: unknown;
    buyAmount?: unknown;
    calculatedValue?: unknown;
    deliverables?: unknown;
    [k: string]: unknown;
  },
  budgetIncludesFees: boolean,
  feePct: number,
  options?: { bonusFallbackFields?: string[] }
): number {
  const fallbackFields = options?.bonusFallbackFields ?? ["calculatedValue", "deliverables"];
  const buyTypeLower = (buyType || "").toLowerCase();

  if (
    buyTypeLower === "bonus" ||
    buyTypeLower === "package_inclusions" ||
    buyTypeLower === "package"
  ) {
    return parseFirstPresentLoadedDeliverable(burst, fallbackFields);
  }

  const rawBudget = parseLoadedDeliverableValue(burst?.budget ?? "0");
  const buyAmount = parseLoadedDeliverableValue(burst?.buyAmount ?? "1");
  const bt = coerceBuyTypeWithDevWarn(buyType, "computeLoadedDeliverables");

  const value = computeDeliverableFromMedia({
    buyType: bt,
    rawBudget,
    buyAmount,
    budgetIncludesFees,
    feePct,
  });

  if (Number.isNaN(value)) {
    return parseFirstPresentLoadedDeliverable(burst, fallbackFields);
  }

  return roundDeliverables(bt, value);
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
    case "production":
    case "cpt":
    case "cpp":
    case "panels":
    case "weekly_rate":
    case "monthly_rate":
    case "cpc":
    case "guaranteed_leads":
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

export function roundDeliverables(buyType: BuyType, value: number): number {
  switch (buyType) {
    case "cpm":
    case "cpc":
    case "guaranteed_leads":
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
      return Math.round(value);
  }
}

/**
 * Package, bonus, and package inclusions keep the quantity the editor sent.
 * They are derived or manual, and save does not rewrite them.
 */
const SAVE_ROUND_EXCLUSIONS = new Set<string>(["package", "bonus", "package_inclusions"]);

export function isSaveRoundedBuyType(buyType: string | null | undefined): boolean {
  const key = String(buyType ?? "").trim().toLowerCase();
  return (
    (BUY_TYPES_WITH_DERIVED_DELIVERABLES as readonly string[]).includes(key) &&
    !SAVE_ROUND_EXCLUSIONS.has(key)
  );
}

function burstBudgetAmount(value: unknown): number {
  if (typeof value === "number" || typeof value === "string" || value == null) {
    return parseMoneyInput(value as MoneyInput) ?? 0;
  }
  return 0;
}

function storedDeliverable(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (!trimmed) return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

type DeliverableLine = {
  buyType?: string | null;
  bursts: unknown;
};

/**
 * Round the quantity the editor already stored on each burst.
 * Does not recompute from budget and rate.
 *
 * `fixed_cost` with a burst budget above 0 stores 1 here, including a zero
 * rate. That rule stays in this helper: `roundDeliverables` has no budget
 * and returns 1 for every `fixed_cost` value, which would stamp 1 on an
 * empty shell. A zero budget keeps the stored quantity.
 * `deliverablesFromBudget` still returns 0 for a zero rate before its
 * `fixed_cost` case.
 */
export function normaliseBurstDeliverables<T extends DeliverableLine>(line: T): T {
  const buyType = String(line.buyType ?? "").trim().toLowerCase();
  if (!isSaveRoundedBuyType(buyType)) return line;
  if (!Array.isArray(line.bursts)) return line;

  const bursts = line.bursts.map((burst) => {
    if (!burst || typeof burst !== "object") return burst;
    const row = burst as Record<string, unknown>;
    const budget = burstBudgetAmount(row.budget);
    const stored = storedDeliverable(row.calculatedValue);
    const calculatedValue =
      buyType === "fixed_cost" && budget > 0
        ? 1
        : buyType === "fixed_cost"
          ? stored
          : roundDeliverables(buyType as BuyType, stored);
    if (calculatedValue === row.calculatedValue) return burst;
    return { ...row, calculatedValue };
  });

  return { ...line, bursts };
}

export function normaliseSaveLineDeliverables<T extends DeliverableLine>(lines: T[]): T[] {
  return lines.map((line) => normaliseBurstDeliverables(line));
}

export type ZeroDeliverableWarning = {
  lineItemId: string;
  buyType: string;
  message: string;
};

function calculatedValueEmpty(value: unknown): boolean {
  if (value == null || value === "") return true;
  return storedDeliverable(value) === 0;
}

/**
 * After rounding. A derived line (same exclusions as save rounding) warns
 * when any burst has a budget above 0 and a zero or blank quantity.
 * Publishing still commits.
 */
export function zeroDeliverableWarnings(
  lines: Array<{ lineItemId: string; buyType?: string | null; bursts: unknown }>
): ZeroDeliverableWarning[] {
  const warnings: ZeroDeliverableWarning[] = [];
  for (const line of lines) {
    if (!isSaveRoundedBuyType(line.buyType)) continue;
    if (!Array.isArray(line.bursts)) continue;
    const hit = line.bursts.some((burst) => {
      if (!burst || typeof burst !== "object") return false;
      const row = burst as Record<string, unknown>;
      return burstBudgetAmount(row.budget) > 0 && calculatedValueEmpty(row.calculatedValue);
    });
    if (!hit) continue;
    const buyType = String(line.buyType ?? "").trim();
    warnings.push({
      lineItemId: line.lineItemId,
      buyType,
      message: `${line.lineItemId} (${buyType}) has a budget and no deliverables. Check the rate. Publishing will continue.`,
    });
  }
  return warnings;
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
 * Split standard-burst deliverables across overlapping Gantt week keys; earliest keys absorb remainders.
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

  const t = Math.round(total);
  const n = overlapKeys.length;
  const base = Math.floor(t / n);
  const remainder = t - base * n;
  for (let i = 0; i < n; i++) {
    const v = i < remainder ? base + 1 : base;
    addExpertWeekColumnDelta(weeklyValues, overlapKeys[i]!, v);
  }
}
