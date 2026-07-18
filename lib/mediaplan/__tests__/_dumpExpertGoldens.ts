/**
 * One-shot dump of golden mapper / computeLoadedDeliverables outputs.
 * Run: npx tsx lib/mediaplan/__tests__/_dumpExpertGoldens.ts
 */
import { format, startOfDay } from "date-fns"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  mapSearchExpertRowsToStandardLineItems,
  mapOohExpertRowsToStandardLineItems,
  mapProgVideoExpertRowsToStandardLineItems,
} from "@/lib/mediaplan/expertChannelMappings"
import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import type {
  SearchExpertScheduleRow,
  OohExpertScheduleRow,
  ProgVideoExpertScheduleRow,
  ExpertWeeklyValues,
} from "@/lib/mediaplan/expertModeWeeklySchedule"

const CS = new Date(2026, 0, 5)
const CE = new Date(2026, 0, 25)
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const w = cols.map((c) => c.weekKey)
console.log("weekKeys", w)

function emptyWeekly(): ExpertWeeklyValues {
  const o = {} as ExpertWeeklyValues
  for (const k of w) o[k] = ""
  return o
}

function serBurst(b: {
  budget: string
  buyAmount: string
  startDate: Date
  endDate: Date
  calculatedValue?: number
  fee?: number
}) {
  return {
    budget: b.budget,
    buyAmount: b.buyAmount,
    startDate: format(startOfDay(b.startDate), "yyyy-MM-dd"),
    endDate: format(startOfDay(b.endDate), "yyyy-MM-dd"),
    calculatedValue: b.calculatedValue,
    fee: b.fee,
  }
}

function serLine<T extends { bursts: Parameters<typeof serBurst>[0][] }>(l: T) {
  const { bursts, ...rest } = l
  return { ...rest, bursts: bursts.map(serBurst) }
}

const searchRows: SearchExpertScheduleRow[] = [
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
    weeklyValues: { ...emptyWeekly(), [w[0]!]: 100, [w[1]!]: 50 },
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
    weeklyValues: { ...emptyWeekly(), [w[0]!]: 10000 },
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
    weeklyValues: { ...emptyWeekly(), [w[0]!]: 25 },
    mergedWeekSpans: [],
  },
]

const oohRows: OohExpertScheduleRow[] = [
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
    weeklyValues: { ...emptyWeekly(), [w[0]!]: 4, [w[1]!]: 2 },
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
    weeklyValues: { ...emptyWeekly(), [w[0]!]: 5000 },
    mergedWeekSpans: [],
  },
]

const progRows: ProgVideoExpertScheduleRow[] = [
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
    weeklyValues: { ...emptyWeekly(), [w[0]!]: 20000, [w[1]!]: 10000 },
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
    weeklyValues: { ...emptyWeekly(), [w[0]!]: 100000 },
    mergedWeekSpans: [],
  },
]

const search = mapSearchExpertRowsToStandardLineItems(searchRows, cols, CS, CE, {
  feePctSearch: 10,
})
const ooh = mapOohExpertRowsToStandardLineItems(oohRows, cols, CS, CE, {
  feePctOoh: 10,
})
const prog = mapProgVideoExpertRowsToStandardLineItems(progRows, cols, CS, CE, {
  feePctProgVideo: 12,
})

console.log("===SEARCH===")
console.log(JSON.stringify(search.map(serLine), null, 2))
console.log("===OOH===")
console.log(JSON.stringify(ooh.map(serLine), null, 2))
console.log("===PROG===")
console.log(JSON.stringify(prog.map(serLine), null, 2))

const loadedCases: Array<[string, Record<string, unknown>, boolean, number]> = [
  ["cpc", { budget: "250", buyAmount: "2.5" }, true, 10],
  ["cpm", { budget: "120", buyAmount: "12" }, false, 0],
  ["bonus", { budget: "0", buyAmount: "0", calculatedValue: 25 }, false, 0],
  ["panels", { budget: "600", buyAmount: "150" }, false, 0],
  ["cpm", { budget: "44.44", buyAmount: "8" }, true, 10],
  ["cpv", { budget: "900", buyAmount: "0.045" }, true, 12],
  ["cpm", { budget: "1500", buyAmount: "15" }, false, 0],
]
console.log("===LOADED===")
for (const [bt, burst, bif, fee] of loadedCases) {
  const result = computeLoadedDeliverables(bt, burst, bif, fee)
  console.log(JSON.stringify({ bt, burst, bif, fee, result }))
}
