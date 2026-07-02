import { test } from "node:test"
import assert from "node:assert/strict"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  mapStandardProductionLineItemsToExpertRows,
  mapProductionExpertRowsToStandardLineItems,
  type StandardProductionFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import { weekDayKeys, weekHasDailyValues } from "@/lib/mediaplan/expertDayModel"

const CS = new Date(2026, 0, 4)   // Sun 4 Jan 2026
const CE = new Date(2026, 0, 31)  // 4 full weeks
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)

function line(bursts: StandardProductionFormLineItem["bursts"]): StandardProductionFormLineItem {
  return {
    mediaType: "Print",
    publisher: "Studio A",
    description: "Shoot",
    market: "NSW",
    lineItemId: "a",
    line_item_id: "a",
    line_item: 1,
    lineItem: 1,
    bursts,
  }
}

test("sub-week interior burst imports as day-detail and round-trips", () => {
  // Wed 7 – Fri 9 Jan (inside week 1), qty 6 @ cost 100
  const std = [
    line([
      {
        cost: 100,
        amount: 6,
        startDate: new Date(2026, 0, 7),
        endDate: new Date(2026, 0, 9),
        calculatedValue: 6,
      },
    ]),
  ]
  const rows = mapStandardProductionLineItemsToExpertRows(std, cols, CS, CE)
  const wk0 = cols[0]! // Sun 4 – Sat 10 Jan; Wed 7 – Fri 9 lives here
  assert.equal(weekHasDailyValues(rows[0]!.dailyValues ?? {}, weekDayKeys(wk0, CS, CE)), true)
  const back = mapProductionExpertRowsToStandardLineItems(rows, cols, CS, CE)
  const b = back[0]!.bursts
  const total = b.reduce((s, x) => s + Number(x.calculatedValue ?? 0), 0)
  assert.equal(total, 6)
  assert.equal(b.some((x) => Number(new Date(x.startDate).getDate()) === 7), true)
  assert.equal(b.some((x) => Number(new Date(x.endDate).getDate()) === 9), true)
})

test("full-week burst stays weekly (no dailyValues)", () => {
  // Full interior week Sun 11 – Sat 17, qty 10 @ cost 100
  const std = [
    line([
      {
        cost: 100,
        amount: 10,
        startDate: new Date(2026, 0, 11),
        endDate: new Date(2026, 0, 17),
        calculatedValue: 10,
      },
    ]),
  ]
  const rows = mapStandardProductionLineItemsToExpertRows(std, cols, CS, CE)
  assert.equal(rows[0]!.dailyValues === undefined || Object.keys(rows[0]!.dailyValues).length === 0, true)
})
