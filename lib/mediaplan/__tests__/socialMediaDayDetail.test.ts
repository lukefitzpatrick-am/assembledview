import { test } from "node:test"
import assert from "node:assert/strict"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  mapStandardSocialMediaLineItemsToExpertRows,
  mapSocialMediaExpertRowsToStandardLineItems,
  type StandardSocialMediaFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import { weekDayKeys, weekHasDailyValues } from "@/lib/mediaplan/expertDayModel"

const CS = new Date(2026, 0, 4)
const CE = new Date(2026, 0, 31)
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)

function line(bursts: any[]): StandardSocialMediaFormLineItem {
  return {
    platform: "P", bidStrategy: "", buyType: "bonus", creativeTargeting: "", creative: "", buyingDemo: "", market: "",
    fixedCostMedia: false, clientPaysForMedia: false, budgetIncludesFees: false, noadserving: false,
    lineItemId: "a", line_item_id: "a", line_item: 1, lineItem: 1, bursts,
  }
}

test("sub-week interior burst imports as day-detail and round-trips", () => {
  const std = [line([{ budget: "0", buyAmount: "0", startDate: new Date(2026,0,7), endDate: new Date(2026,0,9), calculatedValue: 6 }])]
  const rows = mapStandardSocialMediaLineItemsToExpertRows(std, cols, CS, CE)
  const wk0 = cols[0]!
  assert.equal(weekHasDailyValues(rows[0]!.dailyValues ?? {}, weekDayKeys(wk0, CS, CE)), true)
  const back = mapSocialMediaExpertRowsToStandardLineItems(rows, cols, CS, CE, { feePctSocial: 0 })
  const b = back[0]!.bursts
  const total = b.reduce((s, x) => s + Number(x.calculatedValue ?? 0), 0)
  assert.equal(total, 6)
  assert.equal(b.some((x) => Number(new Date(x.startDate).getDate()) === 7), true)
  assert.equal(b.some((x) => Number(new Date(x.endDate).getDate()) === 9), true)
})

test("full-week burst stays weekly (no dailyValues)", () => {
  const std = [line([{ budget: "0", buyAmount: "0", startDate: new Date(2026,0,11), endDate: new Date(2026,0,17), calculatedValue: 10 }])]
  const rows = mapStandardSocialMediaLineItemsToExpertRows(std, cols, CS, CE)
  assert.equal(rows[0]!.dailyValues === undefined || Object.keys(rows[0]!.dailyValues).length === 0, true)
})
