/**
 * Card lump-sum budget must survive expert-grid open + Apply to plan.
 * Regression for Radio/OOH (and families) where rate×qty grids show Net media $0
 * for card-entered totals with no weekly allocation, then Apply zeros the card.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { expertRowNetMedia } from "@/lib/mediaplan/expertRowCost"
import {
  mapStandardRadioLineItemsToExpertRows,
  mapRadioExpertRowsToStandardLineItems,
  mapStandardOohLineItemsToExpertRows,
  mapOohExpertRowsToStandardLineItems,
  mapStandardSearchLineItemsToExpertRows,
  mapSearchExpertRowsToStandardLineItems,
  mapStandardProductionLineItemsToExpertRows,
  mapProductionExpertRowsToStandardLineItems,
  mapStandardProgDisplayLineItemsToExpertRows,
  mapProgDisplayExpertRowsToStandardLineItems,
  type StandardRadioFormLineItem,
  type StandardOohFormLineItem,
  type StandardSearchFormLineItem,
  type StandardProductionFormLineItem,
  type StandardProgDisplayFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  mergeRadioStandardFromExpertWithPrevious,
  mergeOohStandardFromExpertWithPrevious,
  mergeSearchStandardFromExpertWithPrevious,
  mergeProductionStandardFromExpertWithPrevious,
  mergeProgDisplayStandardFromExpertWithPrevious,
  preservePreviousBurstsIfApplyWouldZeroBudget,
} from "@/lib/mediaplan/expertModeSwitch"

const CS = new Date(2026, 0, 4)
const CE = new Date(2026, 0, 31)
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const weekKeys = cols.map((c) => c.weekKey)
const LUMP = "$10,000.00"
const LUMP_NUM = 10_000

function assertBudgetUnchanged(
  label: string,
  before: string | number | undefined,
  after: string | number | undefined
) {
  const b = parseBurstMoney(before)
  const a = parseBurstMoney(after)
  assert.equal(
    a,
    b,
    `${label}: card budget drifted ${before} → ${after} (${b} → ${a})`
  )
  assert.ok(a > 0, `${label}: card budget must stay non-zero`)
}

function sumLineBudgets(bursts: ReadonlyArray<{ budget?: unknown }> | undefined) {
  if (!bursts?.length) return 0
  return bursts.reduce((s, b) => s + parseBurstMoney(b.budget), 0)
}

test("helper: Apply from empty/unallocated grid cannot zero a non-zero card budget", () => {
  const prev = [{ budget: LUMP, buyAmount: "", calculatedValue: 0 }]
  const generated = [{ budget: "", buyAmount: "", calculatedValue: 0 }]
  const kept = preservePreviousBurstsIfApplyWouldZeroBudget(generated, prev)
  assert.equal(parseBurstMoney(kept[0]!.budget), LUMP_NUM)

  const generatedZero = [{ budget: "0", buyAmount: "0", calculatedValue: 0 }]
  const kept2 = preservePreviousBurstsIfApplyWouldZeroBudget(generatedZero, prev)
  assert.equal(parseBurstMoney(kept2[0]!.budget), LUMP_NUM)

  const allocated = [{ budget: "5000", buyAmount: "50", calculatedValue: 100 }]
  const passthrough = preservePreviousBurstsIfApplyWouldZeroBudget(allocated, prev)
  assert.equal(parseBurstMoney(passthrough[0]!.budget), 5000)
})

test("Radio spots lump-sum: open expert shows Net media = card total; Apply preserves budget", () => {
  const prev: StandardRadioFormLineItem[] = [
    {
      network: "Triple M",
      station: "",
      buyType: "spots",
      placement: "",
      format: "",
      duration: "",
      buyingDemo: "",
      market: "Sydney",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noadserving: false,
      lineItemId: "R1",
      line_item_id: "R1",
      line_item: 1,
      lineItem: 1,
      bursts: [
        {
          budget: LUMP,
          buyAmount: "",
          startDate: CS,
          endDate: CE,
          calculatedValue: 0,
        },
      ],
    },
  ]

  const rows = mapStandardRadioLineItemsToExpertRows(prev, cols, CS, CE, {
    feePct: 0,
  })
  assert.equal(
    expertRowNetMedia(rows[0]!, weekKeys, 0),
    LUMP_NUM,
    "Net media must reflect card lump-sum on open"
  )

  const standard = mapRadioExpertRowsToStandardLineItems(rows, cols, CS, CE, {
    feePctRadio: 0,
  })
  const merged = mergeRadioStandardFromExpertWithPrevious(standard, prev)
  assertBudgetUnchanged(
    "Radio spots",
    prev[0]!.bursts[0]!.budget,
    merged[0]!.bursts[0]!.budget
  )
})

test("Radio fixed_cost lump-sum: open + Apply preserves $10,000", () => {
  const prev: StandardRadioFormLineItem[] = [
    {
      network: "Triple M",
      station: "",
      buyType: "fixed_cost",
      placement: "",
      format: "",
      duration: "",
      buyingDemo: "",
      market: "Sydney",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noadserving: false,
      lineItemId: "R2",
      line_item_id: "R2",
      line_item: 1,
      lineItem: 1,
      bursts: [
        {
          budget: LUMP,
          buyAmount: "",
          startDate: CS,
          endDate: CE,
          calculatedValue: 0,
        },
      ],
    },
  ]
  const rows = mapStandardRadioLineItemsToExpertRows(prev, cols, CS, CE, {
    feePct: 0,
  })
  assert.equal(expertRowNetMedia(rows[0]!, weekKeys, 0), LUMP_NUM)
  const standard = mapRadioExpertRowsToStandardLineItems(rows, cols, CS, CE, {
    feePctRadio: 0,
  })
  const merged = mergeRadioStandardFromExpertWithPrevious(standard, prev)
  assertBudgetUnchanged(
    "Radio fixed_cost",
    prev[0]!.bursts[0]!.budget,
    merged[0]!.bursts[0]!.budget
  )
})

test("OOH panels lump-sum: open + Apply preserves $10,000", () => {
  const prev: StandardOohFormLineItem[] = [
    {
      network: "JCDecaux",
      format: "",
      buyType: "panels",
      type: "",
      placement: "",
      size: "",
      buyingDemo: "",
      market: "Sydney",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noAdserving: false,
      lineItemId: "O1",
      line_item_id: "O1",
      line_item: 1,
      lineItem: 1,
      bursts: [
        {
          budget: LUMP,
          buyAmount: "",
          startDate: CS,
          endDate: CE,
          calculatedValue: 0,
        },
      ],
    },
  ]
  const rows = mapStandardOohLineItemsToExpertRows(prev, cols, CS, CE)
  assert.equal(expertRowNetMedia(rows[0]!, weekKeys, 0), LUMP_NUM)
  const standard = mapOohExpertRowsToStandardLineItems(rows, cols, CS, CE, {
    feePctOoh: 0,
  })
  const merged = mergeOohStandardFromExpertWithPrevious(standard, prev)
  assertBudgetUnchanged(
    "OOH panels",
    prev[0]!.bursts[0]!.budget,
    merged[0]!.bursts[0]!.budget
  )
})

test("Family-1 bare-consolidated (Prog Display) lump-sum survives open + Apply", () => {
  const prev: StandardProgDisplayFormLineItem[] = [
    {
      platform: "DV360",
      buyType: "cpm",
      bidStrategy: "",
      placement: "",
      creativeTargeting: "",
      creative: "",
      buyingDemo: "",
      market: "AU",
      site: "",
      size: "",
      targetingAttribute: "",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noadserving: false,
      lineItemId: "PD1",
      line_item_id: "PD1",
      line_item: 1,
      lineItem: 1,
      bursts: [
        {
          budget: LUMP,
          buyAmount: "",
          startDate: CS,
          endDate: CE,
          calculatedValue: 0,
        },
      ],
    },
  ]
  const rows = mapStandardProgDisplayLineItemsToExpertRows(prev, cols, CS, CE)
  assert.equal(expertRowNetMedia(rows[0]!, weekKeys, 0), LUMP_NUM)
  const standard = mapProgDisplayExpertRowsToStandardLineItems(
    rows,
    cols,
    CS,
    CE,
    { feePctProgDisplay: 0 }
  )
  const merged = mergeProgDisplayStandardFromExpertWithPrevious(standard, prev)
  assertBudgetUnchanged(
    "Prog Display",
    prev[0]!.bursts[0]!.budget,
    merged[0]!.bursts[0]!.budget
  )
})

test("Production lump-sum survives open + Apply", () => {
  const prev: StandardProductionFormLineItem[] = [
    {
      mediaType: "Video",
      publisher: "Studio",
      description: "Edit",
      market: "Sydney",
      lineItemId: "P1",
      line_item_id: "P1",
      line_item: 1,
      lineItem: 1,
      bursts: [
        {
          cost: 0,
          amount: 0,
          budget: LUMP,
          startDate: CS,
          endDate: CE,
        },
      ],
    } as StandardProductionFormLineItem,
  ]
  const rows = mapStandardProductionLineItemsToExpertRows(prev as any, cols, CS, CE)
  assert.equal(expertRowNetMedia(rows[0]!, weekKeys, 0), LUMP_NUM)
  const standard = mapProductionExpertRowsToStandardLineItems(rows, cols, CS, CE)
  const merged = mergeProductionStandardFromExpertWithPrevious(
    standard as any,
    prev as any
  )
  const before = sumLineBudgets(prev[0]!.bursts as any)
  const after = sumLineBudgets(merged[0]!.bursts as any)
  assert.equal(after, before, `Production budget ${before} → ${after}`)
  assert.ok(after > 0)
})

test("Search (biddable) with rate+qty still round-trips normally", () => {
  const prev: StandardSearchFormLineItem[] = [
    {
      platform: "Google",
      buyType: "cpc",
      bidStrategy: "",
      placement: "",
      creativeTargeting: "",
      creative: "",
      buyingDemo: "",
      market: "AU",
      site: "",
      size: "",
      targetingAttribute: "",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noadserving: false,
      lineItemId: "S1",
      line_item_id: "S1",
      line_item: 1,
      lineItem: 1,
      bursts: [
        {
          budget: "5000",
          buyAmount: "2.50",
          startDate: new Date(2026, 0, 11),
          endDate: new Date(2026, 0, 17),
          calculatedValue: 2000,
        },
      ],
    } as StandardSearchFormLineItem,
  ]
  const rows = mapStandardSearchLineItemsToExpertRows(prev as any, cols, CS, CE)
  const net = expertRowNetMedia(rows[0]!, weekKeys, 0)
  assert.ok(Math.abs(net - 5000) < 0.02, `Search net expected ~5000 got ${net}`)
  const standard = mapSearchExpertRowsToStandardLineItems(rows, cols, CS, CE)
  const merged = mergeSearchStandardFromExpertWithPrevious(
    standard as any,
    prev as any
  )
  assertBudgetUnchanged(
    "Search cpc",
    prev[0]!.bursts[0]!.budget,
    merged[0]!.bursts[0]!.budget
  )
})

test("Apply guard: empty expert export cannot reduce non-zero card budget to 0", () => {
  const prev: StandardRadioFormLineItem[] = [
    {
      network: "N",
      station: "",
      buyType: "spots",
      placement: "",
      format: "",
      duration: "",
      buyingDemo: "",
      market: "",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noadserving: false,
      lineItemId: "R9",
      line_item_id: "R9",
      line_item: 1,
      lineItem: 1,
      bursts: [
        {
          budget: LUMP,
          buyAmount: "",
          startDate: CS,
          endDate: CE,
          calculatedValue: 0,
        },
      ],
    },
  ]
  // Force empty grid by mapping then clearing schedule (simulates historical bug path
  // if projection were skipped). Apply must still refuse to zero.
  const rows = mapStandardRadioLineItemsToExpertRows(prev, cols, CS, CE, {
    feePct: 0,
  })
  for (const k of weekKeys) rows[0]!.weeklyValues[k] = ""
  rows[0]!.mergedWeekSpans = undefined
  rows[0]!.dailyValues = undefined
  rows[0]!.unitRate = 0
  const wiped = mapRadioExpertRowsToStandardLineItems(rows, cols, CS, CE, {
    feePctRadio: 0,
  })
  assert.equal(sumLineBudgets(wiped[0]!.bursts), 0)
  const merged = mergeRadioStandardFromExpertWithPrevious(wiped, prev)
  assertBudgetUnchanged(
    "Apply guard Radio",
    prev[0]!.bursts[0]!.budget,
    merged[0]!.bursts[0]!.budget
  )
})
