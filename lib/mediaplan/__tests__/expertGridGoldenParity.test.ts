/**
 * Golden parity fixtures for ExpertGrid consolidation.
 * Pins map*ExpertRowsToStandardLineItems + computeLoadedDeliverables for
 * Search / OOH / ProgVideo / Radio / Cinema / DigiVideo to the cent — do not
 * change expected values without intentional behaviour change review.
 *
 * Regenerate Search/OOH/ProgVideo via: npx tsx lib/mediaplan/__tests__/_dumpExpertGoldens.ts
 * Regenerate Radio/Cinema/DigiVideo via: npx tsx lib/mediaplan/__tests__/_dumpP1Goldens.ts
 */
import assert from "node:assert/strict"
import test from "node:test"
import { format, startOfDay } from "date-fns"

import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import {
  mapCinemaExpertRowsToStandardLineItems,
  mapDigiVideoExpertRowsToStandardLineItems,
  mapOohExpertRowsToStandardLineItems,
  mapProgVideoExpertRowsToStandardLineItems,
  mapRadioExpertRowsToStandardLineItems,
  mapSearchExpertRowsToStandardLineItems,
} from "@/lib/mediaplan/expertChannelMappings"
import type {
  CinemaExpertScheduleRow,
  DigiVideoExpertScheduleRow,
  ExpertWeeklyValues,
  OohExpertScheduleRow,
  ProgVideoExpertScheduleRow,
  RadioExpertScheduleRow,
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


const RADIO_ROWS: RadioExpertScheduleRow[] = [
  {
    id: "R1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "SCA",
    station: "2DAY",
    market: "SYD",
    placement: "Breakfast",
    duration: "30s",
    format: "Spot",
    buyingDemo: "A25-54",
    buyType: "spots",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 250,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 10, [weekKeys[1]]: 5 },
    mergedWeekSpans: [],
  },
  {
    id: "R2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "ARN",
    station: "KIIS",
    market: "MEL",
    placement: "",
    duration: "",
    format: "",
    buyingDemo: "",
    buyType: "package_inclusions",
    fixedCostMedia: true,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 0,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 100 },
    mergedWeekSpans: [],
  },
]

const CINEMA_ROWS: CinemaExpertScheduleRow[] = [
  {
    id: "C1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "Event",
    station: "Bondi",
    market: "SYD",
    placement: "Pre-show",
    duration: "30s",
    format: "Spot",
    buyingDemo: "A18-39",
    buyType: "spots",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 180,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 8, [weekKeys[1]]: 4 },
    mergedWeekSpans: [],
  },
  {
    id: "C2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "HOYTS",
    station: "Chadstone",
    market: "MEL",
    placement: "",
    duration: "",
    format: "",
    buyingDemo: "",
    buyType: "bonus",
    fixedCostMedia: false,
    clientPaysForMedia: true,
    budgetIncludesFees: false,
    unitRate: 0,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 50 },
    mergedWeekSpans: [],
  },
]

const DIGI_VIDEO_ROWS: DigiVideoExpertScheduleRow[] = [
  {
    id: "DV1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "YouTube",
    publisher: "Google",
    site: "yt.com",
    bidStrategy: "views",
    buyType: "cpv",
    placement: "instream",
    size: "15s",
    creativeTargeting: "ctx",
    creative: "v1",
    buyingDemo: "A25-54",
    market: "AU",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 0.05,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 15000, [weekKeys[1]]: 5000 },
    mergedWeekSpans: [],
  },
  {
    id: "DV2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "Meta",
    publisher: "Meta",
    site: "",
    bidStrategy: "",
    buyType: "cpm",
    placement: "",
    size: "",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 12,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 80000 },
    mergedWeekSpans: [],
  },
]

/** Frozen output of mapRadioExpertRowsToStandardLineItems (feePctRadio: 10). */
const RADIO_GOLDEN = [
  {
    "network": "SCA",
    "station": "2DAY",
    "buyType": "spots",
    "bidStrategy": "",
    "placement": "Breakfast",
    "format": "Spot",
    "duration": "30s",
    "buyingDemo": "A25-54",
    "market": "SYD",
    "platform": "",
    "creativeTargeting": "",
    "creative": "",
    "fixedCostMedia": false,
    "clientPaysForMedia": false,
    "budgetIncludesFees": true,
    "noadserving": false,
    "lineItemId": "R1",
    "line_item_id": "R1",
    "line_item": 1,
    "lineItem": 1,
    "bursts": [
      {
        "budget": "2777.78",
        "buyAmount": "$250.00",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 10
      },
      {
        "budget": "1388.89",
        "buyAmount": "$250.00",
        "startDate": "2026-01-11",
        "endDate": "2026-01-17",
        "calculatedValue": 5
      }
    ]
  },
  {
    "network": "ARN",
    "station": "KIIS",
    "buyType": "package_inclusions",
    "bidStrategy": "",
    "placement": "",
    "format": "",
    "duration": "",
    "buyingDemo": "",
    "market": "MEL",
    "platform": "",
    "creativeTargeting": "",
    "creative": "",
    "fixedCostMedia": true,
    "clientPaysForMedia": false,
    "budgetIncludesFees": false,
    "noadserving": false,
    "lineItemId": "R2",
    "line_item_id": "R2",
    "line_item": 2,
    "lineItem": 2,
    "bursts": [
      {
        "budget": "0",
        "buyAmount": "0",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 100
      }
    ]
  }
]

/** Frozen output of mapCinemaExpertRowsToStandardLineItems (feePctCinema: 10). */
const CINEMA_GOLDEN = [
  {
    "network": "Event",
    "station": "Bondi",
    "buyType": "spots",
    "bidStrategy": "",
    "placement": "Pre-show",
    "format": "Spot",
    "duration": "30s",
    "buyingDemo": "A18-39",
    "market": "SYD",
    "fixedCostMedia": false,
    "clientPaysForMedia": false,
    "budgetIncludesFees": true,
    "noadserving": false,
    "lineItemId": "C1",
    "line_item_id": "C1",
    "line_item": 1,
    "lineItem": 1,
    "bursts": [
      {
        "budget": "1600",
        "buyAmount": "$180.00",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 8
      },
      {
        "budget": "800",
        "buyAmount": "$180.00",
        "startDate": "2026-01-11",
        "endDate": "2026-01-17",
        "calculatedValue": 4
      }
    ]
  },
  {
    "network": "HOYTS",
    "station": "Chadstone",
    "buyType": "bonus",
    "bidStrategy": "",
    "placement": "",
    "format": "",
    "duration": "",
    "buyingDemo": "",
    "market": "MEL",
    "fixedCostMedia": false,
    "clientPaysForMedia": true,
    "budgetIncludesFees": false,
    "noadserving": false,
    "lineItemId": "C2",
    "line_item_id": "C2",
    "line_item": 2,
    "lineItem": 2,
    "bursts": [
      {
        "budget": "0",
        "buyAmount": "0",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 50
      }
    ]
  }
]

/** Frozen output of mapDigiVideoExpertRowsToStandardLineItems (feePctDigiVideo: 10). */
const DIGI_VIDEO_GOLDEN = [
  {
    "platform": "YouTube",
    "site": "yt.com",
    "bidStrategy": "views",
    "buyType": "cpv",
    "publisher": "Google",
    "placement": "instream",
    "size": "15s",
    "targetingAttribute": "",
    "creativeTargeting": "ctx",
    "creative": "v1",
    "buyingDemo": "A25-54",
    "market": "AU",
    "fixedCostMedia": false,
    "clientPaysForMedia": false,
    "budgetIncludesFees": true,
    "noadserving": false,
    "lineItemId": "DV1",
    "line_item_id": "DV1",
    "line_item": 1,
    "lineItem": 1,
    "bursts": [
      {
        "budget": "750",
        "buyAmount": "$0.05",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 13500
      },
      {
        "budget": "250",
        "buyAmount": "$0.05",
        "startDate": "2026-01-11",
        "endDate": "2026-01-17",
        "calculatedValue": 4500
      }
    ]
  },
  {
    "platform": "Meta",
    "site": "",
    "bidStrategy": "",
    "buyType": "cpm",
    "publisher": "Meta",
    "placement": "",
    "size": "",
    "targetingAttribute": "",
    "creativeTargeting": "",
    "creative": "",
    "buyingDemo": "",
    "market": "",
    "fixedCostMedia": false,
    "clientPaysForMedia": false,
    "budgetIncludesFees": false,
    "noadserving": false,
    "lineItemId": "DV2",
    "line_item_id": "DV2",
    "line_item": 2,
    "lineItem": 2,
    "bursts": [
      {
        "budget": "960",
        "buyAmount": "$12.00",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 80000
      }
    ]
  }
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

test("golden: mapRadioExpertRowsToStandardLineItems matches frozen Radio output", () => {
  const lines = mapRadioExpertRowsToStandardLineItems(RADIO_ROWS, weekColumns, CS, CE, {
    feePctRadio: 10,
  })
  assert.deepEqual(lines.map(serializeLine), RADIO_GOLDEN)
})

test("golden: mapCinemaExpertRowsToStandardLineItems matches frozen Cinema output", () => {
  const lines = mapCinemaExpertRowsToStandardLineItems(CINEMA_ROWS, weekColumns, CS, CE, {
    feePctCinema: 10,
  })
  assert.deepEqual(lines.map(serializeLine), CINEMA_GOLDEN)
})

test("golden: mapDigiVideoExpertRowsToStandardLineItems matches frozen DigiVideo output", () => {
  const lines = mapDigiVideoExpertRowsToStandardLineItems(
    DIGI_VIDEO_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctDigiVideo: 10 }
  )
  assert.deepEqual(lines.map(serializeLine), DIGI_VIDEO_GOLDEN)
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
    // Radio R1 — spots with fees (qty passthrough)
    {
      buyType: "spots",
      burst: { budget: "2777.78", buyAmount: "250" },
      budgetIncludesFees: true,
      feePct: 10,
      expected: 10,
    },
    // Radio R2 — package_inclusions
    {
      buyType: "package_inclusions",
      burst: { budget: "0", buyAmount: "0", calculatedValue: 100 },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 100,
    },
    // Cinema C1 — spots with fees
    {
      buyType: "spots",
      burst: { budget: "1600", buyAmount: "180" },
      budgetIncludesFees: true,
      feePct: 10,
      expected: 8,
    },
    // Cinema C2 — bonus
    {
      buyType: "bonus",
      burst: { budget: "0", buyAmount: "0", calculatedValue: 50 },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 50,
    },
    // DigiVideo DV1 — CPV with fees (mapper calculatedValue after fee strip)
    {
      buyType: "cpv",
      burst: { budget: "750", buyAmount: "0.05", calculatedValue: 13500 },
      budgetIncludesFees: true,
      feePct: 10,
      expected: 13500,
    },
    // DigiVideo DV2 — CPM no fees
    {
      buyType: "cpm",
      burst: { budget: "960", buyAmount: "12" },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 80000,
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

test("golden: Search/OOH/ProgVideo/Radio/Cinema/DigiVideo mapped calculatedValue equals computeLoadedDeliverables", () => {
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

  const radio = mapRadioExpertRowsToStandardLineItems(RADIO_ROWS, weekColumns, CS, CE, {
    feePctRadio: 10,
  })
  for (const line of radio) {
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
        `Radio ${line.line_item_id} ${format(startOfDay(burst.startDate), "yyyy-MM-dd")}`
      )
    }
  }

  const cinema = mapCinemaExpertRowsToStandardLineItems(CINEMA_ROWS, weekColumns, CS, CE, {
    feePctCinema: 10,
  })
  for (const line of cinema) {
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
        `Cinema ${line.line_item_id} ${format(startOfDay(burst.startDate), "yyyy-MM-dd")}`
      )
    }
  }

  const digiVideo = mapDigiVideoExpertRowsToStandardLineItems(
    DIGI_VIDEO_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctDigiVideo: 10 }
  )
  for (const line of digiVideo) {
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
        `DigiVideo ${line.line_item_id} ${format(startOfDay(burst.startDate), "yyyy-MM-dd")}`
      )
    }
  }
})
