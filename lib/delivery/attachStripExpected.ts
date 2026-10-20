import { inclusiveCampaignDayMetrics } from "@/lib/dates/melbourne"
import { roundMoney2 } from "@/lib/format/money"
import {
  resolveCampaignExpectedSpendForWindow,
  resolveCampaignExpectedSpendToDate,
  type ExpectedSpendWindow,
  type ResolveCampaignSpendInput,
} from "@/lib/spend/resolveCampaignExpectedSpend"

export type StripExpectedFields = {
  expectedSpendToDate: number
  behindBy: number
  daysElapsed: number
  daysInCampaign: number
  daysRemaining: number
}

/**
 * Campaign expected + flight days from the same resolvers as the
 * Where we are strip. behindBy is expected − delivered (positive = behind).
 *
 * With `window` (from `resolvePacingWindowISO`), expected is the strip's
 * window figure (`resolveCampaignExpectedSpendForWindow`) and the day counts
 * run to the window end (Melbourne yesterday at the latest), so delivered and
 * expected stop on the same day. Without it, the figure is to-date as at `asOf`.
 */
export function attachStripExpected(input: {
  stripInputs: ResolveCampaignSpendInput
  deliveredSpendToDate: number
  asOf: string
  window?: ExpectedSpendWindow
}): StripExpectedFields {
  const mediaInputs: ResolveCampaignSpendInput = {
    ...input.stripInputs,
    basis: "media",
    monthlyOpts: {
      ...input.stripInputs.monthlyOpts,
      basis: "media",
      asOfISO: input.window ? input.window.endISO : input.asOf,
    },
  }
  const expectedSpendToDate = input.window
    ? resolveCampaignExpectedSpendForWindow({ ...mediaInputs, window: input.window })
    : resolveCampaignExpectedSpendToDate(mediaInputs)
  const start = input.stripInputs.campaignStartISO
  const end = input.stripInputs.campaignEndISO
  const daysAsOf = input.window ? input.window.endISO : input.asOf
  const days =
    start && end
      ? inclusiveCampaignDayMetrics(start, end, daysAsOf)
      : { daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }
  return {
    expectedSpendToDate,
    behindBy: roundMoney2(expectedSpendToDate - input.deliveredSpendToDate),
    daysElapsed: days.daysElapsed,
    daysInCampaign: days.daysInCampaign,
    daysRemaining: days.daysRemaining,
  }
}
