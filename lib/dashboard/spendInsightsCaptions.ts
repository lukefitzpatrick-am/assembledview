/**
 * Client-hub Spending insights chart basis captions.
 *
 * Do not reuse `MEDIA_MIX_DONUT_BASIS_CAPTION`: that string describes the campaign-page
 * parser (`monthlySpendArrayFromDeliverySchedule` + display-filter of Fees/Production).
 * Client hub series come from `normalizeDeliveryEntryMediaBreakdown` over delivery-schedule
 * months in the selected range — planned media, `feeTotal` never added.
 */
import { fmt } from "@/lib/chart-theme"

const BASIS = "delivery schedule months"
const FEES = "excludes fees"
/** Campaign status Planned is outside the commercial set on purpose. */
const CAMPAIGN_SET = "booked and live campaigns"

export type SpendInsightsCaptionBy = "campaign" | "type" | "month"

export function spendInsightsCaption(args: {
  by: SpendInsightsCaptionBy
  total: number
  rangeLabel?: string
}): string {
  const by =
    args.by === "campaign"
      ? "planned media by campaign"
      : args.by === "type"
        ? "planned media by type"
        : "planned media by month"
  const parts = [`${CAMPAIGN_SET} · ${by}`, BASIS, FEES]
  if (args.by === "month" && args.rangeLabel) parts.push(args.rangeLabel)
  parts.push(`Total: ${fmt.currencyCompact(args.total)}`)
  return parts.join(" · ")
}
