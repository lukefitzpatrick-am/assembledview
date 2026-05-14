import assert from "node:assert/strict"
import test from "node:test"
import type { PlannedLineItem } from "@/lib/pacing/plan/normalisePlan"
import type { DailyRow } from "@/lib/snowflake/portfolio-pacing-service"
import { buildLineItemPacingRows, rollupDailyByLineItem } from "../buildLineItemPacingRows.js"

const clientMap = new Map([["acme", 10]])

function basePlanned(over: Partial<PlannedLineItem> = {}): PlannedLineItem {
  return {
    mbaNumber: "MBA1",
    clientSlug: "acme",
    campaignName: "C1",
    channelGroup: "social",
    lineItemId: "li-1",
    platform: "meta",
    buyType: "cpm",
    totalBudgetNumber: 10_000,
    bursts: [
      { startDate: "2025-06-01", endDate: "2025-06-10", budgetNumber: 10_000 },
    ],
    ...over,
  }
}

test("aggregates multiple dates per line item and picks spendYesterday on max date", () => {
  const daily: DailyRow[] = [
    {
      lineItemId: "li-1",
      date: "2025-06-02",
      amountSpent: 100,
      impressions: 1000,
      clicks: 10,
      results: 1,
      video3sViews: 0,
      conversions: 0,
      revenue: 0,
    },
    {
      lineItemId: "li-1",
      date: "2025-06-05",
      amountSpent: 50,
      impressions: 500,
      clicks: 5,
      results: 0,
      video3sViews: 0,
      conversions: 2,
      revenue: 10,
    },
  ]
  const rows = buildLineItemPacingRows({
    plannedLineItems: [basePlanned()],
    dailyRows: daily,
    clientIdByPlanSlug: clientMap,
    asOfDate: "2025-06-05",
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.spend_amount, 150)
  assert.equal(rows[0]?.pacing_status, "under_pacing")
  assert.equal(rows[0]?.delivery_health, "spending")
})

test("plan with no delivery → zeros and no_delivery when past start", () => {
  const rows = buildLineItemPacingRows({
    plannedLineItems: [basePlanned()],
    dailyRows: [],
    clientIdByPlanSlug: clientMap,
    asOfDate: "2025-06-05",
  })
  assert.equal(rows[0]?.spend_amount, 0)
  assert.equal(rows[0]?.pacing_status, "no_delivery")
})

test("delivery without plan → dropped and onOrphanDelivery fires", () => {
  const orphans: string[] = []
  const daily: DailyRow[] = [
    {
      lineItemId: "orphan",
      date: "2025-06-03",
      amountSpent: 999,
      impressions: 1,
      clicks: 0,
      results: 0,
      video3sViews: 0,
      conversions: 0,
      revenue: 0,
    },
  ]
  const rows = buildLineItemPacingRows({
    plannedLineItems: [basePlanned()],
    dailyRows: daily,
    clientIdByPlanSlug: clientMap,
    asOfDate: "2025-06-05",
    onOrphanDelivery: (id) => orphans.push(id),
  })
  assert.equal(rows.length, 1)
  assert.deepEqual(orphans, ["orphan"])
})

test("multiple line items stay independent", () => {
  const li2 = basePlanned({
    lineItemId: "li-2",
    mbaNumber: "MBA2",
    totalBudgetNumber: 5000,
    bursts: [{ startDate: "2025-06-01", endDate: "2025-06-10", budgetNumber: 5000 }],
  })
  const daily: DailyRow[] = [
    {
      lineItemId: "li-1",
      date: "2025-06-04",
      amountSpent: 200,
      impressions: 0,
      clicks: 0,
      results: 0,
      video3sViews: 0,
      conversions: 0,
      revenue: 0,
    },
    {
      lineItemId: "li-2",
      date: "2025-06-04",
      amountSpent: 10,
      impressions: 0,
      clicks: 0,
      results: 0,
      video3sViews: 0,
      conversions: 0,
      revenue: 0,
    },
  ]
  const rows = buildLineItemPacingRows({
    plannedLineItems: [basePlanned(), li2],
    dailyRows: daily,
    clientIdByPlanSlug: clientMap,
    asOfDate: "2025-06-05",
  })
  assert.equal(rows.length, 2)
  const r1 = rows.find((r) => r.av_line_item_id === "li-1")
  const r2 = rows.find((r) => r.av_line_item_id === "li-2")
  assert.equal(r1?.spend_amount, 200)
  assert.equal(r2?.spend_amount, 10)
})

test("channelGroup maps to API media_type", () => {
  const rows = buildLineItemPacingRows({
    plannedLineItems: [
      basePlanned({ lineItemId: "a", channelGroup: "search" }),
      basePlanned({ lineItemId: "b", channelGroup: "prog_display" }),
      basePlanned({ lineItemId: "c", channelGroup: "prog_video" }),
    ],
    dailyRows: [],
    clientIdByPlanSlug: clientMap,
    asOfDate: "2025-06-01",
  })
  assert.equal(rows.find((r) => r.av_line_item_id === "a")?.media_type, "search")
  assert.equal(rows.find((r) => r.av_line_item_id === "b")?.media_type, "display")
  assert.equal(rows.find((r) => r.av_line_item_id === "c")?.media_type, "bvod")
})

test("rollup: spendYesterday is spend on latest date; same-day rows sum", () => {
  const zeroRest = {
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
    conversions: 0,
    revenue: 0,
  } as const
  const daily: DailyRow[] = [
    { lineItemId: "x", date: "2025-06-01", amountSpent: 100, ...zeroRest },
    { lineItemId: "x", date: "2025-06-03", amountSpent: 40, ...zeroRest },
    { lineItemId: "x", date: "2025-06-03", amountSpent: 10, ...zeroRest },
  ]
  const m = rollupDailyByLineItem(daily)
  assert.equal(m.get("x")?.spendToDate, 150)
  assert.equal(m.get("x")?.spendYesterday, 50)
})
