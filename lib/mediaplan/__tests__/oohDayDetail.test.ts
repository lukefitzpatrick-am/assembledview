import { test } from "node:test"
import assert from "node:assert/strict"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  mapStandardOohLineItemsToExpertRows,
  mapOohExpertRowsToStandardLineItems,
  type StandardOohFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import { weekDayKeys, weekHasDailyValues } from "@/lib/mediaplan/expertDayModel"

const CS = new Date(2026, 0, 4)   // Sun 4 Jan 2026
const CE = new Date(2026, 0, 31)  // 4 full weeks
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)

function line(bursts: any[]): StandardOohFormLineItem {
  return {
    network: "N", format: "", buyType: "cpm", type: "", placement: "", size: "",
    buyingDemo: "", market: "", fixedCostMedia: false, clientPaysForMedia: false,
    budgetIncludesFees: false, noAdserving: false,
    lineItemId: "a", line_item_id: "a", line_item: 1, lineItem: 1, bursts,
  }
}

test("sub-week interior burst imports as day-detail and round-trips", () => {
  const std = [line([{ budget: "600", buyAmount: "100", startDate: new Date(2026,0,7), endDate: new Date(2026,0,9), calculatedValue: 6 }])]
  const rows = mapStandardOohLineItemsToExpertRows(std, cols, CS, CE)
  const wk0 = cols[0]!
  assert.equal(weekHasDailyValues(rows[0]!.dailyValues ?? {}, weekDayKeys(wk0, CS, CE)), true)
  const back = mapOohExpertRowsToStandardLineItems(rows, cols, CS, CE, { feePctOoh: 0 })
  const b = back[0]!.bursts
  const total = b.reduce((s, x) => s + Number(x.calculatedValue ?? 0), 0)
  assert.equal(total, 6)
  assert.equal(b.some((x) => Number(new Date(x.startDate).getDate()) === 7), true)
  assert.equal(b.some((x) => Number(new Date(x.endDate).getDate()) === 9), true)
})

test("full-week burst stays weekly (no dailyValues)", () => {
  const std = [line([{ budget: "1000", buyAmount: "100", startDate: new Date(2026,0,11), endDate: new Date(2026,0,17), calculatedValue: 10 }])]
  const rows = mapStandardOohLineItemsToExpertRows(std, cols, CS, CE)
  assert.equal(rows[0]!.dailyValues === undefined || Object.keys(rows[0]!.dailyValues).length === 0, true)
})

test("month-crossing Mon–Sun paid week keeps both halves (not 28 Sep→28 Sep)", () => {
  const start = new Date(2026, 6, 1)
  const end = new Date(2027, 5, 30)
  const weeks = buildWeeklyGanttColumnsFromCampaign(start, end, 0)
  const std: StandardOohFormLineItem[] = [
    {
      ...line([
        {
          budget: "970.64",
          buyAmount: "970.64",
          startDate: new Date(2026, 8, 28),
          endDate: new Date(2026, 9, 4),
          calculatedValue: 1,
        },
      ]),
      buyType: "fixed_cost",
    },
  ]
  const rows = mapStandardOohLineItemsToExpertRows(std, weeks, start, end)
  const back = mapOohExpertRowsToStandardLineItems(rows, weeks, start, end, {
    feePctOoh: 0,
  })
  const b = back[0]!.bursts[0]!
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  assert.equal(ymd(new Date(b.startDate)), "2026-09-28")
  assert.equal(ymd(new Date(b.endDate)), "2026-10-04")
})
