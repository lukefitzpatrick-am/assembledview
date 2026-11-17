/**
 * Billed months at publish (decision S2 A): the choice, the one decision every
 * publish path calls, and the plain wording. Pure and browser safe (the plan
 * editor shows the same months and reason).
 */
import { centsLabel, monthShort } from "@/lib/finance/revisions/panelModel"
import type { LockReason, MonthKey } from "@/lib/finance/revisions/types"

export type BilledMonthsChoice = "keep" | "credit"

/** Why "adjust with a credit" is off until S11 (shown in the editor and the 409). */
export const CREDIT_UNAVAILABLE_REASON =
  "Not available yet. A credit is a negative invoice line, and negative lines do not reach Xero until credits are built (S11)."

export type BilledMonthLine = { lineItemId: string; component: string; baseCents: number; candidateCents: number }

export type BilledMonth = {
  month: MonthKey
  reasons: LockReason[]
  baseCents: number
  candidateCents: number
  deltaCents: number
  /** Any cell differs, even when the month total is the same. */
  changed: boolean
  /** The cells that differ, by bare line id. */
  lines: BilledMonthLine[]
}

export type BilledMonthsCheck = { months: BilledMonth[]; changedMonths: MonthKey[] }

type BilledMonthsRefusalCode =
  | "BILLED_MONTHS_CHOICE_REQUIRED"
  | "BILLED_MONTHS_CREDIT_UNAVAILABLE"
  | "BILLED_MONTHS_CHANGED"

export type BilledMonthsDecision =
  | { kind: "go" }
  | { kind: "keep"; months: MonthKey[] }
  | { kind: "refuse"; code: BilledMonthsRefusalCode; message: string; billedMonths: BilledMonth[] }

function monthList(months: readonly MonthKey[]): string {
  return months.map(monthShort).join(", ")
}

/**
 * The one choke point every publish path calls (S2 A). Off, or no invoiced
 * month changes: go. `choiceAllowed` is false on paths that copy a stored
 * version (billing revisions, the PATCH stamp): they cannot keep, so a change
 * to an invoiced month is refused there.
 */
export function decideBilledMonths(args: {
  on: boolean
  check: BilledMonthsCheck
  choice: BilledMonthsChoice | null | undefined
  choiceAllowed: boolean
}): BilledMonthsDecision {
  const { check } = args
  if (!args.on || check.changedMonths.length === 0) return { kind: "go" }
  const billedMonths = check.months.filter((m) => m.changed)
  const names = monthList(check.changedMonths)
  if (!args.choiceAllowed) {
    return {
      kind: "refuse",
      code: "BILLED_MONTHS_CHANGED",
      message: `This would change invoiced months (${names}). Publish a new version from the plan page and choose what happens to them.`,
      billedMonths,
    }
  }
  if (args.choice === "keep") return { kind: "keep", months: check.changedMonths }
  if (args.choice === "credit") {
    return {
      kind: "refuse",
      code: "BILLED_MONTHS_CREDIT_UNAVAILABLE",
      message: `Adjust with a credit: ${CREDIT_UNAVAILABLE_REASON} Choose keep billed rows.`,
      billedMonths,
    }
  }
  return {
    kind: "refuse",
    code: "BILLED_MONTHS_CHOICE_REQUIRED",
    message: `This version changes invoiced months (${names}). Choose what happens to them: keep the billed rows, or adjust with a credit.`,
    billedMonths,
  }
}

/** One plain line per changed month for messages: "Sep 2026: $1,000.00 billed, this version $800.00". */
export function billedMonthSummary(m: BilledMonth): string {
  const total =
    m.deltaCents === 0
      ? "same total, lines differ"
      : `${centsLabel(m.baseCents)} billed, this version ${centsLabel(m.candidateCents)}`
  return `${monthShort(m.month)}: ${total}`
}
