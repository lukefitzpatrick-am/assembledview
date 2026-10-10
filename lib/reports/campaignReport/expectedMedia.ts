/**
 * Expected media for a campaign report window.
 * Same resolver as the pacing card: delivery-schedule months, media basis,
 * Melbourne as-of on monthlyOpts. A bounded period is the resolver at the
 * period end minus the resolver at the day before the period start.
 */
import { fromCents, toCents } from "@/lib/money"
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"
import {
  resolveCampaignExpectedSpendToDate,
  type ResolveCampaignSpendInput,
} from "@/lib/spend/resolveCampaignExpectedSpend"

/** Periods that are not the whole flight. Campaign to date is a single as-of. */
export function reportPeriodIsSlice(kind: CampaignReportPeriodKind): boolean {
  return kind === "this_month" || kind === "last_month" || kind === "custom"
}

export function dayBeforeISO(iso: string): string {
  const [y, m, d] = iso.split("-").map((part) => Number(part))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

export function expectedMediaForReportWindow(
  input: Omit<ResolveCampaignSpendInput, "basis" | "monthlyOpts" | "metricsExpectedSpendToDate"> & {
    windowStartISO: string
    windowEndISO: string
    /** This month, last month, and custom ranges. Campaign to date stays a single as-of. */
    periodSlice: boolean
  },
): number {
  const at = (asOfISO: string) =>
    resolveCampaignExpectedSpendToDate({
      billingSchedule: input.billingSchedule,
      deliverySchedule: input.deliverySchedule,
      monthlySpend: input.monthlySpend,
      campaignStartISO: input.campaignStartISO,
      campaignEndISO: input.campaignEndISO,
      basis: "media",
      monthlyOpts: {
        campaignStartISO: input.campaignStartISO,
        campaignEndISO: input.campaignEndISO,
        asOfISO,
        basis: "media",
      },
    })

  const atEnd = at(input.windowEndISO)
  if (!input.periodSlice) return atEnd

  const before = at(dayBeforeISO(input.windowStartISO))
  const cents = toCents(atEnd) - toCents(before)
  return fromCents(cents > 0 ? cents : 0)
}
