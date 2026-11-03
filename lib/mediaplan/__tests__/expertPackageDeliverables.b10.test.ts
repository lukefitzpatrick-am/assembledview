/**
 * B10 (F2, decision D1): a package line's deliverable is the quantity entered,
 * whichever editor or grid entered it.
 *
 * - Card: the planner types it (handleValueChange skips package) and
 *   computeLoadedDeliverables keeps it.
 * - Expert grid Apply: every channel writes the week, span or day quantity
 *   when the `expert_package_quantity` switch is on. Off keeps the old result
 *   (digital and programmatic 0, press 1). OOH, Radio, TV, Cinema, BVOD and
 *   Digital Audio already wrote the quantity and don't read the switch.
 * - Budgets never change with the switch: the grid's cost is quantity × rate.
 * - Non-package buy types keep their old per-grid result.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  computeLoadedDeliverables,
  expertGridDeliverables,
  packageDeliverablesFromEnteredQty,
} from "@/lib/mediaplan/deliverableBudget"
import * as maps from "@/lib/mediaplan/expertChannelMappings"
import * as rowsCfg from "@/lib/mediaplan/expertGridChannelConfig"
import { featureDefinition } from "@/lib/features/registry"

const CS = new Date(2026, 0, 4)
const CE = new Date(2026, 0, 31)
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const weekKeys = cols.map((c) => c.weekKey)
const W2 = weekKeys[1]!
const W3 = weekKeys[2]!

type AnyFn = (...args: any[]) => any[]

type Channel = {
  name: string
  emptyRow: (id: string, s: Date, e: Date, keys: string[]) => any
  toStandard: AnyFn
  /** Old expert Apply result for a package row (switch off). "qty" = the quantity. */
  off: 0 | 1 | "qty"
}

const CHANNELS: Channel[] = [
  { name: "OOH", emptyRow: rowsCfg.createEmptyOohExpertRow, toStandard: maps.mapOohExpertRowsToStandardLineItems, off: "qty" },
  { name: "Radio", emptyRow: rowsCfg.createEmptyRadioExpertRow, toStandard: maps.mapRadioExpertRowsToStandardLineItems, off: "qty" },
  { name: "Cinema", emptyRow: rowsCfg.createEmptyCinemaExpertRow, toStandard: maps.mapCinemaExpertRowsToStandardLineItems, off: "qty" },
  { name: "Television", emptyRow: rowsCfg.createEmptyTelevisionExpertRow, toStandard: maps.mapTvExpertRowsToStandardLineItems, off: "qty" },
  { name: "BVOD", emptyRow: rowsCfg.createEmptyBvodExpertRow, toStandard: maps.mapBvodExpertRowsToStandardLineItems, off: "qty" },
  { name: "Digital Audio", emptyRow: rowsCfg.createEmptyDigitalAudioExpertRow, toStandard: maps.mapDigitalAudioExpertRowsToStandardLineItems, off: "qty" },
  { name: "Digital Video", emptyRow: rowsCfg.createEmptyDigiVideoExpertRow, toStandard: maps.mapDigiVideoExpertRowsToStandardLineItems, off: 0 },
  { name: "Digital Display", emptyRow: rowsCfg.createEmptyDigitalDisplayExpertRow, toStandard: maps.mapDigitalDisplayExpertRowsToStandardLineItems, off: 0 },
  { name: "Social", emptyRow: rowsCfg.createEmptySocialMediaExpertRow, toStandard: maps.mapSocialMediaExpertRowsToStandardLineItems, off: 0 },
  { name: "Search", emptyRow: rowsCfg.createEmptySearchExpertRow, toStandard: maps.mapSearchExpertRowsToStandardLineItems, off: 0 },
  { name: "Influencers", emptyRow: rowsCfg.createEmptyInfluencersExpertRow, toStandard: maps.mapInfluencersExpertRowsToStandardLineItems, off: 0 },
  { name: "Integration", emptyRow: rowsCfg.createEmptyIntegrationExpertRow, toStandard: maps.mapIntegrationExpertRowsToStandardLineItems, off: 0 },
  { name: "Newspaper", emptyRow: rowsCfg.createEmptyNewspaperExpertRow, toStandard: maps.mapNewspaperExpertRowsToStandardLineItems, off: 1 },
  { name: "Magazines", emptyRow: rowsCfg.createEmptyMagazinesExpertRow, toStandard: maps.mapMagazineExpertRowsToStandardLineItems, off: 1 },
  { name: "Prog Audio", emptyRow: rowsCfg.createEmptyProgAudioExpertRow, toStandard: maps.mapProgAudioExpertRowsToStandardLineItems, off: 0 },
  { name: "Prog BVOD", emptyRow: rowsCfg.createEmptyProgBvodExpertRow, toStandard: maps.mapProgBvodExpertRowsToStandardLineItems, off: 0 },
  { name: "Prog Display", emptyRow: rowsCfg.createEmptyProgDisplayExpertRow, toStandard: maps.mapProgDisplayExpertRowsToStandardLineItems, off: 0 },
  { name: "Prog Video", emptyRow: rowsCfg.createEmptyProgVideoExpertRow, toStandard: maps.mapProgVideoExpertRowsToStandardLineItems, off: 0 },
  { name: "Prog OOH", emptyRow: rowsCfg.createEmptyProgOohExpertRow, toStandard: maps.mapProgOohExpertRowsToStandardLineItems, off: 0 },
]

function row(ch: Channel, buyType: string, cells: Record<string, number | "">, extra: Record<string, unknown> = {}): any {
  const r = ch.emptyRow("r1", CS, CE, weekKeys)
  return {
    ...r,
    buyType,
    unitRate: 250,
    weeklyValues: { ...r.weeklyValues, ...cells },
    ...extra,
  }
}

function apply(ch: Channel, r: any, packageKeepsEnteredQty: boolean): any[] {
  const [line] = ch.toStandard([r], cols, CS, CE, { packageKeepsEnteredQty })
  return line.bursts
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v)
}

test("the switch is registered for /admin/features, client visible, default off", () => {
  const def = featureDefinition("expert_package_quantity")
  assert.ok(def, "registered")
  assert.equal(def!.defaultOn, false)
  assert.equal(def!.clientVisible, true)
  assert.equal(def!.source, "switch")
  assert.equal(def!.area, "planning")
})

test("packageDeliverablesFromEnteredQty: the quantity, rounded; blank or non-finite is 0", () => {
  assert.equal(packageDeliverablesFromEnteredQty(3), 3)
  assert.equal(packageDeliverablesFromEnteredQty(2.6), 3)
  assert.equal(packageDeliverablesFromEnteredQty(0), 0)
  assert.equal(packageDeliverablesFromEnteredQty(undefined), 0)
  assert.equal(packageDeliverablesFromEnteredQty(null), 0)
  assert.equal(packageDeliverablesFromEnteredQty(Number.NaN), 0)
  assert.equal(packageDeliverablesFromEnteredQty(Number.POSITIVE_INFINITY), 0)
})

for (const ch of CHANNELS) {
  test(`${ch.name}: an expert package row of 3 at $250 applies 3 deliverables (switch on), budget unchanged`, () => {
    const r = row(ch, "package", { [W2]: 3 })
    const on = apply(ch, r, true)
    const off = apply(ch, r, false)
    assert.equal(on.length, 1)
    assert.equal(num(on[0].calculatedValue), 3, "on: the quantity entered")
    const offExpected = ch.off === "qty" ? 3 : ch.off
    assert.equal(num(off[0].calculatedValue), offExpected, "off: the old result")
    // Money never moves with the switch.
    assert.equal(on[0].budget, off[0].budget)
    assert.equal(num(on[0].budget), 750)
    assert.equal(on[0].buyAmount, off[0].buyAmount)
  })

  test(`${ch.name}: two package weeks give one burst per week, each with its own quantity`, () => {
    const r = row(ch, "package", { [W2]: 2, [W3]: 5 })
    const on = apply(ch, r, true)
    assert.deepEqual(on.map((b) => num(b.calculatedValue)), [2, 5])
  })

  test(`${ch.name}: a package row with every week blank gives deliverables 0`, () => {
    const r = row(ch, "package", {})
    for (const flag of [true, false]) {
      const bursts = apply(ch, r, flag)
      const total = bursts.reduce((s, b) => s + (num(b.calculatedValue) || 0), 0)
      assert.equal(total, 0, `blank, switch ${flag ? "on" : "off"}`)
    }
  })
}

test("merged span: a digital package span of 4 over two weeks applies 4 (switch on), 0 (off)", () => {
  const ch = CHANNELS.find((c) => c.name === "Digital Video")!
  const r = row(ch, "package", {}, {
    mergedWeekSpans: [{ id: "s1", startWeekKey: W2, endWeekKey: W3, totalQty: 4 }],
  })
  const on = apply(ch, r, true)
  const off = apply(ch, r, false)
  assert.equal(on.length, 1)
  assert.equal(num(on[0].calculatedValue), 4)
  assert.equal(num(off[0].calculatedValue), 0)
  assert.equal(on[0].budget, off[0].budget)
})

test("merged span: a press package span of 4 applies 4 (switch on), 1 (off)", () => {
  const ch = CHANNELS.find((c) => c.name === "Newspaper")!
  const r = row(ch, "package", {}, {
    mergedWeekSpans: [{ id: "s1", startWeekKey: W2, endWeekKey: W3, totalQty: 4 }],
  })
  assert.equal(num(apply(ch, r, true)[0].calculatedValue), 4)
  assert.equal(num(apply(ch, r, false)[0].calculatedValue), 1)
})

test("merged span: a programmatic package span of 4 applies 4 (switch on), 0 (off)", () => {
  const ch = CHANNELS.find((c) => c.name === "Prog Display")!
  const r = row(ch, "package", {}, {
    mergedWeekSpans: [{ id: "s1", startWeekKey: W2, endWeekKey: W3, totalQty: 4 }],
  })
  assert.equal(num(apply(ch, r, true)[0].calculatedValue), 4)
  assert.equal(num(apply(ch, r, false)[0].calculatedValue), 0)
})

test("card path: a package burst keeps the quantity typed (computeLoadedDeliverables), whatever the budget and rate", () => {
  const burst = { budget: "750", buyAmount: "250", calculatedValue: 3 }
  assert.equal(computeLoadedDeliverables("package", burst, false, 0), 3)
  assert.equal(computeLoadedDeliverables("package", burst, true, 20), 3)
  assert.equal(computeLoadedDeliverables("package", { budget: "750", buyAmount: "250" }, false, 0), 0, "blank is 0")
})

test("card path: every container and the shared hook skip package in handleValueChange", () => {
  const files = [
    "lib/mediaplan/useMediaChannelContainer.ts",
    "components/media-containers/DigitalVideoContainer.tsx",
  ]
  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), "utf8")
    assert.match(src, /buyTypeLower === "package_inclusions" \|\|\s*buyTypeLower === "package"\s*\)\s*\{\s*return;?\s*\}/, rel)
  }
})

test("round trip, switch on: a digital card package of 3 opens in the grid as 3 and applies back as 3", () => {
  const std: any = {
    platform: "P", site: "S", publisher: "Pub", bidStrategy: "", buyType: "package",
    creativeTargeting: "", creative: "", buyingDemo: "", market: "", fixedCostMedia: false,
    clientPaysForMedia: false, budgetIncludesFees: false, noadserving: false, placement: "",
    size: "", targetingAttribute: "", lineItemId: "L1", line_item_id: "L1", line_item: 1, lineItem: 1,
    bursts: [{ budget: "750", buyAmount: "250", startDate: new Date(2026, 0, 11), endDate: new Date(2026, 0, 17), calculatedValue: 3 }],
  }
  const rows = maps.mapStandardDigiVideoLineItemsToExpertRows([std], cols, CS, CE)
  const back = maps.mapDigiVideoExpertRowsToStandardLineItems(rows, cols, CS, CE, { packageKeepsEnteredQty: true })
  assert.equal(num(back[0].bursts[0].calculatedValue), 3)
  assert.equal(num(back[0].bursts[0].budget), 750)
})

test("non-package buy types: the digital and press grids give the old results", () => {
  const ch = CHANNELS.find((c) => c.name === "Digital Video")!
  const press = CHANNELS.find((c) => c.name === "Newspaper")!
  // cpm: unrounded net ÷ rate × 1000. 3,333 impressions at $7 CPM is $23.331.
  const cpm = apply(ch, { ...row(ch, "cpm", { [W2]: 3333 }), unitRate: 7 }, true)
  const cpmQty = num(cpm[0].calculatedValue)
  assert.ok(Math.abs(cpmQty - 3333) < 1e-6, "about 3,333")
  assert.notEqual(cpmQty, 3333, "still unrounded on this grid, as before (3333.0000000000005)")
  // cpc with fees in the budget: net ÷ rate, unrounded.
  const cpc = apply(ch, { ...row(ch, "cpc", { [W2]: 10 }), unitRate: 3, budgetIncludesFees: true }, true)
  const cpcOff = apply(ch, { ...row(ch, "cpc", { [W2]: 10 }), unitRate: 3, budgetIncludesFees: true }, false)
  assert.equal(cpc[0].calculatedValue, cpcOff[0].calculatedValue)
  // cpcv: still 0 on the digital grid (a separate defect, not D1).
  assert.equal(num(apply(ch, row(ch, "cpcv", { [W2]: 10 }), true)[0].calculatedValue), 0)
  // fixed_cost and package_inclusions: 1. bonus: the quantity.
  assert.equal(num(apply(ch, row(ch, "fixed_cost", { [W2]: 1 }), true)[0].calculatedValue), 1)
  assert.equal(num(apply(ch, row(ch, "package_inclusions", { [W2]: 7 }), true)[0].calculatedValue), 1)
  assert.equal(num(apply(press, row(press, "package_inclusions", { [W2]: 7 }), true)[0].calculatedValue), 1)
  assert.equal(num(apply(ch, row(ch, "bonus", { [W2]: 7 }), true)[0].calculatedValue), 7)
  // insertions: net ÷ rate on press, 0 on digital.
  assert.equal(num(apply(press, row(press, "insertions", { [W2]: 4 }), true)[0].calculatedValue), 4)
  assert.equal(num(apply(ch, row(ch, "insertions", { [W2]: 4 }), true)[0].calculatedValue), 0)
})

test("expertGridDeliverables: the rule table, both profiles", () => {
  const base = { netBudget: 1000, unitRate: 4, enteredQty: 9, packageKeepsEnteredQty: false }
  for (const profile of ["digital", "press"] as const) {
    const d = (buyType: string, over: Partial<typeof base> = {}) =>
      expertGridDeliverables({ profile, buyType, ...base, ...over })
    assert.equal(d("cpc"), 250)
    assert.equal(d("CPV"), 250, "case-insensitive")
    assert.equal(d("cpm"), 250_000)
    assert.equal(d("cpc", { unitRate: 0 }), 0)
    assert.equal(d("cpm", { unitRate: 0 }), 0)
    assert.equal(d("fixed_cost"), 1)
    assert.equal(d("package_inclusions"), 1)
    assert.equal(d("bonus"), 9)
    assert.equal(d("cpcv"), 0)
    assert.equal(d("guaranteed_leads"), 0)
    assert.equal(d("spots"), 0)
    assert.equal(d(""), 0)
    assert.equal(d("insertions"), profile === "press" ? 250 : 0)
    assert.equal(d("package"), profile === "press" ? 1 : 0, "switch off: old result")
    assert.equal(d("package", { packageKeepsEnteredQty: true }), 9, "switch on: the quantity")
    assert.equal(d("package", { packageKeepsEnteredQty: true, enteredQty: 8.5 }), 9, "rounded")
    assert.equal(d("package", { packageKeepsEnteredQty: true, enteredQty: Number.NaN }), 0, "blank is 0")
    assert.equal(d("cpc", { netBudget: 10, unitRate: 3 }), 10 / 3, "unrounded, as before")
  }
})

test("the local copies are gone; the digital, programmatic and press grids use the shared helper", () => {
  const src = readFileSync(join(process.cwd(), "lib/mediaplan/expertChannelMappings.ts"), "utf8")
  for (const name of [
    "bvodCalculatedDeliverables",
    "newspaperCalculatedDeliverables",
    "magazineCalculatedDeliverables",
    "oohCalculatedDeliverables",
  ]) {
    assert.doesNotMatch(src, new RegExp(`function ${name}\\(`), name)
  }
  const calls = src.match(/expertGridDeliverables\(\{/g) ?? []
  assert.equal(calls.length, 9, "6 digital mappers, the programmatic builder, newspaper, magazines")
  assert.equal((src.match(/profile: "press"/g) ?? []).length, 2)
  // B23fix: the switch counts only with fixed_cost_report_net on.
  assert.match(
    src,
    /options\?\.packageKeepsEnteredQty \?\?\s+combinePackageQuantity\(clientFeatureOn\("expert_package_quantity"\), clientFeatureOn\("fixed_cost_report_net"\)\)/,
  )
})
