/**
 * Pure presentation props for MBA Details + Billing Schedule panel indicators.
 * Derives ONLY from {@link CampaignFinancials} — no recompute of totals.
 */

import { MANUAL_BILLING_VOCAB } from "@/lib/billing/manualBillingVocabulary"
import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"

export type MediaTypeRowIndicators = {
  muted: boolean
  notInMba: boolean
  /**
   * Manual timing only (not prepaid). MB-9: prepaid lines use prepaid / mediaPrepaid
   * so the container pill shares the same word as the line badge.
   */
  manual: boolean
  /** Media + fee prepayment — badge "Prepaid". */
  prepaid: boolean
  /** Media-only prepayment — badge "Media prepaid". */
  mediaPrepaid: boolean
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
  /** Pills under the Billing Schedule title (one label per concept; prefer modal status row). */
  titlePills: { key: string; label: string; tone: "amber" | "muted"; tooltip?: string }[]
  /** Amber dot on Edit Billing when any override exists. */
  editBillingHasOverride: boolean
  byMonth: Record<string, MonthDotIndicator>
  billableEqualsMba: boolean
}

export type PanelIndicatorsFromCampaignFinancials = {
  mbaDetails: MbaDetailsPanelIndicatorModel
  billingSchedule: BillingSchedulePanelIndicatorModel
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
    const inScope = lines.filter((l) => !l.flags.excluded)
    byMediaType[key] = {
      muted: allExcluded,
      notInMba: allExcluded,
      // MB-9: one word per state — Manual only when not already Prepaid / Media prepaid.
      manual: inScope.some(
        (l) => l.flags.manualBilling && !l.flags.prepaid && !l.flags.mediaPrepaid
      ),
      prepaid: inScope.some((l) => l.flags.prepaid),
      mediaPrepaid: inScope.some((l) => l.flags.mediaPrepaid),
      feeAdjusted: lines.some((l) => l.flags.manualFee),
      clientPays: inScope.some((l) => l.flags.clientPaysForMedia),
    }
  }

  // Lines with any billing timing override (manual / media prepaid / full prepaid).
  const timingOverrideLines = perLine.filter(
    (l) =>
      !l.flags.excluded &&
      (l.flags.manualBilling || l.flags.prepaid || l.flags.mediaPrepaid)
  )
  // Title "Manual" only when not already labeled Prepaid / Media prepaid.
  const manualOnlyLines = timingOverrideLines.filter(
    (l) => l.flags.manualBilling && !l.flags.prepaid && !l.flags.mediaPrepaid
  )
  const hasFullPrepaid = perLine.some((l) => !l.flags.excluded && l.flags.prepaid)
  const hasMediaPrepaid = perLine.some((l) => !l.flags.excluded && l.flags.mediaPrepaid)

  const titlePills: BillingSchedulePanelIndicatorModel["titlePills"] = []
  if (manualOnlyLines.length > 0) {
    titlePills.push({
      key: "manual-count",
      label:
        manualOnlyLines.length === 1
          ? MANUAL_BILLING_VOCAB.manualTiming
          : `${MANUAL_BILLING_VOCAB.manualTiming} · ${manualOnlyLines.length}`,
      tone: "amber",
      tooltip:
        "Billing months were set manually and may differ from auto-calculated delivery timing for invoicing.",
    })
  }
  // MB-8/9: same badge words as line / timing editor — Prepaid only when media+fee.
  if (hasFullPrepaid) {
    titlePills.push({
      key: "prepay-reason",
      label: MANUAL_BILLING_VOCAB.prepaidMediaAndFee,
      tone: "amber",
      tooltip:
        "Media and agency fee are billed up front (prepayment) rather than spread across delivery months.",
    })
  } else if (hasMediaPrepaid) {
    titlePills.push({
      key: "prepay-reason",
      label: MANUAL_BILLING_VOCAB.prepaidMedia,
      tone: "amber",
      tooltip: "Media is billed up front; agency fee stays on delivery timing.",
    })
  }

  // MB-9: amber month dots treated deliberate Prebill / Adjust timing as an anomaly.
  // Calm status lives on the header pill + Prepaid/Manual/Media prepaid badges;
  // real reconciliation failures use the unintended-divergence banner / Off-by / blocking pills.
  const byMonth: Record<string, MonthDotIndicator> = {}

  return {
    mbaDetails: {
      partialLabel,
      byMediaType,
      billableEqualsMba: financials.validation.billableEqualsMba,
      mbaFeeAdjusted: financials.mbaFeeAdjusted,
    },
    billingSchedule: {
      titlePills,
      editBillingHasOverride:
        timingOverrideLines.length > 0 || perLine.some((l) => l.flags.manualFee),
      byMonth,
      billableEqualsMba: financials.validation.billableEqualsMba,
    },
  }
}
