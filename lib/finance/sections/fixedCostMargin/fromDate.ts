/**
 * Fixed cost margin by the fixed cost from date (B31, decision FC9 option C).
 *
 * The switch `fixed_cost_margin_from_date` counts only with
 * `fixed_cost_from_date` and `fixed_cost_report_net` on too (registry
 * `requires`, checked here like `combineFixedCostFromDate`).
 *
 * Pure: the page, the Excel export and the loader share it.
 */

export const FIXED_COST_MARGIN_FROM_DATE_KEY = "fixed_cost_margin_from_date" as const

/** All three switches must be on. Anything else is off (today's report). */
export function combineFixedCostMarginFromDate(marginOn: boolean, dateOn: boolean, netOn: boolean): boolean {
  return marginOn === true && dateOn === true && netOn === true
}

// ---------------------------------------------------------------------------
// C2: before-the-date and fixed cost legs (FC9 option C, FC6 rule)
// ---------------------------------------------------------------------------

/** "before": the line's actual, before the date. "from": fixed cost from the date. */
export type FixedCostLeg = "before" | "from"

export type FixedCostLegAmounts = {
  billedCents: number
  actualCents: number
  /** Null when the month has no margin (no cost, or a bill line month with no counted bill). */
  marginCents: number | null
}

/**
 * How one month of a dated line splits.
 * - whole: the whole month is one leg (wholly before the date's month, or
 *   on or after it when the date is the 1st).
 * - split: the date's month, split by the FC6 rule (see `splitDateMonth`).
 * - unsplit: the date's month, but the day view could not be read.
 */
export type FixedCostMonthLegs =
  | { kind: "whole"; leg: FixedCostLeg }
  | { kind: "split"; before: FixedCostLegAmounts; from: FixedCostLegAmounts }
  | { kind: "unsplit" }

export type FixedCostLineLegs = { before: FixedCostLegAmounts; from: FixedCostLegAmounts }

/** Where a YYYY-MM month sits against a YYYY-MM-DD date. */
export function monthAgainstDate(month: string, fromYmd: string): "before" | "from" | "split" {
  const fromMonth = fromYmd.slice(0, 7)
  if (month < fromMonth) return "before"
  if (month > fromMonth) return "from"
  return fromYmd.slice(8, 10) === "01" ? "from" : "split"
}

/** True when the date's month has days before the date (a 1st needs no split). */
export function dateMonthNeedsSplit(fromYmd: string): boolean {
  return fromYmd.slice(8, 10) !== "01"
}

/** First day of the date's month, YYYY-MM-01. */
export function dateMonthStart(fromYmd: string): string {
  return `${fromYmd.slice(0, 7)}-01`
}

/**
 * The date's month split by the FC6 rule (decision FC9 option C, rule C-i).
 *
 * FC6 (sp_refresh_fixed_cost_reported_daily.sql): "A burst cut by the date
 * reports its net media minus the actual spend before the date, floored at 0
 * (FC6), over the days from the date." Read for margin, per month:
 * - fixed cost leg billed = month billed minus the platform cost before the
 *   date, never below 0;
 * - before leg billed = the rest of the month's billing (the cost before the
 *   date, or all of billing when that cost is more);
 * - before leg cost = the platform cost before the date; fixed cost leg cost
 *   = the month's cost less that.
 * Each leg is the month minus the other, so the two always add to the month
 * exactly. Integer cents in, integer cents out.
 */
export function splitDateMonth(
  month: FixedCostLegAmounts,
  preDateCostCents: number,
): { before: FixedCostLegAmounts; from: FixedCostLegAmounts } {
  const fromBilled = Math.max(0, month.billedCents - preDateCostCents)
  const beforeBilled = month.billedCents - fromBilled
  const beforeActual = preDateCostCents
  const fromActual = month.actualCents - beforeActual
  const beforeMargin = month.marginCents == null ? null : beforeBilled - beforeActual
  const fromMargin = month.marginCents == null || beforeMargin == null ? null : month.marginCents - beforeMargin
  return {
    before: { billedCents: beforeBilled, actualCents: beforeActual, marginCents: beforeMargin },
    from: { billedCents: fromBilled, actualCents: fromActual, marginCents: fromMargin },
  }
}

/**
 * One month's legs. `preDateCostCents` null: the day view could not be read,
 * so the date's month stays unsplit (whole months still get their leg).
 */
export function monthLegs(
  monthKey: string,
  fromYmd: string,
  month: FixedCostLegAmounts,
  preDateCostCents: number | null,
): FixedCostMonthLegs {
  const where = monthAgainstDate(monthKey, fromYmd)
  if (where !== "split") return { kind: "whole", leg: where }
  if (preDateCostCents == null) return { kind: "unsplit" }
  return { kind: "split", ...splitDateMonth(month, preDateCostCents) }
}

function emptyLeg(): FixedCostLegAmounts {
  return { billedCents: 0, actualCents: 0, marginCents: null }
}

function addLeg(t: FixedCostLegAmounts, a: FixedCostLegAmounts): void {
  t.billedCents += a.billedCents
  t.actualCents += a.actualCents
  if (a.marginCents != null) t.marginCents = (t.marginCents ?? 0) + a.marginCents
}

/**
 * A dated line's two legs over its months. Null when a month is unsplit (the
 * legs would not add to the line). The legs add to the line's billed, actual
 * and margin totals.
 */
export function lineLegTotals(
  months: ReadonlyArray<FixedCostLegAmounts & { legs?: FixedCostMonthLegs }>,
): FixedCostLineLegs | null {
  const before = emptyLeg()
  const from = emptyLeg()
  for (const m of months) {
    const legs = m.legs
    if (!legs || legs.kind === "unsplit") return null
    if (legs.kind === "whole") addLeg(legs.leg === "before" ? before : from, m)
    else {
      addLeg(before, legs.before)
      addLeg(from, legs.from)
    }
  }
  return { before, from }
}

export const BEFORE_FIXED_COST_LABEL = "Before fixed cost"
export const FIXED_COST_LEG_LABEL = "Fixed cost"
export const UNSPLIT_LABEL = "Date month not split"

/** Month tag for the page and the Excel flags column. */
export function monthLegLabel(legs: FixedCostMonthLegs, fromYmd: string, formatDay: (ymd: string) => string): string {
  if (legs.kind === "unsplit") return UNSPLIT_LABEL
  if (legs.kind === "split") return `Split at ${formatDay(fromYmd)}`
  return legs.leg === "before" ? BEFORE_FIXED_COST_LABEL : FIXED_COST_LEG_LABEL
}
