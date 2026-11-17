/**
 * S1 A (Luke, 17 Nov 2026): the one validation set every publish runs. Pure:
 * no DB, no server-only, so the server publish paths and both plan pages run
 * the same rules.
 *
 * Refuse (with the `publish_validation` switch on; the editor shows them
 * either way):
 * - a line with no publisher (the channel's picker field, as the publisher
 *   guard reads it: `linePublisherValue`)
 * - a burst that ends before it starts
 * - two bursts on one line that share a day
 * - a burst outside the plan dates
 * - a plan whose start is after its end (one whole-plan problem; the dates
 *   rule cannot run on a reversed window)
 * - a package line with no quantity
 *
 * Warn and allow: a derived line with a budget and no deliverables.
 *
 * Days are Melbourne civil days, both ends inclusive (`coerceBurstDateLocal`,
 * the same rule as the card's overlap banner). A burst with a missing or
 * unreadable date is left out here: publish already refuses it
 * (`missingBurstDatesGate`).
 *
 * shortcut: a package line's quantity is read from `bursts[].calculatedValue`
 * (a burst with a budget above 0 and a zero, blank or missing value). S3 adds a
 * typed quantity and unit; then this rule reads that field instead.
 */

import type { BuilderIssue } from "@/lib/mediaplan/builderIssues"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { describeBurstOverlap, findOverlappingBursts } from "@/lib/mediaplan/burstOverlap"
import { burstHasBudgetAndNoQuantity, isSaveRoundedBuyType } from "@/lib/mediaplan/deliverableBudget"
import { linePublisherValue, type PublisherGuardLine } from "@/lib/mediaplan/publisherGuard"

export const PUBLISH_VALIDATION_REFUSED = "PUBLISH_VALIDATION_REFUSED" as const

export type PublishRule =
  | "no_publisher"
  | "burst_end_before_start"
  | "bursts_overlap"
  | "burst_outside_plan_dates"
  | "plan_dates_reversed"
  | "package_no_quantity"
  | "zero_deliverables"

export type PublishProblem = {
  rule: PublishRule
  /** Empty for a whole-plan problem (`plan_dates_reversed`). */
  channel: string
  lineItemId: string
  /** 1-based burst number; null when the problem is the whole line. */
  burst: number | null
  message: string
}

export type PublishLine = PublisherGuardLine & {
  buyType?: string | null
  bursts?: unknown
}

export type PublishPlan = {
  /** `YYYY-MM-DD`. Missing either: the plan dates rule is skipped. */
  campaignStartDate?: string | null
  campaignEndDate?: string | null
  lineItems: readonly PublishLine[]
}

export type PublishValidation = { refuse: PublishProblem[]; warn: PublishProblem[] }

type Burst = { raw: unknown; startDate: Date | null; endDate: Date | null }

function burstList(bursts: unknown): unknown[] {
  if (Array.isArray(bursts)) return bursts
  if (typeof bursts !== "string" || !bursts.trim()) return []
  try {
    const parsed = JSON.parse(bursts) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function dateField(row: Record<string, unknown>, camel: string, snake: string): Date | null {
  const v = row[camel] ?? row[snake]
  return v instanceof Date || typeof v === "string" ? coerceBurstDateLocal(v) : null
}

function readBursts(bursts: unknown): Burst[] {
  return burstList(bursts).map((raw) => {
    if (!raw || typeof raw !== "object") return { raw, startDate: null, endDate: null }
    const row = raw as Record<string, unknown>
    return { raw, startDate: dateField(row, "startDate", "start_date"), endDate: dateField(row, "endDate", "end_date") }
  })
}

function planDate(value: string | null | undefined): Date | null {
  return typeof value === "string" ? coerceBurstDateLocal(value) : null
}

/** Every refusal and warning on the plan, in line order. */
export function validatePlanForPublish(plan: PublishPlan): PublishValidation {
  const refuse: PublishProblem[] = []
  const warn: PublishProblem[] = []
  const start = planDate(plan.campaignStartDate)
  const end = planDate(plan.campaignEndDate)
  const planWindow = start && end && start <= end ? { start, end } : null
  if (start && end && start > end) {
    refuse.push({
      rule: "plan_dates_reversed",
      channel: "",
      lineItemId: "",
      burst: null,
      message: `The plan dates are reversed: it starts ${plan.campaignStartDate} and ends ${plan.campaignEndDate}. Fix the campaign dates.`,
    })
  }

  for (const line of plan.lineItems) {
    const id = String(line.lineItemId ?? "").trim()
    const at = (rule: PublishRule, burst: number | null, message: string): PublishProblem => ({
      rule,
      channel: line.channel,
      lineItemId: id,
      burst,
      message,
    })
    if (!linePublisherValue(line)) {
      refuse.push(at("no_publisher", null, `Line ${id} has no publisher. Pick who it is booked with.`))
    }
    const bursts = readBursts(line.bursts)
    const isPackage = String(line.buyType ?? "").trim().toLowerCase() === "package"
    bursts.forEach((b, i) => {
      const n = i + 1
      if (b.startDate && b.endDate && b.endDate < b.startDate) {
        refuse.push(at("burst_end_before_start", n, `Line ${id}, burst ${n} ends before it starts.`))
      } else if (planWindow && b.startDate && b.endDate && (b.startDate < planWindow.start || b.endDate > planWindow.end)) {
        refuse.push(
          at(
            "burst_outside_plan_dates",
            n,
            `Line ${id}, burst ${n} runs outside the plan dates (${plan.campaignStartDate} to ${plan.campaignEndDate}).`,
          ),
        )
      }
      if (isPackage && burstHasBudgetAndNoQuantity(b.raw)) {
        refuse.push(at("package_no_quantity", n, `Line ${id}, burst ${n} is a package with a budget and no quantity. Enter the quantity.`))
      } else if (isSaveRoundedBuyType(line.buyType) && burstHasBudgetAndNoQuantity(b.raw)) {
        warn.push(at("zero_deliverables", n, `Line ${id}, burst ${n} has a budget and no deliverables. Check the rate.`))
      }
    })
    for (const o of findOverlappingBursts(bursts.map((b) => ({ startDate: b.startDate, endDate: b.endDate })))) {
      refuse.push(at("bursts_overlap", o.second, `Line ${id}: ${describeBurstOverlap(o)}`))
    }
  }
  return { refuse, warn }
}

export type PublishRefusalBody = {
  error: string
  code: typeof PUBLISH_VALIDATION_REFUSED
  lineItemIds: string[]
  publishProblems: PublishProblem[]
}

/** The 422 body every publish path returns. */
export function publishRefusalBody(refuse: readonly PublishProblem[]): PublishRefusalBody {
  const shown = refuse.slice(0, 5).map((p) => p.message)
  const rest = refuse.length - shown.length
  return {
    error: `Not published. Fix ${refuse.length === 1 ? "this" : "these"} first: ${shown.join(" ")}${rest > 0 ? ` And ${rest} more.` : ""}`,
    code: PUBLISH_VALIDATION_REFUSED,
    lineItemIds: [...new Set(refuse.map((p) => p.lineItemId).filter(Boolean))],
    publishProblems: [...refuse],
  }
}

const FIELD: Record<PublishRule, string> = {
  no_publisher: "Publisher",
  burst_end_before_start: "Burst dates",
  bursts_overlap: "Burst dates",
  burst_outside_plan_dates: "Burst dates",
  plan_dates_reversed: "Campaign dates",
  package_no_quantity: "Quantity",
  zero_deliverables: "Deliverables",
}

/**
 * One rail entry per problem. Refusals are errors only while the switch is
 * on; off, they show as warnings that say publish will refuse them later.
 * The id ends with the entry's place in the list: a burst that overlaps two
 * others gives two problems on the same rule, line and burst.
 */
export function publishValidationBuilderIssues(
  result: PublishValidation,
  refusing: boolean,
): BuilderIssue[] {
  const issue = (p: PublishProblem, kind: "refuse" | "warn", n: number): BuilderIssue => ({
    id: `publish-validation:${p.rule}:${p.channel}:${p.lineItemId}:${p.burst ?? 0}:${n}`,
    severity: kind === "refuse" && refusing ? "error" : "warning",
    title: p.message,
    detail:
      kind === "warn"
        ? "Does not block publish."
        : refusing
          ? "Publish is refused until this line is fixed. Save draft still works."
          : "Does not block publish yet. Publish will refuse this once publish validation is on.",
    stepLabel: p.rule === "plan_dates_reversed" ? "Campaign setup" : "Media",
    fieldLabel: FIELD[p.rule],
  })
  const refused = result.refuse.map((p, i) => issue(p, "refuse", i))
  return [...refused, ...result.warn.map((p, i) => issue(p, "warn", refused.length + i))]
}
