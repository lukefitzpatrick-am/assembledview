import { inclusiveCampaignDayMetrics } from "@/lib/dates/melbourne"
import { roundMoney2 } from "@/lib/format/money"
import {
  resolveCampaignExpectedSpendToDate,
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
 */
export function attachStripExpected(input: {
  stripInputs: ResolveCampaignSpendInput
  deliveredSpendToDate: number
  asOf: string
}): StripExpectedFields {
  const expectedSpendToDate = resolveCampaignExpectedSpendToDate(input.stripInputs)
  const start = input.stripInputs.campaignStartISO
  const end = input.stripInputs.campaignEndISO
  const days =
    start && end
      ? inclusiveCampaignDayMetrics(start, end, input.asOf)
      : { daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }
  return {
    expectedSpendToDate,
    behindBy: roundMoney2(expectedSpendToDate - input.deliveredSpendToDate),
    daysElapsed: days.daysElapsed,
    daysInCampaign: days.daysInCampaign,
    daysRemaining: days.daysRemaining,
  }
}
