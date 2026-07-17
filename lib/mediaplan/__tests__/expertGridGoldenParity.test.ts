/**
 * Golden parity fixtures for ExpertGrid consolidation.
 * Pins map*ExpertRowsToStandardLineItems + computeLoadedDeliverables for
 * Search / OOH / ProgVideo to the cent — do not change expected values without
 * intentional behaviour change review.
 *
 * Regenerate via: npx tsx lib/mediaplan/__tests__/_dumpExpertGoldens.ts
 */
import assert from "node:assert/strict"
import test from "node:test"
import { format, startOfDay } from "date-fns"

import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import {
  mapOohExpertRowsToStandardLineItems,
  mapProgVideoExpertRowsToStandardLineItems,
  mapSearchExpertRowsToStandardLineItems,
} from "@/lib/mediaplan/expertChannelMappings"
import type {
  ExpertWeeklyValues,
  OohExpertScheduleRow,
  ProgVideoExpertScheduleRow,
  SearchExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const CS = new Date(2026, 0, 5)
const CE = new Date(2026, 0, 25)
const weekColumns = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const weekKeys = weekColumns.map((c) => c.weekKey)

function emptyWeekly(): ExpertWeeklyValues {
  const o = {} as ExpertWeeklyValues
  for (const k of weekKeys) o[k] = ""
  return o
}

type GoldenBurst = {
  budget: string
  buyAmount: string
  startDate: string
  endDate: string
  calculatedValue?: number
  fee?: number
}

function serializeBurst(b: {
  budget: string
  buyAmount: string
  startDate: Date
  endDate: Date
  calculatedValue?: number
  fee?: number
}): GoldenBurst {
  const out: GoldenBurst = {
    budget: b.budget,
    buyAmount: b.buyAmount,
    startDate: format(startOfDay(b.startDate), "yyyy-MM-dd"),
    endDate: format(startOfDay(b.endDate), "yyyy-MM-dd"),
  }
  if (b.calculatedValue !== undefined) out.calculatedValue = b.calculatedValue
  if (b.fee !== undefined) out.fee = b.fee
  return out
}

function serializeLine<T extends { bursts: Parameters<typeof serializeBurst>[0][] }>(
  line: T
) {
  const { bursts, ...rest } = line
  return { ...rest, bursts: bursts.map(serializeBurst) }
}

const SEARCH_ROWS: SearchExpertScheduleRow[] = [
  {
    id: "S1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "Google",
    bidStrategy: "manual_cpc",
    buyType: "cpc",
    creativeTargeting: "kw",
    creative: "ad1",
    buyingDemo: "A18+",
    market: "AU",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 2.5,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]!]: 100, [weekKeys[1]!]: 50 },
    mergedWeekSpans: [],
  },
  {
    id: "S2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "Bing",
    bidStrategy: "",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 12,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]!]: 10000 },
    mergedWeekSpans: [],
  },
  {
    id: "S3",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "X",
    bidStrategy: "",
    buyType: "bonus",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 0,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]!]: 25 },
    mergedWeekSpans: [],
  },
]

/** Frozen output of mapSearchExpertRowsToStandardLineItems (feePctSearch: 10). */
const SEARCH_GOLDEN = [
  {
    platform: "Google",
    bidStrategy: "manual_cpc",
    buyType: "cpc",
    creativeTargeting: "kw",
    creative: "ad1",
    buyingDemo: "A18+",
    market: "AU",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    noadserving: false,
    lineItemId: "S1",
    line_item_id: "S1",
    line_item: 1,
    lineItem: 1,
    bursts: [
      {
        budget: "250",
        buyAmount: "$2.50",
        startDate: "2026-01-05",
        endDate: "2026-01-10",
        calculatedValue: 90,
      },
      {
        budget: "125",
        buyAmount: "$2.50",
        startDate: "2026-01-11",
        endDate: "2026-01-17",
        calculatedValue: 45,
      },
    ],
  },
  {
    platform: "Bing",
    bidStrategy: "",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    noadserving: false,
    lineItemId: "S2",
    line_item_id: "S2",
    line_item: 2,
    lineItem: 2,
    bursts: [
      {
        budget: "120",
        buyAmount: "$12.00",
        startDate: "2026-01-05",
        endDate: "2026-01-10",
        calculatedValue: 10000,
      },
    ],
  },
  {
    platform: "X",
    bidStrategy: "",
    buyType: "bonus",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    noadserving: false,
    lineItemId: "S3",
    line_item_id: "S3",
    line_item: 3,
    lineItem: 3,
    bursts: [
      {
        budget: "0",
        buyAmount: "0",
        startDate: "2026-01-05",
        endDate: "2026-01-10",
        calculatedValue: 25,
      },
    ],
  },
]

const OOH_ROWS: OohExpertScheduleRow[] = [
  {
    id: "O1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    market: "SYD",
    network: "JCDecaux",
    format: "large_format",
    type: "Static",
    placement: "CBD",
    size: "6x3",
    panels: "",
    buyingDemo: "P25-54",
    buyType: "panels",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 150,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]!]: 4, [weekKeys[1]!]: 2 },
    mergedWeekSpans: [],
  },
  {
    id: "O2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    market: "MEL",
    network: "oOh!",
    format: "street_furniture",
    type: "",
    placement: "",
    size: "",
    panels: "",
    buyingDemo: "",
    buyType: "cpm",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 8,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]!]: 5000 },
    mergedWeekSpans: [],
  },
]

/** Frozen output of mapOohExpertRowsToStandardLineItems (feePctOoh: 10). */
const OOH_GOLDEN = [
  {
    network: "JCDecaux",
    format: "large_format",
    buyType: "panels",
    type: "Static",
    placement: "CBD",
    size: "6x3",
    buyingDemo: "P25-54",
    market: "SYD",
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
        budget: "600",
        buyAmount: "150",
        startDate: "2026-01-05",
        endDate: "2026-01-10",
        calculatedValue: 4,
      },
      {
        budget: "300",
        buyAmount: "150",
        startDate: "2026-01-11",
        endDate: "2026-01-17",
        calculatedValue: 2,
      },
    ],
  },
  {
    network: "oOh!",
    format: "street_furniture",
    buyType: "cpm",
    type: "",
    placement: "",
    size: "",
    buyingDemo: "",
    market: "MEL",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    noAdserving: false,
    lineItemId: "O2",
    line_item_id: "O2",
    line_item: 2,
    lineItem: 2,
    bursts: [
      {
        budget: "40",
        buyAmount: "$8.00",
        startDate: "2026-01-05",
        endDate: "2026-01-10",
        calculatedValue: 4500,
      },
    ],
  },
]

const PROG_VIDEO_ROWS: ProgVideoExpertScheduleRow[] = [
  {
    id: "PV1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "DV360",
    bidStrategy: "completed_views",
    buyType: "cpv",
    creativeTargeting: "ctx",
    creative: "v1",
    placement: "instream",
    size: "15s",
    buyingDemo: "A25-54",
    market: "AU",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    noadserving: false,
    unitRate: 0.045,
    grossCost: 0,
    weeklyValues: {
      ...emptyWeekly(),
      [weekKeys[0]!]: 20000,
      [weekKeys[1]!]: 10000,
    },
    mergedWeekSpans: [],
  },
  {
    id: "PV2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "TTD",
    bidStrategy: "reach",
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
    noadserving: true,
    unitRate: 15,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]!]: 100000 },
    mergedWeekSpans: [],
  },
]

/** Frozen output of mapProgVideoExpertRowsToStandardLineItems (feePctProgVideo: 12). */
const PROG_VIDEO_GOLDEN = [
  {
    platform: "DV360",
    bidStrategy: "completed_views",
    buyType: "cpv",
    creativeTargeting: "ctx",
    creative: "v1",
    placement: "instream",
    size: "15s",
    buyingDemo: "A25-54",
    market: "AU",
    site: "",
    targetingAttribute: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    noadserving: false,
    lineItemId: "PV1",
    line_item_id: "PV1",
    line_item: 1,
    lineItem: 1,
    bursts: [
      {
        budget: "900",
        buyAmount: "$0.045",
        startDate: "2026-01-05",
        endDate: "2026-01-10",
        calculatedValue: 17600,
      },
      {
        budget: "450",
        buyAmount: "$0.045",
        startDate: "2026-01-11",
        endDate: "2026-01-17",
        calculatedValue: 8800,
      },
    ],
  },
  {
    platform: "TTD",
    bidStrategy: "reach",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    placement: "",
    size: "",
    buyingDemo: "",
    market: "",
    site: "",
    targetingAttribute: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    noadserving: true,
    lineItemId: "PV2",
    line_item_id: "PV2",
    line_item: 2,
    lineItem: 2,
    bursts: [
      {
        budget: "1500",
        buyAmount: "$15.00",
        startDate: "2026-01-05",
        endDate: "2026-01-10",
        calculatedValue: 100000,
      },
    ],
  },
]

test("golden: campaign week keys for fixture window", () => {
  assert.deepEqual(weekKeys, ["2026-01-04", "2026-01-11", "2026-01-18", "2026-01-25"])
})

test("golden: mapSearchExpertRowsToStandardLineItems matches frozen Search output", () => {
  const lines = mapSearchExpertRowsToStandardLineItems(
    SEARCH_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctSearch: 10 }
  )
  assert.deepEqual(lines.map(serializeLine), SEARCH_GOLDEN)
})

test("golden: mapOohExpertRowsToStandardLineItems matches frozen OOH output", () => {
  const lines = mapOohExpertRowsToStandardLineItems(OOH_ROWS, weekColumns, CS, CE, {
    feePctOoh: 10,
  })
  assert.deepEqual(lines.map(serializeLine), OOH_GOLDEN)
})

test("golden: mapProgVideoExpertRowsToStandardLineItems matches frozen ProgVideo output", () => {
  const lines = mapProgVideoExpertRowsToStandardLineItems(
    PROG_VIDEO_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctProgVideo: 12 }
  )
  assert.deepEqual(lines.map(serializeLine), PROG_VIDEO_GOLDEN)
})

test("golden: computeLoadedDeliverables matches mapped burst deliverables to the cent", () => {
  const cases: Array<{
    buyType: string
    burst: { budget: string; buyAmount: string; calculatedValue?: number }
    budgetIncludesFees: boolean
    feePct: number
    expected: number
  }> = [
    // Search S1 week0 — CPC with fees
    {
      buyType: "cpc",
      burst: { budget: "250", buyAmount: "2.5" },
      budgetIncludesFees: true,
      feePct: 10,
      expected: 90,
    },
    // Search S2 — CPM no fees
    {
      buyType: "cpm",
      burst: { budget: "120", buyAmount: "12" },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 10000,
    },
    // Search S3 — bonus
    {
      buyType: "bonus",
      burst: { budget: "0", buyAmount: "0", calculatedValue: 25 },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 25,
    },
    // OOH O1 — panels
    {
      buyType: "panels",
      burst: { budget: "600", buyAmount: "150" },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 4,
    },
    // OOH O2 — CPM with fees (mapper budget "$40" / rate $8 → 4500)
    {
      buyType: "cpm",
      burst: { budget: "40", buyAmount: "8" },
      budgetIncludesFees: true,
      feePct: 10,
      expected: 4500,
    },
    // ProgVideo PV1 — CPV with fees
    {
      buyType: "cpv",
      burst: { budget: "900", buyAmount: "0.045" },
      budgetIncludesFees: true,
      feePct: 12,
      expected: 17600,
    },
    // ProgVideo PV2 — CPM no fees
    {
      buyType: "cpm",
      burst: { budget: "1500", buyAmount: "15" },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 100000,
    },
  ]

  for (const c of cases) {
    const result = computeLoadedDeliverables(
      c.buyType,
      c.burst,
      c.budgetIncludesFees,
      c.feePct
    )
    assert.equal(
      result,
      c.expected,
      `${c.buyType} budget=${c.burst.budget} rate=${c.burst.buyAmount} bif=${c.budgetIncludesFees} fee=${c.feePct}`
    )
  }
})

test("golden: Search/OOH/ProgVideo mapped calculatedValue equals computeLoadedDeliverables", () => {
  const search = mapSearchExpertRowsToStandardLineItems(
    SEARCH_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctSearch: 10 }
  )
  for (const line of search) {
    for (const burst of line.bursts) {
      const loaded = computeLoadedDeliverables(
        line.buyType,
        {
          budget: burst.budget,
          buyAmount: String(burst.buyAmount).replace(/[^0-9.-]/g, ""),
          calculatedValue: burst.calculatedValue,
        },
        Boolean(line.budgetIncludesFees),
        10
      )
      assert.equal(
        loaded,
        burst.calculatedValue,
        `Search ${line.line_item_id} ${burst.startDate}`
      )
    }
  }

  const ooh = mapOohExpertRowsToStandardLineItems(OOH_ROWS, weekColumns, CS, CE, {
    feePctOoh: 10,
  })
  for (const line of ooh) {
    for (const burst of line.bursts) {
      const loaded = computeLoadedDeliverables(
        line.buyType,
        {
          budget: burst.budget,
          buyAmount: String(burst.buyAmount).replace(/[^0-9.-]/g, ""),
          calculatedValue: burst.calculatedValue,
        },
        Boolean(line.budgetIncludesFees),
        10
      )
      assert.equal(
        loaded,
        burst.calculatedValue,
        `OOH ${line.line_item_id} ${format(startOfDay(burst.startDate), "yyyy-MM-dd")}`
      )
    }
  }

  const prog = mapProgVideoExpertRowsToStandardLineItems(
    PROG_VIDEO_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctProgVideo: 12 }
  )
  for (const line of prog) {
    for (const burst of line.bursts) {
      const loaded = computeLoadedDeliverables(
        line.buyType,
        {
          budget: burst.budget,
          buyAmount: String(burst.buyAmount).replace(/[^0-9.-]/g, ""),
          calculatedValue: burst.calculatedValue,
        },
        Boolean(line.budgetIncludesFees),
        12
      )
      assert.equal(
        loaded,
        burst.calculatedValue,
        `ProgVideo ${line.line_item_id} ${format(startOfDay(burst.startDate), "yyyy-MM-dd")}`
      )
    }
  }
})
