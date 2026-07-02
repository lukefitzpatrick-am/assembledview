import { test } from "node:test"
import assert from "node:assert/strict"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  mapStandardProductionLineItemsToExpertRows,
  mapProductionExpertRowsToStandardLineItems,
  type StandardProductionFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"

const START = new Date(2026, 0, 5)   // Mon 5 Jan 2026
const END = new Date(2026, 1, 1)     // ~4 weeks
const cols = buildWeeklyGanttColumnsFromCampaign(START, END)

function sumWeekly(v: Record<string, number | "">): number {
  return Object.values(v).reduce<number>((s, x) => s + (x === "" ? 0 : Number(x)), 0)
}

function sumCalcQty(li: StandardProductionFormLineItem): number {
  return (li.bursts ?? []).reduce((s, b) => s + Number(b.calculatedValue ?? b.amount ?? 0), 0)
}

function sumGross(li: StandardProductionFormLineItem): number {
  return (li.bursts ?? []).reduce(
    (s, b) => s + Number(b.cost ?? 0) * Number(b.amount ?? 0),
    0
  )
}

test("production import→export round-trip preserves totals, cost, and identity", () => {
  const std: StandardProductionFormLineItem[] = [
    {
      mediaType: "Audio",
      publisher: "Sound Co",
      description: "Voiceover",
      market: "National",
      lineItemId: "prod-abc",
      line_item_id: "prod-abc",
      line_item: 1,
      lineItem: 1,
      bursts: [
        {
          cost: 500,
          amount: 10,
          startDate: START,
          endDate: END,
          calculatedValue: 10,
        },
      ],
    },
  ]
  const expert = mapStandardProductionLineItemsToExpertRows(std, cols, START, END)
  assert.equal(expert.length, 1)
  assert.equal(expert[0]!.sourceLineItemId, "prod-abc")
  assert.equal(sumWeekly(expert[0]!.weeklyValues), 10)
  assert.equal(Number(expert[0]!.unitRate), 500)
  assert.equal(Number(expert[0]!.grossCost), 5000)

  const back = mapProductionExpertRowsToStandardLineItems(expert, cols, START, END)
  assert.equal(back[0]!.line_item_id, "prod-abc")
  assert.equal(sumCalcQty(back[0]!), 10)
  assert.equal(sumGross(back[0]!), 5000)
  assert.equal(back[0]!.bursts[0]!.cost, 500)

  const burst = back[0]!.bursts[0]!
  assert.equal(burst.cost, 500)
  assert.equal(burst.amount, burst.calculatedValue)
  assert.equal(burst.budget, String(500 * Number(burst.amount)))
  assert.equal(burst.buyAmount, String(burst.amount))
})

test("production normalizes dual-shape bursts on import", () => {
  const std: StandardProductionFormLineItem[] = [
    {
      mediaType: "Print",
      publisher: "",
      description: "",
      market: "",
      lineItemId: "x",
      line_item_id: "x",
      line_item: 1,
      lineItem: 1,
      bursts: [
        {
          cost: 0,
          amount: 0,
          budget: "3000",
          buyAmount: "6",
          calculatedValue: 6,
          startDate: new Date(2026, 0, 7),
          endDate: new Date(2026, 0, 9),
        },
      ],
    },
  ]
  const expert = mapStandardProductionLineItemsToExpertRows(std, cols, START, END)
  assert.equal(Number(expert[0]!.unitRate), 500)
  assert.equal(Number(expert[0]!.grossCost), 3000)
})
