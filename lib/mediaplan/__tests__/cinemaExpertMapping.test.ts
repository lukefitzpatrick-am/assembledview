import { test } from "node:test"
import assert from "node:assert/strict"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import { parseMoneyInput } from "@/lib/format/money"
import {
  mapStandardCinemaLineItemsToExpertRows,
  mapCinemaExpertRowsToStandardLineItems,
  type StandardCinemaFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"

const START = new Date(2026, 0, 5)   // Mon 5 Jan 2026
const END = new Date(2026, 1, 1)     // ~4 weeks
const cols = buildWeeklyGanttColumnsFromCampaign(START, END)

function sumWeekly(v: Record<string, number | "">): number {
  return Object.values(v).reduce<number>((s, x) => s + (x === "" ? 0 : Number(x)), 0)
}
function sumCalc(li: StandardCinemaFormLineItem): number {
  return (li.bursts ?? []).reduce((s, b) => s + Number(b.calculatedValue ?? 0), 0)
}

test("cinema round-trip preserves identity, deliverables, and unit rate", () => {
  const std: StandardCinemaFormLineItem[] = [{
    network: "Val Morgan", station: "", buyType: "spots",
    placement: "Pre-roll", format: "30s", duration: "30", buyingDemo: "P25-54", market: "National",
    fixedCostMedia: false, clientPaysForMedia: false, budgetIncludesFees: false, noadserving: false,
    lineItemId: "abc", line_item_id: "abc", line_item: 1, lineItem: 1,
    bursts: [{ budget: "5000", buyAmount: "500", startDate: START, endDate: END, calculatedValue: 10 }],
  }]
  const expert = mapStandardCinemaLineItemsToExpertRows(std, cols, START, END)
  assert.equal(expert.length, 1)
  assert.equal(expert[0]!.sourceLineItemId, "abc")
  assert.equal(sumWeekly(expert[0]!.weeklyValues), 10)   // 10 spots distributed across weeks
  assert.equal(Number(expert[0]!.unitRate), 500)

  const back = mapCinemaExpertRowsToStandardLineItems(expert, cols, START, END, { feePctCinema: 0 })
  assert.equal(back[0]!.line_item_id, "abc")             // identity preserved
  assert.equal(sumCalc(back[0]!), 10)                    // deliverables preserved
  assert.equal(parseMoneyInput(back[0]!.bursts[0]!.buyAmount), 500)
  // Cinema must NOT emit Radio-only fields:
  assert.equal((back[0] as any).platform, undefined)
  assert.equal((back[0] as any).creative, undefined)
})

test("bonus / package_inclusions force buyAmount 0", () => {
  for (const buyType of ["bonus", "package_inclusions"]) {
    const std: StandardCinemaFormLineItem[] = [{
      network: "Val Morgan", station: "", buyType,
      placement: "", format: "", duration: "", buyingDemo: "", market: "",
      fixedCostMedia: false, clientPaysForMedia: false, budgetIncludesFees: false, noadserving: false,
      lineItemId: "x", line_item_id: "x", line_item: 1, lineItem: 1,
      bursts: [{ budget: "0", buyAmount: "0", startDate: START, endDate: END, calculatedValue: 4 }],
    }]
    const expert = mapStandardCinemaLineItemsToExpertRows(std, cols, START, END)
    const back = mapCinemaExpertRowsToStandardLineItems(expert, cols, START, END, { feePctCinema: 0 })
    assert.equal(String(back[0]!.bursts[0]!.buyAmount), "0", `${buyType} buyAmount`)
  }
})
