/**
 * B23 FC2, FC6, FC10: readers merge per day for a fixed-cost line with a
 * fixed cost from date. Before the date: the line's normal actual path.
 * From the date: REPORTED_SPEND (a day with no reported row keeps the actual).
 * A null date, or the switch off: exactly as before.
 */
import assert from "node:assert/strict"
import { describe, it, mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { classifySocialPacingPlatform } from "../../pacing/social/classifySocialPacingPlatform.js"
import {
  indexReportedSpendByLineDate,
  mergeReportedSpendFromDate,
  mergedDailyFromDate,
  mergedSpendInWindow,
  overlayReportedSpendOnActuals,
} from "../programmatic/applyReportedSpend.js"

const skip = mockModuleSkip()

describe("merge helpers", () => {
  it("before the date the actual, from the date the reported row, a missing row keeps the actual", () => {
    const days = [
      { date: "2026-10-13", spend: 50 },
      { date: "2026-10-14", spend: 50 },
      { date: "2026-10-15", spend: 40 },
      { date: "2026-10-16", spend: 40 },
    ]
    mergeReportedSpendFromDate(days, new Map([["2026-10-14", 999], ["2026-10-15", 58.82]]), "2026-10-15")
    assert.deepEqual(
      days.map((d) => d.spend),
      [50, 50, 58.82, 40],
    )
  })

  it("the old overlay turns a missing day into $0 (kept for undated lines)", () => {
    const days = [{ date: "2026-10-13", spend: 50 }, { date: "2026-10-15", spend: 40 }]
    overlayReportedSpendOnActuals(days, new Map([["2026-10-15", 58.82]]))
    assert.deepEqual(days.map((d) => d.spend), [0, 58.82])
  })

  it("window sum in cents, with a date on a daylight saving change day", () => {
    const actual = new Map([["2026-10-03", 0.1], ["2026-10-04", 0.2], ["2026-10-05", 0.7]])
    const reported = new Map([["2026-10-03", 9], ["2026-10-04", 0.105], ["2026-10-06", 1]])
    const out = mergedSpendInWindow({ actualByDate: actual, reportedByDate: reported, fromDay: "2026-10-04" })
    // 0.10 + 0.11 (0.105 half up) + 0.70 (no row: actual) + 1.00
    assert.equal(out.spend, 1.91)
    assert.equal(out.reportedDays, 2)
    const windowed = mergedSpendInWindow({
      actualByDate: actual,
      reportedByDate: reported,
      fromDay: "2026-10-04",
      startDate: "2026-10-04",
      endDate: "2026-10-05",
    })
    assert.equal(windowed.spend, 0.81)
  })

  it("one merged daily series", () => {
    const merged = mergedDailyFromDate(new Map([["a1", 1], ["b2", 2]]), new Map([["a0", 5], ["b2", 7], ["c3", 3]]), "b")
    assert.deepEqual([...merged.entries()].sort(), [["a1", 1], ["b2", 7], ["c3", 3]])
  })
})

type Row = {
  channel: string
  dateDay: string
  lineItemId: string
  amountSpent: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
}

let factRows: Row[] = []
let reportedRows: Array<{ LINE_ITEM_ID: string; DATE_DAY: string; REPORTED_SPEND: number }> = []
const queried: string[][] = []

if (supportsMockModule()) {
  await mock.module!("@/lib/snowflake/pacing-service", {
    namedExports: {
      getCampaignPacingData: async (_mba: string, ids: string[]) =>
        factRows.filter((row) => ids.includes(row.lineItemId)),
    },
  })
  await mock.module!("@/lib/snowflake/search-pacing-service", {
    namedExports: { getSearchPacingData: async () => null },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: {
      queryDailyFacts: async (ids: string[]) => {
        queried.push([...ids].sort())
        return reportedRows.filter((r) => ids.includes(r.LINE_ITEM_ID))
      },
    },
  })
  await mock.module!("@/lib/pacing/social/resolveLiveSocialLineItems", {
    namedExports: { classifySocialPacingPlatform },
  })
}

function dayRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

const OCT = {
  fee: 0,
  budget: "$1,700.00",
  startDate: "2026-09-30T14:00:00.000Z",
  endDate: "2026-10-30T13:00:00.000Z",
  buyAmount: "$13.00",
  calculatedValue: 130769,
}

const pd = {
  line_item_id: "krusty001pd1",
  name: "DV360 display",
  platform: "DV360",
  buy_type: "cpm",
  fixed_cost_media: true,
  fixed_cost_from: "2026-10-15",
  totalMedia: 1700,
  bursts: [OCT],
}

const dd = {
  line_item_id: "krusty001dd1",
  name: "Display",
  publisher: "Nine",
  buy_type: "cpm",
  fixed_cost_media: true,
  fixed_cost_from: "2026-10-15",
  totalMedia: 1700,
  bursts: [OCT],
}

const sm = {
  line_item_id: "krusty001sm1",
  name: "Meta",
  platform: "Meta",
  buy_type: "cpm",
  fixed_cost_media: true,
  fixed_cost_from: "2026-10-15",
  totalMedia: 1700,
  bursts: [OCT],
}

function seed() {
  factRows = [
    // DV360: $50 a day 1 to 20 Oct.
    ...dayRange("2026-10-01", "2026-10-20").map((dateDay) => ({
      channel: "programmatic-display",
      dateDay,
      lineItemId: "krusty001pd1",
      amountSpent: 50,
      impressions: 4000,
      clicks: 4,
      results: 0,
      video3sViews: 0,
    })),
    // CM360: impressions only.
    ...dayRange("2026-10-01", "2026-10-20").map((dateDay) => ({
      channel: "ad-serving",
      dateDay,
      lineItemId: "krusty001dd1",
      amountSpent: 0,
      impressions: 4000,
      clicks: 4,
      results: 0,
      video3sViews: 0,
    })),
    // Meta: $30 a day.
    ...dayRange("2026-10-01", "2026-10-20").map((dateDay) => ({
      channel: "meta",
      dateDay,
      lineItemId: "krusty001sm1",
      amountSpent: 30,
      impressions: 3000,
      clicks: 3,
      results: 0,
      video3sViews: 0,
    })),
  ]
  // Reported rows 15 to 19 Oct only ($60 a day); 20 Oct has none yet.
  reportedRows = ["krusty001pd1", "krusty001dd1", "krusty001sm1"].flatMap((id) =>
    dayRange("2026-10-15", "2026-10-19").map((day) => ({ LINE_ITEM_ID: id, DATE_DAY: day, REPORTED_SPEND: 60 })),
  )
}

function linesById(snap: { channels: Array<{ lines: Array<{ lineItemId: string }> }> }) {
  return new Map(
    snap.channels.flatMap((ch) => ch.lines).map((line) => [line.lineItemId, line as Record<string, unknown>]),
  )
}

const OFF = { packageNoUnitTarget: false, fixedCostReportNet: false, fixedCostFromDate: false }
const ON = { packageNoUnitTarget: false, fixedCostReportNet: true, fixedCostFromDate: true }

describe("loadDeliverySnapshot (decks, Ava, campaign strip, client totals)", () => {
  test("switch off: the dated line is whole-line reported, as before (missing days are $0)", { skip }, async () => {
    const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
    seed()
    const snap = await loadDeliverySnapshot({
      mbaNumber: "krusty001",
      versionNumber: 1,
      lineItemsByChannel: { progDisplay: [pd], digitalDisplay: [dd], socialMedia: [sm] },
      feePctsByVersionId: {},
      deliveryFlags: OFF,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    })
    const byId = linesById(snap)
    assert.equal(byId.get("krusty001pd1")?.spendToDate, 300)
    assert.equal(byId.get("krusty001pd1")?.spendMode, "reported")
    assert.equal(byId.get("krusty001dd1")?.spendToDate, 300)
    // Social never read the flag: platform spend.
    assert.equal(byId.get("krusty001sm1")?.spendToDate, 600)
  })

  test("switch off and no date give the same snapshot", { skip }, async () => {
    const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
    seed()
    const undated = [pd, dd, sm].map(({ fixed_cost_from: _d, ...rest }) => rest)
    const a = await loadDeliverySnapshot({
      mbaNumber: "krusty001",
      versionNumber: 1,
      lineItemsByChannel: { progDisplay: [pd], digitalDisplay: [dd], socialMedia: [sm] },
      feePctsByVersionId: {},
      deliveryFlags: OFF,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    })
    const b = await loadDeliverySnapshot({
      mbaNumber: "krusty001",
      versionNumber: 1,
      lineItemsByChannel: { progDisplay: [undated[0]!], digitalDisplay: [undated[1]!], socialMedia: [undated[2]!] },
      feePctsByVersionId: {},
      deliveryFlags: ON,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    })
    const strip = (s: typeof a) => JSON.stringify({ ...s, asOf: null })
    assert.equal(strip(b), strip(a))
  })

  test("switch on: actual before the date, reported from it, the actual on a day with no row", { skip }, async () => {
    const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
    seed()
    queried.length = 0
    const snap = await loadDeliverySnapshot({
      mbaNumber: "krusty001",
      versionNumber: 1,
      lineItemsByChannel: { progDisplay: [pd], digitalDisplay: [dd], socialMedia: [sm] },
      feePctsByVersionId: {},
      deliveryFlags: ON,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    })
    const byId = linesById(snap)
    // DV360: 14 x $50 + 5 x $60 + 20 Oct actual $50.
    assert.equal(byId.get("krusty001pd1")?.spendToDate, 700 + 300 + 50)
    assert.equal(byId.get("krusty001pd1")?.spendMode, "reported")
    // CM360: the estimate before the date (rate $1,700 / 130,769 imps).
    const rate = 1700 / 130769
    let est = 0
    for (let i = 0; i < 14; i++) est += Math.round(4000 * rate * 100) / 100
    const estDay20 = Math.round(4000 * rate * 100) / 100
    assert.equal(byId.get("krusty001dd1")?.spendToDate, Math.round((est + 300 + estDay20) * 100) / 100)
    // FC10: social honours the date too.
    assert.equal(byId.get("krusty001sm1")?.spendToDate, 14 * 30 + 300 + 30)
    // The social line's reported rows were read.
    assert.ok(queried.some((ids) => ids.includes("krusty001sm1")))
  })

  test("switch on, a future date: all actual, labelled as before the switch", { skip }, async () => {
    const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")
    seed()
    const later = { ...pd, fixed_cost_from: "2026-10-25" }
    const snap = await loadDeliverySnapshot({
      mbaNumber: "krusty001",
      versionNumber: 1,
      lineItemsByChannel: { progDisplay: [later] },
      feePctsByVersionId: {},
      deliveryFlags: ON,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    })
    const line = linesById(snap).get("krusty001pd1")
    assert.equal(line?.spendToDate, 1000)
    assert.equal(line?.spendMode, "actual")
  })
})

describe("browser dashboard compute", () => {
  test("programmatic: switch on merges per day; off keeps the whole-line overlay", async () => {
    const { buildProgrammaticLineItemMetrics, normalizeProgrammaticLineItems, mapCombinedRowToDv360 } = await import(
      "../programmatic/programmaticCompute.js"
    )
    seed()
    const items = normalizeProgrammaticLineItems([pd])
    const rows = factRows
      .filter((r) => r.lineItemId === "krusty001pd1")
      .map((r) => mapCombinedRowToDv360(r as never, new Set(["programmatic-display"])))
    const range = dayRange("2026-10-01", "2026-10-31")
    const reported = indexReportedSpendByLineDate(
      reportedRows.map((r) => ({ lineItemId: r.LINE_ITEM_ID, dateDay: r.DATE_DAY, reportedSpend: r.REPORTED_SPEND })),
    )
    const run = (on: boolean | undefined) =>
      buildProgrammaticLineItemMetrics(
        items,
        rows,
        range,
        "2026-10-31",
        "progdisplay",
        undefined,
        { startISO: "2026-10-01", endISO: "2026-10-31" },
        undefined,
        undefined,
        undefined,
        reported,
        on === undefined ? undefined : { fixedCostFromDate: on },
      )
    const sum = (m: ReturnType<typeof run>) => m[0]!.actualsDaily.reduce((s, d) => s + d.spend, 0)
    assert.equal(sum(run(true)), 1050)
    assert.equal(sum(run(false)), 300)
    assert.equal(sum(run(undefined)), 300)
    assert.deepEqual(run(undefined), run(false))
  })

  test("social: switch on merges a dated line; off and undated are platform spend", async () => {
    const { computeSocialLineMetricsForPlatform, normalizeLineItems, mapCombinedRowToMeta } = await import(
      "../social/socialChannelCompute.js"
    )
    const { getPacingWindow } = await import("../../pacing/pacingWindow.js")
    seed()
    const reported = indexReportedSpendByLineDate(
      reportedRows.map((r) => ({ lineItemId: r.LINE_ITEM_ID, dateDay: r.DATE_DAY, reportedSpend: r.REPORTED_SPEND })),
    )
    const socialRows = factRows.filter((r) => r.lineItemId === "krusty001sm1").map((r) => mapCombinedRowToMeta(r as never))
    const run = (item: Record<string, unknown>, on: boolean) =>
      computeSocialLineMetricsForPlatform({
        activeItems: normalizeLineItems([item as never]),
        socialRows,
        campaignStart: "2026-10-01",
        campaignEnd: "2026-10-31",
        mbaNumber: "krusty001",
        kpiTargets: undefined,
        filterRange: { start: null, end: null } as never,
        pacingWindow: getPacingWindow("2026-10-01", "2026-10-31"),
        reportedSpendByLineDate: reported,
        fixedCostFromDate: on,
      })
    const sum = (m: ReturnType<typeof run>) => m[0]!.actualsDaily.reduce((s, d) => s + d.spend, 0)
    assert.equal(sum(run(sm, true)), 14 * 30 + 300 + 30)
    assert.equal(sum(run(sm, false)), 600)
    const { fixed_cost_from: _d, ...undated } = sm
    assert.equal(sum(run(undated, true)), 600)
  })
})

describe("browser direct digital adapter", () => {
  test("dated CM360 line: estimate before the date, reported from it; off and unset are identical", async () => {
    const { buildDirectDigitalChannelSection } = await import(
      "../../../components/dashboard/delivery/channels/directDigitalAdapterShared.js"
    )
    const line = {
      line_item_id: "krusty001dd1",
      buy_type: "cpm",
      publisher: "Nine",
      budget_includes_fees: false,
      client_pays_for_media: false,
      fixed_cost_media: true,
      fixed_cost_from: "2026-10-15",
      totalMedia: 1300,
      bursts_json: [{ budget: "1300", calculatedValue: 100000, startDate: "2026-09-30T14:00:00.000Z", endDate: "2026-10-30T13:00:00.000Z" }],
    }
    const pacingRow = (dateDay: string, impressions: number) => ({
      channel: "ad-serving",
      dateDay,
      adsetName: null,
      entityName: "Placement",
      campaignId: null,
      campaignName: null,
      adsetId: null,
      entityId: "plc-1",
      lineItemId: "krusty001dd1",
      amountSpent: 0,
      impressions,
      clicks: 1,
      results: 0,
      video3sViews: 0,
      maxFivetranSyncedAt: null,
      updatedAt: null,
    })
    // 10,000 impressions on 10 Oct at a $13 CPM = $130 estimated; reported $77 on 16 Oct.
    const rows = [pacingRow("2026-10-10", 10_000), pacingRow("2026-10-16", 5_000)]
    const reported = new Map([["krusty001dd1", new Map([["2026-10-16", 77], ["2026-10-09", 999]])]])
    const build = (fixedCostFromDate?: boolean) =>
      buildDirectDigitalChannelSection({
        key: "digital-display",
        title: "Digital Display",
        lineItems: [line],
        combinedRows: rows as never,
        campaignStart: "2026-10-01",
        campaignEnd: "2026-10-31",
        mbaNumber: "krusty001",
        filterRange: { start: null, end: null },
        kpiVersionNumber: 1,
        lineItemTargets: undefined,
        lastSyncedAt: null,
        pacingAsAtISO: "2026-10-20",
        reportedSpendByLineDate: reported,
        ...(fixedCostFromDate === undefined ? {} : { fixedCostFromDate }),
      })
    const off = JSON.stringify(build(false))
    assert.equal(JSON.stringify(build(undefined)), off)
    const on = JSON.stringify(build(true))
    assert.notEqual(on, off)
    // Off: whole-line reported, $999 + $77. On: $130 estimated before, $77 reported from the date.
    assert.match(off, /1,076/)
    assert.match(on, /\$207/)
  })
})

describe("hub Delivered: a social or search fixed-cost line is counted once (FC10)", () => {
  test("switch on excludes platform social and search ids from the Direct leg; plan-only social stays", async () => {
    const { programmaticLineItemIdsFromSnapshot } = await import("../deliveredTotals.js")
    const snapshot = {
      channels: [
        { group: "programmatic_display", lines: [{ lineItemId: "bicau001pd1" }] },
        { group: "social_meta", lines: [{ lineItemId: "bicau001sm1" }] },
        { group: "social_tiktok", lines: [{ lineItemId: "BICAU001SM2" }] },
        { group: "search", lines: [{ lineItemId: "bicau001se1" }] },
        { group: "plan_only", lines: [{ lineItemId: "buxton001sm1" }] },
        { group: "assumed_spend", lines: [{ lineItemId: "bicau001tv1" }] },
      ],
    }
    assert.deepEqual([...programmaticLineItemIdsFromSnapshot(snapshot)], ["bicau001pd1"])
    assert.deepEqual(
      [...programmaticLineItemIdsFromSnapshot(snapshot, { excludePlatformSocialAndSearch: false })],
      ["bicau001pd1"],
    )
    assert.deepEqual(
      [...programmaticLineItemIdsFromSnapshot(snapshot, { excludePlatformSocialAndSearch: true })].sort(),
      ["bicau001pd1", "bicau001se1", "bicau001sm1", "bicau001sm2"],
    )
  })
})
