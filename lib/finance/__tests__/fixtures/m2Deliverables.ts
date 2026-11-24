/**
 * M2 fixtures: fee-inclusive lines at a deliverable rounding edge (C-417).
 * Shared by the M2 goldens and the switch tests.
 */
import { explodeExcelLineItems, type MediaItemsKey } from "@/lib/docs/explodeExcelLineItems"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"

export type Fixture = { id: string; media: string; key: MediaItemsKey; buy: string; rate: number; fee: number; budgets: number[] }

const M2_DELIVERABLE_FIXTURES: readonly Fixture[] = [
  // 1,050 at 7%, CPC $1: 976.5 clicks in one order, 976.4999... in the other.
  { id: "E1", media: "search", key: "search", buy: "cpc", rate: 1, fee: 7, budgets: [1050] },
  // 10.50 at 7% (the M1 cent-edge pair), CPM $10: 976.5 impressions.
  { id: "E2", media: "social", key: "socialMedia", buy: "cpm", rate: 10, fee: 7, budgets: [10.5] },
  // 0.70 at 19.5%, CPM $1: 563.5 impressions; display carries ad serving.
  { id: "E3", media: "digidisplay", key: "digiDisplay", buy: "cpm", rate: 1, fee: 19.5, budgets: [0.7] },
  // Two bursts, both on an edge (325.5 and 976.5).
  { id: "E4", media: "social", key: "socialMedia", buy: "cpm", rate: 1, fee: 7, budgets: [0.35, 1.05] },
  // Live-sized lines, no edge.
  { id: "R1", media: "search", key: "search", buy: "cpc", rate: 0.35, fee: 10, budgets: [15000] },
  { id: "R2", media: "social", key: "socialMedia", buy: "cpm", rate: 16, fee: 10, budgets: [31949] },
]

export function m2LineInputs(): LineItemInput[] {
  return lineInputsFor(M2_DELIVERABLE_FIXTURES)
}

/** A flat ad serving rate so a deliverable count shows as dollars. */
export const M2_AD_SERVING = { getRateForMediaType: () => 1000, adservaudio: 1000 }

export function m2ExplodeRows(fixtures: readonly Fixture[] = M2_DELIVERABLE_FIXTURES, opts?: Parameters<typeof explodeExcelLineItems>[4]) {
  return fixtures.map((l) =>
    explodeExcelLineItems(
      l.key,
      {
        line_item_id: l.id,
        buyType: l.buy,
        budgetIncludesFees: true,
        bursts: l.budgets.map((budget) => ({ budget, buyAmount: l.rate, startDate: "2026-03-01", endDate: "2026-03-20" })),
      },
      l.fee,
      0,
      opts,
    ).map((row) => row.deliverables),
  )
}

export function m2EditorCounts(fixtures: readonly Fixture[] = M2_DELIVERABLE_FIXTURES) {
  return fixtures.map((l) =>
    l.budgets.map((budget) => computeLoadedDeliverables(l.buy, { budget, buyAmount: l.rate }, true, l.fee)),
  )
}

/** The M1 golden pairs (`netMedia.golden.test.ts`): gross budget and fee percent, CPM $12.50. */
const M1_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [15000, 10], [24680.4, 10], [13751.18, 20], [5833.39, 10], [1458.33, 10], [7701.25, 20], [3077.4, 20], [2500, 12.5],
  [1234.56, 17.75], [999.99, 33.33], [1000, 0], [0.35, 10], [5.25, 10], [10.5, 7], [17.5, 7], [266, 0.25],
]

export const M1_PAIR_FIXTURES: readonly Fixture[] = M1_PAIRS.map(([budget, fee], i) => ({
  id: `M${i + 1}`,
  media: "social",
  key: "socialMedia" as MediaItemsKey,
  buy: "cpm",
  rate: 12.5,
  fee,
  budgets: [budget],
}))

export function lineInputsFor(fixtures: readonly Fixture[]): LineItemInput[] {
  return fixtures.map((l) => ({
    lineItemId: l.id,
    mediaType: l.media,
    buyType: l.buy,
    rate: l.rate,
    enteredAmount: l.budgets.reduce((a, b) => a + b, 0),
    budgetIncludesFees: true,
    clientPaysForMedia: false,
    feePct: l.fee,
    approval: "approved",
    bursts: l.budgets.map((budget, i) => ({
      startDate: `2026-0${3 + i}-01`,
      endDate: `2026-0${3 + i}-20`,
      budget,
      buyAmount: l.rate,
    })),
  }))
}
