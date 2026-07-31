/**
 * Pure presentation props for MBA Details + Billing Schedule panel indicators.
 * Derives ONLY from {@link CampaignFinancials} — no recompute of totals.
 */

import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import { parseMoneyInput, formatMoney } from "@/lib/format/money"

export type MediaTypeRowIndicators = {
  muted: boolean
  notInMba: boolean
  manual: boolean
  feeAdjusted: boolean
  /** True when any non-excluded line in this media type is client-pays-for-media. */
  clientPays: boolean
}

export type MonthDotIndicator = {
  /** Distinguishes hover copy; both tones render as attention (amber) in the UI. */
  tone: "prepay" | "manual"
  hover: string
}

export type MbaDetailsPanelIndicatorModel = {
  /** Amber "Partial MBA · X of Y" when any line is excluded (or partial mode). */
  partialLabel: string | null
  byMediaType: Record<string, MediaTypeRowIndicators>
  billableEqualsMba: boolean
  /** Campaign-level fee override changed MBA fee total. */
  mbaFeeAdjusted: boolean
}

export type BillingSchedulePanelIndicatorModel = {
  /** Pills under the Billing Schedule title. */
  titlePills: { key: string; label: string; tone: "amber" | "muted" }[]
  /** Amber dot on Edit Billing when any override exists. */
  editBillingHasOverride: boolean
  byMonth: Record<string, MonthDotIndicator>
  billableEqualsMba: boolean
}

export type PanelIndicatorsFromCampaignFinancials = {
  mbaDetails: MbaDetailsPanelIndicatorModel
  billingSchedule: BillingSchedulePanelIndicatorModel
}

function parseScheduleMoney(value: string | undefined): number {
  return parseMoneyInput(value ?? 0) ?? 0
}

function formatHoverMoney(n: number): string {
  return formatMoney(n)
}

function reasonLabel(reasons: string[]): string {
  if (reasons.includes("prepayment")) return "prepayment"
  if (reasons.includes("manual")) return "manual"
  if (reasons.includes("client_terms")) return "client terms"
  const filtered = reasons.filter((r) => r !== "rounding" && r !== "excluded")
  return filtered[0] ?? reasons[0] ?? "override"
}

/**
 * Map core financials → panel indicator view-models.
 * `@param opts.isPartialMBA` gates the Partial MBA header when the form flag is on
 * even before any line is marked excluded in the engine result.
 * `@param opts.selectedMonthYears` / campaign month count also mark month partiality.
 */
export function panelIndicatorsFromCampaignFinancials(
  financials: CampaignFinancials,
  opts?: {
    isPartialMBA?: boolean
    /** Selected MBA month keys; when a proper subset of delivery months → month partial. */
    selectedMonthYears?: readonly string[]
  }
): PanelIndicatorsFromCampaignFinancials {
  const perLine = financials.perLine
  const inMba = perLine.filter((l) => !l.flags.excluded)
  const excluded = perLine.filter((l) => l.flags.excluded)
  const total = perLine.length
  const inCount = inMba.length

  const deliveryMonths = financials.deliverySchedule.map((m) => m.monthYear)
  const selectedMonths = opts?.selectedMonthYears ?? []
  const monthPartial =
    selectedMonths.length > 0 &&
    deliveryMonths.length > 0 &&
    (selectedMonths.length < deliveryMonths.length ||
      !deliveryMonths.every((m) => selectedMonths.includes(m)))

  const linePartial =
    Boolean(opts?.isPartialMBA) || excluded.length > 0 || (total > 0 && inCount < total)

  let partialLabel: string | null = null
  if (linePartial && total > 0) {
    partialLabel = `Partial MBA · ${inCount} of ${total}`
  } else if (monthPartial) {
    partialLabel = `Partial MBA · ${selectedMonths.length} of ${deliveryMonths.length} months`
  }

  const byMediaType: Record<string, MediaTypeRowIndicators> = {}
  const linesByMedia = new Map<string, typeof perLine>()
  for (const line of perLine) {
    const key = line.mediaType || "unknown"
    const list = linesByMedia.get(key)
    if (list) list.push(line)
    else linesByMedia.set(key, [line])
  }
  for (const [key, lines] of linesByMedia) {
    const allExcluded = lines.every((l) => l.flags.excluded)
    byMediaType[key] = {
      muted: allExcluded,
      notInMba: allExcluded,
      manual: lines.some((l) => l.flags.manualBilling),
      feeAdjusted: lines.some((l) => l.flags.manualFee),
      clientPays: lines.some(
        (l) => !l.flags.excluded && l.flags.clientPaysForMedia
      ),
    }
  }

  const manualLines = perLine.filter((l) => l.flags.manualBilling && !l.flags.excluded)
  const hasPrepayDelta = financials.deliveryVsBillingDelta.some((d) =>
    d.reasons.includes("prepayment")
  )

  const titlePills: BillingSchedulePanelIndicatorModel["titlePills"] = []
  if (manualLines.length > 0) {
    titlePills.push({
      key: "manual-count",
      label: `${manualLines.length} manual`,
      tone: "amber",
    })
  }
  if (hasPrepayDelta) {
    titlePills.push({
      key: "prepay-reason",
      label: "Prepayment",
      // Attention (amber) — same meaning family as manual overrides.
      tone: "amber",
    })
  }

  const deliveryByMonth = new Map(
    financials.deliverySchedule.map((m) => [m.monthYear, m] as const)
  )
  const billingByMonth = new Map(
    financials.billingSchedule.map((m) => [m.monthYear, m] as const)
  )
  const deltaByMonth = new Map(
    financials.deliveryVsBillingDelta.map((d) => [d.month, d] as const)
  )

  const byMonth: Record<string, MonthDotIndicator> = {}
  for (const month of financials.billingSchedule) {
    const monthYear = month.monthYear
    const delta = deltaByMonth.get(monthYear)
    const isPrepay = Boolean(delta?.reasons.includes("prepayment"))
    const isManualMonth = manualLines.some((l) =>
      l.billingMonths.some((m) => m.month === monthYear && Math.abs(m.amount) > 0.005)
    )
    if (!isPrepay && !isManualMonth) continue

    const calc = parseScheduleMoney(deliveryByMonth.get(monthYear)?.mediaTotal)
    const set = parseScheduleMoney(billingByMonth.get(monthYear)?.mediaTotal)
    const reason = reasonLabel(delta?.reasons ?? (isPrepay ? ["prepayment"] : ["manual"]))
    byMonth[monthYear] = {
      tone: isPrepay ? "prepay" : "manual",
      hover: `${formatHoverMoney(calc)} → ${formatHoverMoney(set)} · ${reason}`,
    }
  }

  return {
    mbaDetails: {
      partialLabel,
      byMediaType,
      billableEqualsMba: financials.validation.billableEqualsMba,
      mbaFeeAdjusted: financials.mbaFeeAdjusted,
    },
    billingSchedule: {
      titlePills,
      editBillingHasOverride: manualLines.length > 0 || perLine.some((l) => l.flags.manualFee),
      byMonth,
      billableEqualsMba: financials.validation.billableEqualsMba,
    },
  }
}
