import type { ScenarioLine } from "../types.js"

/**
 * Jayco AU search + Meta lines from the pacing-v2 mock.
 * Burst spend is the banked September figure that yields $16,088 / 108%
 * after 13 remaining burst days at a $164 cap (mock outcome).
 */
export const JAYCO_AS_OF = "2026-09-17"

export const JAYCO_SEARCH: ScenarioLine = {
  lineItemId: "jayco001-se",
  channel: "search",
  platform: "Google Ads",
  budget: 185_904,
  spent: 143_693,
  expectedToDate: 143_693,
  daysLeft: 106,
  daysElapsed: 79,
  endDate: "2027-06-30",
  bursts: [
    {
      index: 2,
      start: "2026-09-01",
      end: "2026-09-30",
      budget: 14_872,
      spend: 13_956,
    },
  ],
  deliverable: { unit: "clicks", delivered: 61_146, planned: 79_108 },
  rate: { kind: "cpc", value: 2.35, basis: "delivered" },
  yesterday: 412,
  dailyPlan: 1_754,
}

export const JAYCO_META: ScenarioLine = {
  lineItemId: "jayco001-sm",
  channel: "social",
  platform: "Meta",
  budget: 42_000,
  spent: 16_898,
  expectedToDate: 24_410,
  daysLeft: 106,
  daysElapsed: 79,
  endDate: "2027-06-30",
  bursts: [],
  deliverable: { unit: "impressions", delivered: 3_100_550, planned: 7_706_422 },
  rate: { kind: "cpm", value: 5.45, basis: "delivered" },
  yesterday: 44,
  dailyPlan: 405,
}

export const JAYCO_LINES: ScenarioLine[] = [JAYCO_SEARCH, JAYCO_META]

export const BICAU002_CHANNEL_FACTORY: ScenarioLine = {
  lineItemId: "bicau002-cf",
  channel: "programmatic",
  platform: "Channel Factory",
  budget: 26_667,
  spent: 7_043,
  expectedToDate: 7_043,
  daysLeft: 38,
  daysElapsed: 48,
  endDate: "2026-10-25",
  bursts: [],
  deliverable: { unit: "views", delivered: 337_746, planned: 444_444 },
  rate: { kind: "cpv", value: 0.06, basis: "delivered" },
  yesterday: 147,
  dailyPlan: 556,
}
