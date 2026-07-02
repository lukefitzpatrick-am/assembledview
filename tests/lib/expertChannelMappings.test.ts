import assert from "node:assert/strict"
import test from "node:test"
import { buildWeeklyGanttColumnsFromCampaign } from "../../lib/utils/weeklyGanttColumns.js"
import { roundDeliverables, deliverablesFromBudget, netMediaFromDeliverables } from "../../lib/mediaplan/deliverableBudget.js"
import {
  deriveOohExpertRowScheduleYmd,
  mapOohExpertRowsToStandardLineItems,
  mapProgOohExpertRowsToStandardLineItems,
  mapRadioExpertRowsToStandardLineItems,
  mapStandardOohLineItemsToExpertRows,
  mapStandardRadioLineItemsToExpertRows,
} from "../../lib/mediaplan/expertChannelMappings.js"

test("OOH expert row produces one line item and one burst per filled week; budget = qty * unitRate", () => {
  const campaignStart = new Date(2024, 9, 23)
  const campaignEnd = new Date(2024, 9, 29)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  assert.equal(cols.length, 2)
  const w0 = cols[0]!.weekKey
  const w1 = cols[1]!.weekKey

  const [line] = mapOohExpertRowsToStandardLineItems(
    [
      {
        id: "MBA-OH-1",
        market: "SYD",
        network: "Net",
        format: "Billboard",
        type: "Static",
        placement: "CBD",
        startDate: "2024-10-23",
        endDate: "2024-10-29",
        size: "6x3",
        panels: "",
        buyingDemo: "P25-54",
        buyType: "panels",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        unitRate: 100,
        grossCost: 0,
        weeklyValues: { [w0]: 2, [w1]: "" },
        mergedWeekSpans: [],
      },
    ],
    cols,
    campaignStart,
    campaignEnd
  )

  assert.equal(line.line_item_id, "MBA-OH-1")
  assert.equal(line.bursts.length, 1)
  assert.equal(line.bursts[0]!.budget, "200")
  assert.equal(line.bursts[0]!.buyAmount, "100")
  assert.equal(line.bursts[0]!.calculatedValue, 2)
})

test("OOH CPM uses net budget for deliverables when budgetIncludesFees + feePctOoh", () => {
  const campaignStart = new Date(2025, 0, 5)
  const campaignEnd = new Date(2025, 0, 11)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const w0 = cols[0]!.weekKey

  const [line] = mapOohExpertRowsToStandardLineItems(
    [
      {
        id: "x",
        market: "",
        network: "",
        format: "",
        type: "",
        placement: "",
        startDate: "",
        endDate: "",
        size: "",
        panels: "",
        buyingDemo: "",
        buyType: "cpm",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: true,
        unitRate: 1,
        grossCost: 0,
        weeklyValues: { [w0]: 10 },
        mergedWeekSpans: [],
      },
    ],
    cols,
    campaignStart,
    campaignEnd,
    { budgetIncludesFees: true, feePctOoh: 10 }
  )

  const qty = 10
  const unitRate = 1
  const gross = (qty / 1000) * unitRate
  // Linear fee-on-gross (same as netFromGross / OOHContainer); not gross/(1+fee/100).
  const net = gross * (1 - 10 / 100)
  assert.equal(line.bursts[0]!.budget, String(gross))
  assert.equal(
    line.bursts[0]!.calculatedValue,
    roundDeliverables("cpm", deliverablesFromBudget("cpm", net, unitRate))
  )
})

test("production buy type uses linear qty × rate (same branch as spots)", () => {
  assert.equal(netMediaFromDeliverables("production", 10, 500), 5000)
  assert.equal(deliverablesFromBudget("production", 5000, 500), 10)
  assert.equal(roundDeliverables("production", 10.4), 10)
})

test("OOH expert CPM gross budget uses (qty/1000) × rate", () => {
  const campaignStart = new Date(2025, 0, 5)
  const campaignEnd = new Date(2025, 0, 11)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const w0 = cols[0]!.weekKey
  const qty = 500_000
  const unitRate = 10

  const [line] = mapOohExpertRowsToStandardLineItems(
    [
      {
        id: "cpm-gross",
        market: "",
        network: "",
        format: "",
        type: "",
        placement: "",
        startDate: "",
        endDate: "",
        size: "",
        panels: "",
        buyingDemo: "",
        buyType: "cpm",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        unitRate,
        grossCost: 0,
        weeklyValues: { [w0]: qty },
        mergedWeekSpans: [],
      },
    ],
    cols,
    campaignStart,
    campaignEnd
  )

  assert.equal(line.bursts[0]!.budget, "5000")
})

test("OOH CPM calculatedValue round-trips standard → expert → standard", () => {
  const campaignStart = new Date(2025, 0, 5)
  const campaignEnd = new Date(2025, 0, 11)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const w0 = cols[0]!.weekKey
  const qty = 500_000
  const unitRate = 10

  const standard = mapOohExpertRowsToStandardLineItems(
    [
      {
        id: "cpm-rt",
        market: "",
        network: "",
        format: "",
        type: "",
        placement: "",
        startDate: "",
        endDate: "",
        size: "",
        panels: "",
        buyingDemo: "",
        buyType: "cpm",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        unitRate,
        grossCost: 0,
        weeklyValues: { [w0]: qty },
        mergedWeekSpans: [],
      },
    ],
    cols,
    campaignStart,
    campaignEnd
  )

  assert.equal(standard[0]!.bursts[0]!.calculatedValue, qty)

  const expert = mapStandardOohLineItemsToExpertRows(
    standard,
    cols,
    campaignStart,
    campaignEnd
  )
  assert.equal(expert[0]!.weeklyValues[w0], qty)

  const roundTrip = mapOohExpertRowsToStandardLineItems(
    expert,
    cols,
    campaignStart,
    campaignEnd
  )
  assert.equal(roundTrip[0]!.bursts[0]!.calculatedValue, qty)
})

test("OOH and ProgOOH expert CPM gross budget match for same qty and rate", () => {
  const campaignStart = new Date(2025, 0, 5)
  const campaignEnd = new Date(2025, 0, 11)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const w0 = cols[0]!.weekKey
  const qty = 500_000
  const unitRate = 10

  const [oohLine] = mapOohExpertRowsToStandardLineItems(
    [
      {
        id: "ooh-parity",
        market: "",
        network: "",
        format: "",
        type: "",
        placement: "",
        startDate: "",
        endDate: "",
        size: "",
        panels: "",
        buyingDemo: "",
        buyType: "cpm",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        unitRate,
        grossCost: 0,
        weeklyValues: { [w0]: qty },
        mergedWeekSpans: [],
      },
    ],
    cols,
    campaignStart,
    campaignEnd
  )

  const [progOohLine] = mapProgOohExpertRowsToStandardLineItems(
    [
      {
        id: "prog-parity",
        startDate: "",
        endDate: "",
        platform: "",
        bidStrategy: "",
        buyType: "cpm",
        creativeTargeting: "",
        creative: "",
        placement: "",
        size: "",
        buyingDemo: "",
        market: "",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        noadserving: false,
        unitRate,
        grossCost: 0,
        weeklyValues: { [w0]: qty },
        mergedWeekSpans: [],
      },
    ],
    cols,
    campaignStart,
    campaignEnd
  )

  assert.equal(oohLine.bursts[0]!.budget, progOohLine.bursts[0]!.budget)
  assert.equal(oohLine.bursts[0]!.budget, "5000")
})

test("OOH merged week span maps to a single burst from first week through last week", () => {
  const campaignStart = new Date(2024, 9, 23)
  const campaignEnd = new Date(2024, 9, 29)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const w0 = cols[0]!.weekKey
  const w1 = cols[1]!.weekKey

  const [line] = mapOohExpertRowsToStandardLineItems(
    [
      {
        id: "merge-1",
        market: "",
        network: "",
        format: "",
        type: "",
        placement: "",
        startDate: "",
        endDate: "",
        size: "",
        panels: "",
        buyingDemo: "",
        buyType: "panels",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        unitRate: 50,
        grossCost: 0,
        weeklyValues: { [w0]: "", [w1]: "" },
        mergedWeekSpans: [
          { id: "s1", startWeekKey: w0, endWeekKey: w1, totalQty: 5 },
        ],
      },
    ],
    cols,
    campaignStart,
    campaignEnd
  )

  assert.equal(line.bursts.length, 1)
  assert.equal(line.bursts[0]!.buyAmount, "50")
  assert.equal(line.bursts[0]!.budget, "250")
  assert.equal(line.bursts[0]!.calculatedValue, 5)
})

test("Standard OOH burst spanning two week columns splits deliverables across week columns", () => {
  const campaignStart = new Date(2024, 9, 23)
  const campaignEnd = new Date(2024, 9, 29)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const w0 = cols[0]!.weekKey
  const w1 = cols[1]!.weekKey

  const [row] = mapStandardOohLineItemsToExpertRows(
    [
      {
        line_item_id: "L-mw",
        buy_type: "panels",
        bursts: [
          {
            budget: "250",
            buyAmount: "50",
            startDate: new Date(2024, 9, 23),
            endDate: new Date(2024, 9, 29),
            calculatedValue: 5,
          },
        ],
      },
    ],
    cols,
    campaignStart,
    campaignEnd
  )

  assert.equal(row.mergedWeekSpans, undefined)
  // Integer split with remainder to earliest weeks (5 deliverables / 2 weeks → 3 + 2).
  assert.equal(row.weeklyValues[w0], 3)
  assert.equal(row.weeklyValues[w1], 2)
})

test("Radio spots round-trip preserves id and weekly cell qty", () => {
  const campaignStart = new Date(2024, 9, 23)
  const campaignEnd = new Date(2024, 9, 29)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const w0 = cols[0]!.weekKey

  const standard = mapRadioExpertRowsToStandardLineItems(
    [
      {
        id: "RAD-42",
        startDate: "2024-10-23",
        endDate: "2024-10-29",
        network: "N",
        station: "S",
        market: "MEL",
        placement: "AM",
        duration: "30s",
        format: "Spot",
        buyingDemo: "All",
        buyType: "spots",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        unitRate: 50,
        grossCost: 0,
        weeklyValues: { [w0]: 4 },
        mergedWeekSpans: [],
      },
    ],
    cols,
    campaignStart,
    campaignEnd
  )

  const back = mapStandardRadioLineItemsToExpertRows(standard, cols, campaignStart, campaignEnd)
  assert.notEqual(back[0]!.id, "RAD-42")
  assert.equal(back[0]!.sourceLineItemId, "RAD-42")
  assert.equal(back[0]!.weeklyValues[w0], 4)
  assert.equal(back[0]!.unitRate, 50)
})

test("Standard OOH → expert maps panels deliverables to day-detail for sub-week burst", () => {
  const campaignStart = new Date(2024, 9, 23)
  const campaignEnd = new Date(2024, 9, 29)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const w0 = cols[0]!.weekKey

  const [row] = mapStandardOohLineItemsToExpertRows(
    [
      {
        line_item_id: "L1",
        network: "A",
        format: "F",
        buy_type: "panels",
        type: "T",
        placement: "P",
        size: "S",
        buying_demo: "D",
        market: "M",
        bursts: [
          {
            budget: "300",
            buyAmount: "3",
            startDate: new Date(2024, 9, 24),
            endDate: new Date(2024, 9, 26),
            calculatedValue: 100,
          },
        ],
      },
    ],
    cols,
    campaignStart,
    campaignEnd
  )

  assert.notEqual(row.id, "L1")
  assert.equal(row.sourceLineItemId, "L1")
  assert.equal(row.weeklyValues[w0], "")
  assert.equal(row.unitRate, 3)
  assert.ok(row.dailyValues)
  const dailyTotal = Object.values(row.dailyValues!).reduce<number>(
    (sum, v) => sum + (v === "" || v === undefined ? 0 : Number(v)),
    0
  )
  assert.equal(dailyTotal, 3)
  assert.equal(row.grossCost, 300)
})

test("deriveOohExpertRowScheduleYmd uses campaign bounds when no active weeks", () => {
  const campaignStart = new Date(2025, 2, 1)
  const campaignEnd = new Date(2025, 2, 28)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const weekly: Record<string, number | ""> = {}
  for (const c of cols) weekly[c.weekKey] = ""
  const { startDate, endDate } = deriveOohExpertRowScheduleYmd(
    weekly,
    cols,
    campaignStart,
    campaignEnd
  )
  assert.equal(startDate, "2025-03-01")
  assert.equal(endDate, "2025-03-28")
})

test("deriveOohExpertRowScheduleYmd spans first and last week with non-zero qty", () => {
  const campaignStart = new Date(2025, 2, 1)
  const campaignEnd = new Date(2025, 2, 28)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  assert.ok(cols.length >= 3)
  const weekly: Record<string, number | ""> = {}
  for (const c of cols) weekly[c.weekKey] = ""
  weekly[cols[0]!.weekKey] = 1
  weekly[cols[2]!.weekKey] = 2
  const { startDate, endDate } = deriveOohExpertRowScheduleYmd(
    weekly,
    cols,
    campaignStart,
    campaignEnd
  )
  assert.match(startDate, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(endDate, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(startDate <= endDate)
  assert.notEqual(startDate, endDate)
})
