import "@/lib/testing/bothZones"
/**
 * C-342 to C-345, V66 B: plan to schedule grid to plan on every channel that
 * has an expert grid (20), every buy type its grid offers that a line is
 * priced on, a round and an awkward budget, Budget Includes Fees on and off,
 * client fee 0 and 12.5%, client pays on and off. Production (no fee, no buy
 * type) has its own case.
 *
 * The path is the one the containers run: `toExpert` (open the grid),
 * `fromExpert` with the container's fee options, then `mergeFromExpert`
 * (Apply).
 *
 * - No edit: every burst comes back as saved (budget to the cent and of the
 *   same type, deliverables, buy amount, dates) and every line keeps its buy
 *   type and flags. A budget that is not a whole multiple of its rate
 *   (C-343) and a line whose bursts have different rates (C-345) included.
 * - One other row edited: nothing else moves, and the edit reaches its row.
 * - An edited cell: its deliverables are what was typed and its budget is
 *   the card's rule read backwards (net = budget x (1 - fee) on a
 *   fee-inclusive line, so budget = quantity x rate / (1 - fee); fee on top,
 *   budget = quantity x rate). The line's other cells stay as saved.
 * - A cell that holds several bursts, OOH spans (C-344) and the grid's money.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { format } from "date-fns"

import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import * as M from "@/lib/mediaplan/expertChannelMappings"
import {
  BVOD_BUY_TYPE_OPTIONS,
  CINEMA_BUY_TYPE_OPTIONS,
  DIGIAUDIO_BUY_TYPE_OPTIONS,
  DIGITALDISPLAY_BUY_TYPE_OPTIONS,
  DIGIVIDEO_BUY_TYPE_OPTIONS,
  INFLUENCERS_BUY_TYPE_OPTIONS,
  INTEGRATION_BUY_TYPE_OPTIONS,
  MAGAZINES_BUY_TYPE_OPTIONS,
  NEWSPAPER_BUY_TYPE_OPTIONS,
  OOH_BUY_TYPE_OPTIONS,
  PROGAUDIO_BUY_TYPE_OPTIONS,
  PROGBVOD_BUY_TYPE_OPTIONS,
  PROGDISPLAY_BUY_TYPE_OPTIONS,
  PROGOOH_BUY_TYPE_OPTIONS,
  PROGVIDEO_BUY_TYPE_OPTIONS,
  RADIO_BUY_TYPE_OPTIONS,
  SEARCH_BUY_TYPE_OPTIONS,
  SOCIALMEDIA_BUY_TYPE_OPTIONS,
  TV_BUY_TYPE_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import { budgetCellDisplay, qtyFromBudgetInput } from "@/lib/mediaplan/expertGridDayEntry"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { expertRowCostSplit, expertRowQuantitySum } from "@/lib/mediaplan/expertRowCost"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { toCents } from "@/lib/money/cents"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

type AnyFn = (...args: any[]) => any

type Channel = {
  name: string
  feeKey: string
  buyTypes: readonly string[]
  toExpert: AnyFn
  fromExpert: AnyFn
  merge: AnyFn
  /** Radio's container passes its fee to the import (deliverable fallback). */
  toExpertFee?: boolean
  /** OOH's container passes only its fee (no Budget Includes Fees fallback). */
  feeOnly?: boolean
}

const values = (opts: ReadonlyArray<{ value: string }>) => opts.map((o) => o.value)

const CHANNELS: Channel[] = [
  { name: "Search", feeKey: "feePctSearch", buyTypes: values(SEARCH_BUY_TYPE_OPTIONS), toExpert: M.mapStandardSearchLineItemsToExpertRows, fromExpert: M.mapSearchExpertRowsToStandardLineItems, merge: S.mergeSearchStandardFromExpertWithPrevious },
  { name: "Social", feeKey: "feePctSocial", buyTypes: values(SOCIALMEDIA_BUY_TYPE_OPTIONS), toExpert: M.mapStandardSocialMediaLineItemsToExpertRows, fromExpert: M.mapSocialMediaExpertRowsToStandardLineItems, merge: S.mergeSocialMediaStandardFromExpertWithPrevious },
  { name: "Influencers", feeKey: "feePctInfluencers", buyTypes: values(INFLUENCERS_BUY_TYPE_OPTIONS), toExpert: M.mapStandardInfluencersLineItemsToExpertRows, fromExpert: M.mapInfluencersExpertRowsToStandardLineItems, merge: S.mergeInfluencersStandardFromExpertWithPrevious },
  { name: "Integration", feeKey: "feePctIntegration", buyTypes: values(INTEGRATION_BUY_TYPE_OPTIONS), toExpert: M.mapStandardIntegrationLineItemsToExpertRows, fromExpert: M.mapIntegrationExpertRowsToStandardLineItems, merge: S.mergeIntegrationStandardFromExpertWithPrevious },
  { name: "Digital Video", feeKey: "feePctDigiVideo", buyTypes: values(DIGIVIDEO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardDigiVideoLineItemsToExpertRows, fromExpert: M.mapDigiVideoExpertRowsToStandardLineItems, merge: S.mergeDigiVideoStandardFromExpertWithPrevious },
  { name: "Digital Display", feeKey: "feePctDigiDisplay", buyTypes: values(DIGITALDISPLAY_BUY_TYPE_OPTIONS), toExpert: M.mapStandardDigiDisplayLineItemsToExpertRows, fromExpert: M.mapDigitalDisplayExpertRowsToStandardLineItems, merge: S.mergeDigiDisplayStandardFromExpertWithPrevious },
  { name: "Digital Audio", feeKey: "feePctDigiAudio", buyTypes: values(DIGIAUDIO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardDigiAudioLineItemsToExpertRows, fromExpert: M.mapDigitalAudioExpertRowsToStandardLineItems, merge: S.mergeDigiAudioStandardFromExpertWithPrevious },
  { name: "BVOD", feeKey: "feePctBvod", buyTypes: values(BVOD_BUY_TYPE_OPTIONS), toExpert: M.mapStandardBvodLineItemsToExpertRows, fromExpert: M.mapBvodExpertRowsToStandardLineItems, merge: S.mergeBvodStandardFromExpertWithPrevious },
  { name: "Prog Display", feeKey: "feePctProgDisplay", buyTypes: values(PROGDISPLAY_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgDisplayLineItemsToExpertRows, fromExpert: M.mapProgDisplayExpertRowsToStandardLineItems, merge: S.mergeProgDisplayStandardFromExpertWithPrevious },
  { name: "Prog Video", feeKey: "feePctProgVideo", buyTypes: values(PROGVIDEO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgVideoLineItemsToExpertRows, fromExpert: M.mapProgVideoExpertRowsToStandardLineItems, merge: S.mergeProgVideoStandardFromExpertWithPrevious },
  { name: "Prog BVOD", feeKey: "feePctProgBvod", buyTypes: values(PROGBVOD_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgBvodLineItemsToExpertRows, fromExpert: M.mapProgBvodExpertRowsToStandardLineItems, merge: S.mergeProgBvodStandardFromExpertWithPrevious },
  { name: "Prog Audio", feeKey: "feePctProgAudio", buyTypes: values(PROGAUDIO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgAudioLineItemsToExpertRows, fromExpert: M.mapProgAudioExpertRowsToStandardLineItems, merge: S.mergeProgAudioStandardFromExpertWithPrevious },
  { name: "Prog OOH", feeKey: "feePctProgOoh", buyTypes: values(PROGOOH_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgOohLineItemsToExpertRows, fromExpert: M.mapProgOohExpertRowsToStandardLineItems, merge: S.mergeProgOohStandardFromExpertWithPrevious },
  { name: "Newspaper", feeKey: "feePctNewspaper", buyTypes: values(NEWSPAPER_BUY_TYPE_OPTIONS), toExpert: M.mapStandardNewspaperLineItemsToExpertRows, fromExpert: M.mapNewspaperExpertRowsToStandardLineItems, merge: S.mergeNewspaperStandardFromExpertWithPrevious },
  { name: "Magazines", feeKey: "feePctMagazines", buyTypes: values(MAGAZINES_BUY_TYPE_OPTIONS), toExpert: M.mapStandardMagazineLineItemsToExpertRows, fromExpert: M.mapMagazineExpertRowsToStandardLineItems, merge: S.mergeMagazineStandardFromExpertWithPrevious },
  { name: "Cinema", feeKey: "feePctCinema", buyTypes: values(CINEMA_BUY_TYPE_OPTIONS), toExpert: M.mapStandardCinemaLineItemsToExpertRows, fromExpert: M.mapCinemaExpertRowsToStandardLineItems, merge: S.mergeCinemaStandardFromExpertWithPrevious },
  { name: "Radio", feeKey: "feePctRadio", buyTypes: values(RADIO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardRadioLineItemsToExpertRows, fromExpert: M.mapRadioExpertRowsToStandardLineItems, merge: S.mergeRadioStandardFromExpertWithPrevious, toExpertFee: true },
  { name: "Television", feeKey: "feePctTelevision", buyTypes: values(TV_BUY_TYPE_OPTIONS), toExpert: M.mapStandardTvLineItemsToExpertRows, fromExpert: M.mapTvExpertRowsToStandardLineItems, merge: S.mergeTelevisionStandardFromExpertWithPrevious },
  { name: "OOH", feeKey: "feePctOoh", buyTypes: values(OOH_BUY_TYPE_OPTIONS), toExpert: M.mapStandardOohLineItemsToExpertRows, fromExpert: M.mapOohExpertRowsToStandardLineItems, merge: S.mergeOohStandardFromExpertWithPrevious, feeOnly: true },
]

/** Rate and quantity per buy type: a round budget and an awkward one. */
const RATES: Record<string, { round: string; awkward: string }> = {
  cpm: { round: "$15.00", awkward: "$13.00" },
  cpc: { round: "$2.50", awkward: "$2.37" },
  cpv: { round: "$0.05", awkward: "$0.07" },
  spots: { round: "$600.00", awkward: "$650.00" },
  insertions: { round: "$3,000.00", awkward: "$2,950.00" },
  panels: { round: "$1,500.00", awkward: "$1,450.00" },
  cpt: { round: "$40.00", awkward: "$37.00" },
  cpp: { round: "$400.00", awkward: "$390.00" },
}
const BUDGETS = { round: "$12,000.00", awkward: "$7,777.77" } as const

const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const COLS = buildWeeklyGanttColumnsFromCampaign(START, END)
/** Saved bursts carry date-only strings, as `mapLineItemFromPostgres` gives them. */
const FLIGHTS = [
  { startDate: "2026-03-01", endDate: "2026-03-07" },
  { startDate: "2026-03-08", endDate: "2026-03-21" },
]

type Variant = { incl: boolean; fee: number; clientPays: boolean }
const VARIANTS: Variant[] = []
for (const incl of [false, true]) {
  for (const fee of [0, 12.5]) {
    for (const clientPays of [false, true]) VARIANTS.push({ incl, fee, clientPays })
  }
}
const variantName = (v: Variant) =>
  `${v.incl ? "fee-inclusive" : "fee on top"}, fee ${v.fee}%${v.clientPays ? ", client pays" : ""}`

function savedBurst(buyType: string, size: "round" | "awkward", v: Variant, flight: (typeof FLIGHTS)[number]) {
  const bt = buyType.toLowerCase()
  if (bt === "bonus") return { budget: "0", buyAmount: "0", calculatedValue: 5000, ...flight }
  if (bt === "package_inclusions") return { budget: "0", buyAmount: "0", calculatedValue: 1, ...flight }
  if (bt === "fixed_cost") return { budget: BUDGETS[size], buyAmount: BUDGETS[size], calculatedValue: 1, ...flight }
  if (bt === "package") return { budget: "$12,000.00", buyAmount: "$1,500.00", calculatedValue: 8, ...flight }
  const rate = RATES[bt]?.[size] ?? "$10.00"
  const burst = { budget: BUDGETS[size], buyAmount: rate }
  return { ...burst, calculatedValue: computeLoadedDeliverables(bt, burst, v.incl, v.fee), ...flight }
}

/** Buy types with a rate the line is priced on (not bid strategies, which never reach a line). */
const LINE_BUY_TYPES = new Set(["bonus", "package_inclusions", "fixed_cost", "package", ...Object.keys(RATES)])

function savedPlan(ch: Channel, v: Variant) {
  const lines: any[] = []
  for (const buyType of ch.buyTypes.filter((b) => LINE_BUY_TYPES.has(b))) {
    for (const size of ["round", "awkward"] as const) {
      if (size === "awkward" && (buyType === "bonus" || buyType === "package_inclusions" || buyType === "package")) continue
      const id = `c342${ch.name.replace(/\s/g, "")}${lines.length + 1}`
      lines.push({
        buyType,
        budgetIncludesFees: v.incl,
        clientPaysForMedia: v.clientPays,
        fixedCostMedia: false,
        noadserving: false,
        line_item_id: id,
        lineItemId: id,
        line_item: lines.length + 1,
        lineItem: lines.length + 1,
        bursts: FLIGHTS.map((f) => savedBurst(buyType, size, v, f)),
        _label: `${buyType} ${size}`,
      })
    }
  }
  return lines
}

function applyNoEdit(ch: Channel, v: Variant, saved: any[], edit?: (rows: any[]) => void) {
  const rows = ch.toExpert(saved, COLS, START, END, ...(ch.toExpertFee ? [{ feePct: v.fee }] : []))
  edit?.(rows)
  const opts: Record<string, unknown> = ch.feeOnly
    ? { [ch.feeKey]: v.fee }
    : { [ch.feeKey]: v.fee, budgetIncludesFees: Boolean(saved[0]?.budgetIncludesFees) }
  const generated = ch.fromExpert(rows, COLS, START, END, opts)
  return ch.merge(generated, saved) as any[]
}


/** A fixed cost line on fee on top, the row a planner edits in the "one other row edited" run. */
function withEditTarget(lines: any[], ch: Channel) {
  const id = `c342${ch.name.replace(/\s/g, "")}Edit`
  return [
    ...lines,
    {
      buyType: "fixed_cost",
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      fixedCostMedia: false,
      noadserving: false,
      line_item_id: id,
      lineItemId: id,
      line_item: lines.length + 1,
      lineItem: lines.length + 1,
      bursts: [{ budget: "$1,000.00", buyAmount: "$1,000.00", calculatedValue: 1, ...FLIGHTS[0]! }],
      _label: "edit target",
    },
  ]
}

/** The civil day a burst date names: a date-only string as is, a Date by its local Y/M/D (as `burstDate` says to read one). */
const day = (d: unknown) =>
  d instanceof Date ? format(d, "yyyy-MM-dd") : formatBurstDateLocal(String(d ?? ""))
const byStart = (bursts: any[]) => [...bursts].sort((a, b) => day(a.startDate).localeCompare(day(b.startDate)))

type Burst = { budget: string; budgetType: string; cents: number; deliverables: number; buyAmountCents: number; dates: string }

/**
 * A line's fee basis and billing flags (C342fix review F2): Client Pays,
 * Budget Includes Fees, No Ad Serving (OOH spells it `noAdserving`) and
 * Fixed Cost Media. An Apply that changes any of them changes how the line
 * bills, even with every budget kept.
 */
const lineFlags = (l: any) =>
  [
    `buyType=${String(l.buyType ?? "")}`,
    `clientPays=${Boolean(l.clientPaysForMedia)}`,
    `includesFees=${Boolean(l.budgetIncludesFees)}`,
    `noAdServing=${Boolean(l.noadserving ?? l.noAdserving)}`,
    `fixedCostMedia=${Boolean(l.fixedCostMedia)}`,
  ].join(" ")

/** Each line's bursts in date order (Apply may reorder them; order carries no money). */
function readLines(lines: any[]): Map<string, { label: string; buyType: string; flags: string; bursts: Burst[] }> {
  const out = new Map<string, { label: string; buyType: string; flags: string; bursts: Burst[] }>()
  for (const l of lines) {
    out.set(String(l.line_item_id ?? l.lineItemId), {
      label: l._label ?? "",
      buyType: String(l.buyType ?? ""),
      flags: lineFlags(l),
      bursts: byStart(l.bursts ?? []).map((b) => ({
        budget: String(b.budget),
        budgetType: typeof b.budget,
        cents: toCents(parseBurstMoney(b.budget)),
        deliverables: Number(b.calculatedValue),
        // The rate, by value: "$1,500.00" and "1500" are the same buy amount.
        buyAmountCents: toCents(parseBurstMoney(b.buyAmount)),
        dates: `${day(b.startDate)}..${day(b.endDate)}`,
      })),
    })
  }
  return out
}

type Moves = { budgets: number; centsDelta: number; deliverables: number; other: number; sample: string[] }

/** What moved between the saved plan and the plan after Apply. */
function movesBetween(saved: any[], applied: any[], skipId?: string): Moves {
  const was = readLines(saved)
  const now = readLines(applied)
  const m: Moves = { budgets: 0, centsDelta: 0, deliverables: 0, other: 0, sample: [] }
  for (const [id, line] of was) {
    if (id === skipId) continue
    const after = now.get(id)
    if (after && after.flags !== line.flags) {
      m.other += 1
      m.sample.push(`${line.label}: flags ${line.flags} -> ${after.flags}`)
    }
    if (!after || after.bursts.length !== line.bursts.length) {
      m.other += 1
      m.sample.push(`${line.label}: ${line.bursts.length} bursts -> ${after?.bursts.length ?? 0}`)
      continue
    }
    line.bursts.forEach((b, i) => {
      const a = after.bursts[i]!
      if (a.cents !== b.cents || a.budgetType !== b.budgetType) {
        m.budgets += 1
        m.centsDelta += a.cents - b.cents
        if (m.sample.length < 4) m.sample.push(`${line.label} ${b.dates}: ${b.budget} -> ${a.budget}`)
      }
      if (!(Math.abs(a.deliverables - b.deliverables) < 1e-6)) {
        m.deliverables += 1
        if (m.sample.length < 4) m.sample.push(`${line.label} ${b.dates}: deliverables ${b.deliverables} -> ${a.deliverables}`)
      }
      if (a.buyAmountCents !== b.buyAmountCents) {
        m.other += 1
        m.sample.push(`${line.label} ${b.dates}: buy amount ${b.buyAmountCents}c -> ${a.buyAmountCents}c`)
      }
      if (a.dates !== b.dates) {
        m.other += 1
        m.sample.push(`${line.label}: dates ${b.dates} -> ${a.dates}`)
      }
    })
  }
  return m
}

const summary = (m: Moves) =>
  `${m.budgets} budgets ${m.centsDelta >= 0 ? "+" : ""}${m.centsDelta}c, ${m.deliverables} deliverables, ${m.other} other`
const NO_MOVES = "0 budgets +0c, 0 deliverables, 0 other"

const chan = (name: string) => CHANNELS.find((c) => c.name === name)!
const weekKeys = COLS.map((c) => c.weekKey)
const cents = (n: number) => Math.round(n * 100)
/** A burst's values, not the text of its budget (Apply writes "12000" for "$12,000.00"). */
const valuesOf = (b: Burst | undefined) => (b ? { ...b, budget: undefined } : b)

/** The grid row of a saved line. */
const rowOf = (rows: any[], id: string) => rows.find((r: any) => r.sourceLineItemId === id)

/**
 * Multiply the quantity a planner sees in the week that holds `ymd`: the week
 * cell, the merged span that starts there, or that week's day cells (the
 * import puts a one-week burst in whichever its channel uses).
 */
function scaleWeek(row: any, ymd: string, factor: number) {
  const k = [...weekKeys].reverse().find((w) => w <= ymd)!
  const cell = row.weeklyValues[k]
  if (cell !== "" && cell !== undefined && Number(cell) !== 0) {
    row.weeklyValues[k] = Number(cell) * factor
    return
  }
  const span = (row.mergedWeekSpans ?? []).find((sp: any) => sp.startWeekKey === k)
  if (span) {
    span.totalQty = span.totalQty * factor
    return
  }
  const days = Object.keys(row.dailyValues ?? {}).filter((d) => d >= k && d < (weekKeys[weekKeys.indexOf(k) + 1] ?? "9999"))
  assert.ok(days.length > 0, `no quantity in week ${k}`)
  for (const d of days) row.dailyValues[d] = Number(row.dailyValues[d]) * factor
}

/** Production has no fee and no buy type: cost x amount, the 20th grid. */
const productionLine = (bursts: any[]) => ({
  mediaType: "Production",
  publisher: "Studio",
  description: "Edit",
  market: "National",
  unitRate: 1234.56,
  line_item_id: "c342Production1",
  lineItemId: "c342Production1",
  line_item: 1,
  lineItem: 1,
  bursts,
  _label: "production",
})
const productionApply = (saved: any[], edit?: (rows: any[]) => void) => {
  const rows = M.mapStandardProductionLineItemsToExpertRows(saved, COLS, START, END)
  edit?.(rows)
  return S.mergeProductionStandardFromExpertWithPrevious(
    M.mapProductionExpertRowsToStandardLineItems(rows, COLS, START, END),
    saved
  ) as any[]
}

test("Production: no edit returns every burst as saved, a multi-week burst as one burst (C-343)", () => {
  const saved: any[] = [
    productionLine(FLIGHTS.map((f) => ({ cost: 1234.56, amount: 3, budget: "$3,703.68", buyAmount: "3", calculatedValue: 3, ...f }))),
  ]
  const applied = productionApply(saved)
  assert.equal(summary(movesBetween(saved, applied)), NO_MOVES, movesBetween(saved, applied).sample.join("; "))
  assert.deepEqual(
    applied[0].bursts.map((b: any) => [b.cost, b.amount, b.budget, b.buyAmount, b.calculatedValue]),
    [
      [1234.56, 3, "3703.68", "3", 3],
      [1234.56, 3, "3703.68", "3", 3],
    ]
  )
})

test("Production: an edited week is cost x the amount typed; the other burst stays as saved", () => {
  const saved: any[] = [
    productionLine(FLIGHTS.map((f) => ({ cost: 1234.56, amount: 3, budget: "$3,703.68", buyAmount: "3", calculatedValue: 3, ...f }))),
  ]
  const applied = productionApply(saved, (rows) => scaleWeek(rows[0], FLIGHTS[0]!.startDate, 2))
  const [first, second] = byStart(applied[0].bursts)
  assert.deepEqual([first.amount, cents(parseBurstMoney(first.budget))], [6, cents(1234.56 * 6)])
  assert.deepEqual([second.amount, second.budget, day(second.startDate), day(second.endDate)], [3, "3703.68", "2026-03-08", "2026-03-21"])
})

/**
 * What the grid shows for a fee-inclusive line (V66 B). One cpm line,
 * $12,000.00 for one week, CPM $15.00, fee 12.5%, saved deliverables 700,000
 * (the net $10,500.00 buys them). The cells hold the 700,000; the $ cell, the
 * Net Media column and the footer show the card's money.
 */
for (const name of ["Search", "BVOD", "OOH"]) {
  test(`${name}: the grid shows a fee-inclusive $12,000.00 cpm line as the card does`, () => {
    const ch = chan(name)
    const v: Variant = { incl: true, fee: 12.5, clientPays: false }
    const line = { ...savedPlan(ch, v).find((l) => l._label === "cpm round")!, bursts: [savedBurst("cpm", "round", v, FLIGHTS[0]!)] }
    const [row] = ch.toExpert([line], COLS, START, END)
    const fees = { budgetIncludesFees: true, feePct: 12.5 }
    assert.equal(expertRowQuantitySum(row, weekKeys), 700_000)
    assert.equal(budgetCellDisplay(row.buyType, Number(row.unitRate), expertRowQuantitySum(row, weekKeys), fees), (12000).toLocaleString())
    assert.equal(qtyFromBudgetInput(row.buyType, Number(row.unitRate), 12_000, fees), 700_000)
    const split = expertRowCostSplit(row, weekKeys, 12.5)
    assert.deepEqual({ raw: split.raw, net: split.net, fee: split.fee }, { raw: 12_000, net: 10_500, fee: 1_500 })
    // The same row once the planner edits it: priced from the grid, same money.
    scaleWeek(row, FLIGHTS[0]!.startDate, 1.5)
    const edited = expertRowCostSplit(row, weekKeys, 12.5)
    assert.deepEqual([cents(edited.raw), cents(edited.net), cents(edited.fee)], [1_800_000, 1_575_000, 225_000])
  })
}

test("the grid's money is the saved budget for an untouched awkward line (C-343), fee-inclusive and on top", () => {
  for (const incl of [true, false]) {
    const v: Variant = { incl, fee: 12.5, clientPays: false }
    const line = savedPlan(chan("Search"), v).find((l) => l._label === "cpc awkward")!
    const [row] = chan("Search").toExpert([line], COLS, START, END)
    const split = expertRowCostSplit(row, weekKeys, 12.5)
    assert.equal(cents(split.raw), 2 * 777_777)
  }
})

const DUMP_FILE = process.env.C342_DUMP_FILE
const dump: Record<string, string> = {}

/** Buy types a cell's quantity prices (rate x quantity), where the fee rule bites. */
const RATE_PRICED = new Set(Object.keys(RATES))

for (const ch of CHANNELS) {
  for (const v of VARIANTS) {
    const key = `${ch.name} | ${variantName(v)}`
    const saved = withEditTarget(savedPlan(ch, v), ch)
    const editId = saved[saved.length - 1]!.line_item_id as string
    const noEdit = applyNoEdit(ch, v, saved)
    const moves = movesBetween(saved, noEdit)
    if (summary(moves) !== NO_MOVES) dump[key] = summary(moves)

    test(`${key}: no edit returns every burst and line as saved`, () => {
      assert.equal(summary(moves), NO_MOVES, moves.sample.join("; "))
    })

    test(`${key}: editing one other row changes nothing on the rest, and the edit reaches its row`, () => {
      const edited = applyNoEdit(ch, v, saved, (rows) => {
        rowOf(rows, editId).unitRate = 2000
      })
      const rest = movesBetween(noEdit, edited, editId)
      assert.equal(summary(rest), NO_MOVES, rest.sample.join("; "))
      // A fixed cost rate is the budget (C-344: OOH no longer keeps $1,000.00).
      assert.equal(readLines(edited).get(editId)!.bursts[0]!.cents, 200_000)
    })

    test(`${key}: an edited cell holds the deliverables typed and the card's money; the line's other burst stays as saved`, () => {
      const rated = saved.filter((l) => RATE_PRICED.has(l.buyType))
      assert.ok(rated.length > 0)
      const applied = applyNoEdit(ch, v, saved, (rows) => {
        for (const l of rated) scaleWeek(rowOf(rows, l.line_item_id), FLIGHTS[0]!.startDate, 2)
      })
      const after = readLines(applied)
      const before = readLines(saved)
      for (const l of rated) {
        const [was1, was2] = before.get(l.line_item_id)!.bursts
        const [now1, now2] = after.get(l.line_item_id)!.bursts
        const typed = 2 * was1!.deliverables
        assert.ok(Math.abs(now1!.deliverables - typed) < 1e-6, `${l._label}: deliverables ${now1!.deliverables}, typed ${typed}`)
        const rate = parseBurstMoney(l.bursts[0].buyAmount)
        const media = l.buyType === "cpm" ? (typed / 1000) * rate : typed * rate
        const net = v.incl ? (now1!.cents / 100) * (1 - v.fee / 100) : now1!.cents / 100
        assert.ok(Math.abs(net - media) <= 0.01, `${l._label}: budget ${now1!.budget} buys ${net} of media, typed ${media}`)
        assert.deepEqual(valuesOf(now2), valuesOf(was2), `${l._label}: the untouched burst`)
      }
      // Lines with no edit are as saved.
      const untouched = movesBetween(
        saved.filter((l) => !RATE_PRICED.has(l.buyType)),
        applied
      )
      assert.equal(summary(untouched), NO_MOVES, untouched.sample.join("; "))
    })
  }
}

/**
 * Fixed cost and package rates are already the line's money: an edited row is
 * never grossed up, fee-inclusive or not. A fixed cost burst is its rate; a
 * package burst is the grid's quantity x the rate.
 */
for (const ch of CHANNELS) {
  for (const bt of ["fixed_cost", "package"].filter((b) => ch.buyTypes.includes(b))) {
    test(`${ch.name}: a fee-inclusive ${bt} line repriced in the grid is not grossed up`, () => {
      const v: Variant = { incl: true, fee: 12.5, clientPays: false }
      const saved = [savedPlan(ch, v).find((l) => l._label === `${bt} round`)!]
      const id = saved[0]!.line_item_id
      const applied = readLines(applyNoEdit(ch, v, saved, (rows) => {
        rowOf(rows, id).unitRate = 2000
      })).get(id)!
      for (const b of applied.bursts) {
        // Package: the 8 in the grid x $2,000.00 (its saved deliverable follows the package rule, B10).
        assert.equal(b.cents, bt === "fixed_cost" ? 200_000 : 8 * 200_000, `${b.dates}: ${b.budget}`)
      }
    })
  }
}

/**
 * C-345: a line whose bursts have different rates. An untouched burst keeps
 * its own rate; an edited cell prices at the row's rate (the first burst's);
 * a rate edit reprices every cell.
 */
for (const name of ["Social", "Radio", "OOH", "Digital Audio", "Prog Display"]) {
  for (const incl of [false, true]) {
    test(`${name}: a ${incl ? "fee-inclusive" : "fee on top"} line with two burst rates (C-345)`, () => {
      const ch = chan(name)
      const bt = name === "Radio" ? "spots" : name === "OOH" ? "panels" : "cpm"
      const rates = bt === "cpm" ? ["$15.00", "$18.75"] : ["$600.00", "$750.00"]
      const v: Variant = { incl, fee: 12.5, clientPays: false }
      const bursts = FLIGHTS.map((f, i) => {
        const b = { budget: i === 0 ? "$12,000.00" : "$9,250.50", buyAmount: rates[i]! }
        return { ...b, calculatedValue: computeLoadedDeliverables(bt, b, incl, v.fee), ...f }
      })
      const saved = [{ ...savedPlan(ch, v).find((l) => l.buyType === bt)!, bursts }]
      const id = saved[0]!.line_item_id
      assert.equal(summary(movesBetween(saved, applyNoEdit(ch, v, saved))), NO_MOVES)

      const second = readLines(applyNoEdit(ch, v, saved, (rows) => scaleWeek(rowOf(rows, id), FLIGHTS[1]!.startDate, 1)))
      assert.equal(second.get(id)!.bursts[1]!.cents, 925_050, "typing the cell's own number back is no edit")

      const edited = readLines(applyNoEdit(ch, v, saved, (rows) => scaleWeek(rowOf(rows, id), FLIGHTS[1]!.startDate, 2)))
      const [b1, b2] = edited.get(id)!.bursts
      assert.deepEqual([b1!.cents, b1!.buyAmountCents], [1_200_000, cents(parseBurstMoney(rates[0]))], "burst 1 untouched")
      assert.equal(b2!.buyAmountCents, cents(parseBurstMoney(rates[0])), "the edited cell prices at the row's rate")

      const rerated = readLines(applyNoEdit(ch, v, saved, (rows) => {
        rowOf(rows, id).unitRate = parseBurstMoney(rates[1])
      }))
      assert.deepEqual(rerated.get(id)!.bursts.map((b) => b.buyAmountCents), [cents(parseBurstMoney(rates[1])), cents(parseBurstMoney(rates[1]))])
    })
  }
}

/**
 * A cell that holds several bursts is one group: carried whole while it is
 * untouched, priced from the grid whole once it is edited. Here two bursts in
 * one week (3 and 4 days) beside a two-week burst.
 */
for (const ch of CHANNELS) {
  for (const incl of [false, true]) {
    test(`${ch.name}: two bursts in one week (${incl ? "fee-inclusive" : "fee on top"})`, () => {
      const v: Variant = { incl, fee: 12.5, clientPays: false }
      const bt = ch.buyTypes.find((b) => RATE_PRICED.has(b))!
      const rate = RATES[bt]!.round
      const burst = (budget: string, startDate: string, endDate: string) => {
        const b = { budget, buyAmount: rate }
        return { ...b, calculatedValue: computeLoadedDeliverables(bt, b, incl, v.fee), startDate, endDate }
      }
      const line = {
        ...savedPlan(ch, v).find((l) => l.buyType === bt)!,
        bursts: [
          burst("$3,000.00", "2026-03-01", "2026-03-03"),
          burst("$4,000.00", "2026-03-04", "2026-03-07"),
          burst("$7,777.77", "2026-03-08", "2026-03-21"),
        ],
      }
      const id = line.line_item_id
      const saved = [line]
      assert.equal(summary(movesBetween(saved, applyNoEdit(ch, v, saved))), NO_MOVES)

      const edited = applyNoEdit(ch, v, saved, (rows) => scaleWeek(rowOf(rows, id), "2026-03-01", 2))
      const bursts = readLines(edited).get(id)!.bursts
      const weekOne = bursts.filter((b) => b.dates < "2026-03-08")
      const typed = weekOne.reduce((q, b) => q + b.deliverables, 0)
      const savedQty = saved[0]!.bursts.slice(0, 2).reduce((q: number, b: any) => q + b.calculatedValue, 0)
      assert.ok(Math.abs(typed - 2 * savedQty) < 1e-6, `week one deliverables ${typed}`)
      const r = parseBurstMoney(rate)
      const media = bt === "cpm" ? (typed / 1000) * r : typed * r
      const budget = weekOne.reduce((c, b) => c + b.cents, 0) / 100
      assert.ok(Math.abs(budget * (incl ? 0.875 : 1) - media) <= 0.01 * weekOne.length, `week one ${budget} for ${media} of media`)
      assert.deepEqual(valuesOf(bursts.at(-1)), valuesOf(readLines(saved).get(id)!.bursts.at(-1)), "the two-week burst stays as saved")
    })
  }
}

/** C-344: an OOH span's quantity and rate edits reach the saved line. */
for (const incl of [false, true]) {
  test(`OOH: a ${incl ? "fee-inclusive" : "fee on top"} panels span takes its quantity and rate edits (C-344)`, () => {
    const ch = chan("OOH")
    const v: Variant = { incl, fee: 12.5, clientPays: false }
    const saved = [savedPlan(ch, v).find((l) => l._label === "panels round")!]
    const id = saved[0]!.line_item_id
    const rows = ch.toExpert(saved, COLS, START, END)
    const span = rowOf(rows, id).mergedWeekSpans.find((sp: any) => sp.startYmd === "2026-03-08")
    assert.ok(span, "the two-week burst opens as a span")
    const was = readLines(saved).get(id)!.bursts[1]!

    const fewer = was.deliverables - 1
    const cut = readLines(applyNoEdit(ch, v, saved, (r) => {
      rowOf(r, id).mergedWeekSpans.find((sp: any) => sp.startYmd === "2026-03-08").totalQty = fewer
    })).get(id)!.bursts[1]!
    assert.equal(cut.deliverables, fewer)
    assert.ok(Math.abs((cut.cents / 100) * (incl ? 0.875 : 1) - fewer * 1500) <= 0.01)

    const rerated = readLines(applyNoEdit(ch, v, saved, (r) => {
      rowOf(r, id).unitRate = 3000
    })).get(id)!.bursts[1]!
    assert.equal(rerated.deliverables, was.deliverables)
    assert.ok(Math.abs((rerated.cents / 100) * (incl ? 0.875 : 1) - was.deliverables * 3000) <= 0.01)
  })
}

/**
 * C-361 (V87 A): on the six channels whose import spreads a burst that cannot
 * be a span (OOH, Radio, Cinema, Television, BVOD, Digital Audio), a burst
 * that overlaps a span already on the row goes only into the weeks no span
 * covers, so the grid shows all of it. Line: a two-week burst (Mar 1 to 14,
 * a span over weeks 1 and 2), a burst that overlaps it (Mar 8 to 21, week 3
 * only) and a week 4 burst of its own (a span, a group the edit leaves
 * carried). Every buy type and fee case: no cell under a span holds a
 * quantity, no edit is exact, and once week 3 is edited the grid's money
 * (the carried week 4 plus the edited group) is what Apply saves.
 */
const SPREAD_CHANNELS = ["OOH", "Radio", "Cinema", "Television", "BVOD", "Digital Audio"]
const OVERLAP_FLIGHTS = [
  { startDate: "2026-03-01", endDate: "2026-03-14" },
  { startDate: "2026-03-08", endDate: "2026-03-21" },
  { startDate: "2026-03-22", endDate: "2026-03-28" },
]
/** Week keys some span on the row covers. */
const spanned = (row: any) =>
  new Set<string>(
    (row.mergedWeekSpans ?? []).flatMap((sp: any) => weekKeys.filter((k) => sp.startWeekKey <= k && k <= sp.endWeekKey))
  )
/** Quantity in a cell the grid hides: a week or day cell under a span. */
const hiddenQty = (row: any) => {
  const under = spanned(row)
  const weekOf = (d: string) => [...weekKeys].reverse().find((k) => k <= d)!
  return (
    weekKeys.filter((k) => under.has(k)).reduce((q, k) => q + Number(row.weeklyValues[k] || 0), 0) +
    Object.entries(row.dailyValues ?? {}).reduce((q, [d, v]) => q + (under.has(weekOf(d)) ? Number(v || 0) : 0), 0)
  )
}

for (const name of SPREAD_CHANNELS) {
  const ch = chan(name)
  for (const v of VARIANTS) {
    const key = `${name} | ${variantName(v)}`
    const saved = savedPlan(ch, v).map((l) => ({ ...l, bursts: OVERLAP_FLIGHTS.map((f) => savedBurst(l.buyType, l._label.endsWith("awkward") ? "awkward" : "round", v, f)) }))

    test(`${key}: a burst overlapping a span opens outside it, and no edit returns every line as saved (C-361)`, () => {
      const rows = ch.toExpert(saved, COLS, START, END, ...(ch.toExpertFee ? [{ feePct: v.fee }] : []))
      for (const l of saved) {
        const row = rowOf(rows, l.line_item_id)
        assert.equal(hiddenQty(row), 0, `${l._label}: a cell under the span holds a quantity`)
        assert.ok(spanned(row).size > 0, `${l._label}: the two-week burst opens as a span`)
      }
      const moves = movesBetween(saved, applyNoEdit(ch, v, saved))
      assert.equal(summary(moves), NO_MOVES, moves.sample.join("; "))
    })

    test(`${key}: an edited overlap group saves what the grid's money shows (C-361)`, () => {
      const fee = v.fee
      const opts: Record<string, unknown> = ch.feeOnly ? { [ch.feeKey]: fee } : { [ch.feeKey]: fee, budgetIncludesFees: v.incl }
      const rated = saved.filter((l) => RATE_PRICED.has(l.buyType))
      const rows = ch.toExpert(rated, COLS, START, END, ...(ch.toExpertFee ? [{ feePct: fee }] : []))
      for (const l of rated) {
        const row = rowOf(rows, l.line_item_id)
        const k = weekKeys[2]!
        assert.ok(Number(row.weeklyValues[k]) > 0, `${l._label}: week 3 holds the overlapping burst`)
        row.weeklyValues[k] = Number(row.weeklyValues[k]) + 1
      }
      const applied = readLines(ch.merge(ch.fromExpert(rows, COLS, START, END, opts), rated))
      for (const l of rated) {
        const row = rowOf(rows, l.line_item_id)
        const line = applied.get(l.line_item_id)!
        const saves = line.bursts.reduce((c, b) => c + b.cents, 0)
        assert.ok(
          Math.abs(saves - cents(expertRowCostSplit(row, weekKeys, fee).raw)) <= line.bursts.length,
          `${l._label}: Apply saves ${saves}c, the grid shows ${expertRowCostSplit(row, weekKeys, fee).raw}`
        )
        const qty = line.bursts.reduce((q, b) => q + b.deliverables, 0)
        assert.ok(Math.abs(qty - expertRowQuantitySum(row, weekKeys)) < 1e-6, `${l._label}: deliverables ${qty}`)
      }
    })
  }
}

if (DUMP_FILE) {
  test("dump", async () => {
    const fs = await import("node:fs")
    fs.writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 1))
  })
}
