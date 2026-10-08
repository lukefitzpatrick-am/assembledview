import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"

function line(
  partial: Partial<LineItemInput> & Pick<LineItemInput, "lineItemId" | "mediaType" | "bursts">,
): LineItemInput {
  const budget = partial.bursts.reduce((sum, burst) => sum + Number(burst.budget ?? 0), 0)
  return {
    buyType: "cpc",
    rate: 1,
    enteredAmount: budget,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    approval: "approved",
    feePct: 0,
    ...partial,
  }
}

/** F1. Search, gross budget, 15% fee, two bursts in January. */
export const f1: LineItemInput[] = [
  line({
    lineItemId: "f1-search",
    mediaType: "search",
    budgetIncludesFees: true,
    feePct: 15,
    bursts: [
      { startDate: "2026-01-01", endDate: "2026-01-31", budget: 1000 },
      { startDate: "2026-01-01", endDate: "2026-01-31", budget: 2000 },
    ],
  }),
]

/** F2. Search, net budget, 20% fee. */
export const f2: LineItemInput[] = [
  line({
    lineItemId: "f2-search",
    mediaType: "search",
    feePct: 20,
    bursts: [{ startDate: "2026-02-01", endDate: "2026-02-28", budget: 10000 }],
  }),
]

/** F3. A client-pays line plus a normal net line, both at 15%. */
export const f3: LineItemInput[] = [
  line({
    lineItemId: "f3-client-pays",
    mediaType: "social",
    budgetIncludesFees: true,
    clientPaysForMedia: true,
    feePct: 15,
    bursts: [{ startDate: "2026-03-01", endDate: "2026-03-31", budget: 10000 }],
  }),
  line({
    lineItemId: "f3-search",
    mediaType: "search",
    feePct: 15,
    bursts: [{ startDate: "2026-03-01", endDate: "2026-03-31", budget: 8500 }],
  }),
]

/** F4. Bonus line. */
export const f4: LineItemInput[] = [
  line({
    lineItemId: "f4-bonus",
    mediaType: "television",
    buyType: "bonus",
    bursts: [{ startDate: "2026-04-01", endDate: "2026-04-30", budget: 4000 }],
  }),
]

/** F5. TV package inclusions. */
export const f5: LineItemInput[] = [
  line({
    lineItemId: "f5-package",
    mediaType: "television",
    buyType: "package_inclusions",
    feePct: 15,
    bursts: [{ startDate: "2026-05-01", endDate: "2026-05-31", budget: 8000 }],
  }),
]

/** F6. Mid-month start, $74,000, 17 Jan to 31 Mar. */
export const f6: LineItemInput[] = [
  line({
    lineItemId: "f6-ooh",
    mediaType: "ooh",
    bursts: [{ startDate: "2026-01-17", endDate: "2026-03-31", budget: 74000 }],
  }),
]

/** F7. Two days across the April 2026 DST change. */
export const f7: LineItemInput[] = [
  line({
    lineItemId: "f7-search",
    mediaType: "search",
    bursts: [{ startDate: "2026-04-05", endDate: "2026-04-06", budget: 200 }],
  }),
]

/**
 * F8. Production plus two digital lines with ad serving.
 * The production burst matches formatProductionBurstForPersist: cost 2000, quantity 1.
 */
const f8ProductionBurst = {
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  cost: 2000,
  amount: 1,
  budget: "2000",
  buyAmount: "1",
  calculatedValue: 1,
  description: "",
  market: "",
}

export const f8: LineItemInput[] = [
  line({
    lineItemId: "f8-production",
    mediaType: "production",
    buyType: "production",
    bursts: [f8ProductionBurst],
  }),
  line({
    lineItemId: "f8-display-a",
    mediaType: "digiDisplay",
    buyType: "cpm",
    rate: 10,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 1000,
        deliverables: 100000,
      },
    ],
  }),
  line({
    lineItemId: "f8-display-b",
    mediaType: "digiDisplay",
    buyType: "cpm",
    rate: 10,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 1000,
        deliverables: 100000,
      },
    ],
  }),
]

export const GOLDEN_PLANS = [
  { id: "F1", lines: f1, campaignStart: "2026-01-01", campaignEnd: "2026-01-31" },
  { id: "F2", lines: f2, campaignStart: "2026-02-01", campaignEnd: "2026-02-28" },
  { id: "F3", lines: f3, campaignStart: "2026-03-01", campaignEnd: "2026-03-31" },
  { id: "F4", lines: f4, campaignStart: "2026-04-01", campaignEnd: "2026-04-30" },
  { id: "F5", lines: f5, campaignStart: "2026-05-01", campaignEnd: "2026-05-31" },
  { id: "F6", lines: f6, campaignStart: "2026-01-17", campaignEnd: "2026-03-31" },
  { id: "F7", lines: f7, campaignStart: "2026-04-05", campaignEnd: "2026-04-06" },
  { id: "F8", lines: f8, campaignStart: "2026-06-01", campaignEnd: "2026-06-30" },
] as const
