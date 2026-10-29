import assert from "node:assert/strict"
import { test } from "node:test"

import { formatMoneyCompact } from "@/lib/format/money"
import { resolvePacingWindowISO } from "@/lib/pacing/expectedForWindow"
import {
  applyConversionsToSection,
  campaignConversionStripCells,
  campaignConversionSummary,
  campaignConversionSummaryKey,
  conversionKpiTiles,
  mergeConversionTiles,
  spendByLineFromDelivery,
  type DeliveryConversions,
} from "../conversionTiles"
import type { ChannelSectionData } from "../types"

const tile = (label: string) => ({ label, value: "x" })

function section(key: ChannelSectionData["key"], lineIds: string[]): ChannelSectionData {
  const tiles = ["CPM", "CTR", "CPC", "CVR", "CPA", "View rate"].map(tile)
  return {
    key,
    title: key,
    dateRange: { startISO: "2026-10-01", endISO: "2026-10-31" },
    lastSyncedAt: null,
    connections: [],
    mediaTypeColour: "var(--channel-sentinel)",
    aggregate: {
      summaryChips: [],
      progressCards: [{} as never, {} as never],
      kpiBand: { tiles },
      chart: { daily: [], series: [], asAtDate: null },
    },
    lineItems: lineIds.map((id) => ({ id, block: { kpiBand: { tiles } } as never })),
  }
}

const WINDOW = resolvePacingWindowISO({
  campaignStartISO: "2026-10-01",
  campaignEndISO: "2026-10-31",
  asAtISO: "2026-10-20",
})

const CONV: DeliveryConversions = {
  headline: "purchases",
  showRevenue: true,
  trackedPlatforms: ["meta_ads"],
  valuePlatforms: ["meta_ads"],
  lines: [
    {
      lineItemId: "curatif004sm1",
      daily: [
        { date: "2026-10-05", conversions: 5, purchases: 4, leads: 1, revenue: 400 },
        // Today: outside the window (to yesterday), never counted.
        { date: "2026-10-21", conversions: 9, purchases: 9, leads: 0, revenue: 9000 },
      ],
    },
  ],
}

test("social tiles: headline replaces CVR's slot, revenue tiles go last", () => {
  const out = mergeConversionTiles(["CPM", "CTR", "CPC", "CVR", "CPA", "View rate"].map(tile), {
    core: ["Purchases", "CVR", "CPA"].map(tile),
    revenue: ["Revenue", "ROAS"].map(tile),
  })
  assert.deepEqual(out.map((t) => t.label), ["CPM", "CTR", "CPC", "Purchases", "CVR", "CPA", "View rate", "Revenue", "ROAS"])
})

test("Meta section counts chosen purchases to yesterday with CPA and ROAS", () => {
  const spendByLine = spendByLineFromDelivery({
    rows: [
      { lineItemId: "CURATIF004SM1", dateDay: "2026-10-05", amountSpent: 100, clicks: 200 },
      { lineItemId: "curatif004sm1", dateDay: "2026-10-21", amountSpent: 50, clicks: 10 },
    ],
  })
  const out = applyConversionsToSection(section("social-meta", ["curatif004sm1"]), CONV, { window: WINDOW, spendByLine })
  const tiles = out.lineItems[0]!.block.kpiBand.tiles
  const get = (l: string) => tiles.find((t) => t.label === l)?.value
  assert.equal(get("Purchases"), "4")
  assert.equal(get("CVR"), "2.00%")
  assert.equal(get("CPA"), "$25.00")
  assert.equal(get("ROAS"), "4.00x")
  assert.equal(out.aggregate.kpiBand.tiles.find((t) => t.label === "Purchases")?.value, "4")
})

test("OOH and direct digital sections are untouched", () => {
  for (const key of ["programmatic-ooh", "digital-display", "assumed-spend", "plan-only"] as const) {
    const s = section(key, ["x1"])
    assert.equal(applyConversionsToSection(s, CONV, { window: WINDOW, spendByLine: new Map() }), s)
  }
})

test("switch off (null) leaves every section as it was", () => {
  const s = section("social-meta", ["curatif004sm1"])
  assert.equal(applyConversionsToSection(s, null, { window: WINDOW, spendByLine: new Map() }), s)
})

const KPI_INPUT = {
  totals: { conversions: 5, purchases: 4, leads: 1, revenue: 400 },
  spend: 100,
  clicks: 200,
  headline: "purchases" as const,
  showRevenue: true,
  tracked: true,
  valueTracked: true,
}

test("kpi tiles: show revenue on and an event counts toward revenue gives Revenue and ROAS", () => {
  const out = conversionKpiTiles(KPI_INPUT)
  assert.deepEqual(out.core.map((t) => t.label), ["Purchases", "CVR", "CPA"])
  assert.deepEqual(out.revenue.map((t) => t.label), ["Revenue", "ROAS"])
  assert.equal(out.revenue[1]!.value, "4.00x")
})

test("kpi tiles: no event counts toward revenue gives no Revenue or ROAS tiles", () => {
  const out = conversionKpiTiles({ ...KPI_INPUT, valueTracked: false })
  assert.deepEqual(out.core.map((t) => t.label), ["Purchases", "CVR", "CPA"])
  assert.equal(out.core[0]!.value, "4")
  assert.deepEqual(out.revenue, [])
})

test("kpi tiles: show revenue off gives no Revenue or ROAS tiles", () => {
  const out = conversionKpiTiles({ ...KPI_INPUT, showRevenue: false })
  assert.deepEqual(out.core.map((t) => t.label), ["Purchases", "CVR", "CPA"])
  assert.deepEqual(out.revenue, [])
})

test("kpi tiles: section with no chosen event gives no Revenue or ROAS tiles", () => {
  const out = conversionKpiTiles({ ...KPI_INPUT, tracked: false })
  assert.deepEqual(out.core.map((t) => t.value), [null, null, null])
  assert.deepEqual(out.revenue, [])
})

test("section: no Revenue or ROAS tiles when no event counts toward revenue", () => {
  const out = applyConversionsToSection(
    section("social-meta", ["curatif004sm1"]),
    { ...CONV, valuePlatforms: [] },
    { window: WINDOW, spendByLine: new Map() },
  )
  for (const tiles of [out.aggregate.kpiBand.tiles, out.lineItems[0]!.block.kpiBand.tiles]) {
    const labels = tiles.map((t) => t.label)
    assert.ok(labels.includes("Purchases"))
    assert.ok(!labels.includes("Revenue"))
    assert.ok(!labels.includes("ROAS"))
  }
})

test("campaign summary: counts tracked sections to yesterday, ROAS on revenue-section spend only", () => {
  const conv: DeliveryConversions = {
    ...CONV,
    trackedPlatforms: ["meta_ads", "dv360"],
    lines: [
      ...CONV.lines,
      { lineItemId: "curatif004pd1", daily: [{ date: "2026-10-06", conversions: 3, purchases: 3, leads: 0, revenue: 0 }] },
    ],
  }
  const spendByLine = spendByLineFromDelivery({
    rows: [
      { lineItemId: "curatif004sm1", dateDay: "2026-10-05", amountSpent: 100, clicks: 200 },
      { lineItemId: "curatif004sm1", dateDay: "2026-10-21", amountSpent: 50, clicks: 10 },
      { lineItemId: "curatif004pd1", dateDay: "2026-10-06", amountSpent: 900, clicks: 5 },
      { lineItemId: "curatif004oh1", dateDay: "2026-10-06", amountSpent: 5000, clicks: 0 },
    ],
  })
  const sections = [
    section("social-meta", ["curatif004sm1"]),
    section("programmatic-display", ["curatif004pd1"]),
    section("programmatic-ooh", ["curatif004oh1"]),
  ]
  const s = campaignConversionSummary(sections, conv, { window: WINDOW, spendByLine })
  assert.ok(s)
  assert.equal(s.label, "Purchases")
  assert.equal(s.count, 7)
  assert.equal(s.revenue, 400)
  // Only Meta can carry revenue here: DV360 and OOH spend never dilute ROAS.
  assert.equal(s.roasSpend, 100)
  assert.equal(s.roas, 4)
  const cells = campaignConversionStripCells(s)!
  assert.deepEqual(cells.map((c) => c.label), ["Purchases", "Revenue", "ROAS"])
  assert.equal(cells[0]!.value, "7")
  assert.equal(cells[1]!.value, formatMoneyCompact(400))
  assert.equal(cells[2]!.value, "4.00x")
})

test("campaign summary: a line in two sections is counted once", () => {
  const s = campaignConversionSummary(
    [section("social-meta", ["curatif004sm1"]), section("social-meta", ["CURATIF004SM1"])],
    CONV,
    { window: WINDOW, spendByLine: new Map() },
  )
  assert.equal(s?.count, 4)
  assert.equal(s?.roas, null)
})

test("campaign summary: switch off gives null and no strip cells", () => {
  const s = campaignConversionSummary([section("social-meta", ["curatif004sm1"])], null, {
    window: WINDOW,
    spendByLine: new Map(),
  })
  assert.equal(s, null)
  assert.equal(campaignConversionStripCells(s), null)
  assert.equal(campaignConversionSummaryKey(s), "off")
})

test("campaign summary: no revenue cells when show revenue is off; dash and no revenue cells when nothing is tracked", () => {
  const noRevenue = campaignConversionSummary([section("social-meta", ["curatif004sm1"])], { ...CONV, showRevenue: false }, {
    window: WINDOW,
    spendByLine: new Map(),
  })
  assert.deepEqual(campaignConversionStripCells(noRevenue), [{ key: "conversions", label: "Purchases", value: "4" }])

  const untracked = campaignConversionSummary([section("search", ["curatif004se1"])], CONV, {
    window: WINDOW,
    spendByLine: new Map(),
  })
  assert.equal(untracked?.tracked, false)
  assert.deepEqual(campaignConversionStripCells(untracked), [{ key: "conversions", label: "Purchases", value: "—" }])
})

test("campaign summary: no Revenue or ROAS cells when no section's event counts toward revenue", () => {
  // Hema case: show revenue on, events chosen on Meta and Google, none count toward revenue.
  const conv: DeliveryConversions = { ...CONV, trackedPlatforms: ["meta_ads", "google_ads"], valuePlatforms: [] }
  const s = campaignConversionSummary([section("social-meta", ["curatif004sm1"]), section("search", ["curatif004se1"])], conv, {
    window: WINDOW,
    spendByLine: new Map(),
  })
  assert.equal(s?.showRevenue, true)
  assert.equal(s?.valueTracked, false)
  assert.deepEqual(campaignConversionStripCells(s), [{ key: "conversions", label: "Purchases", value: "4" }])
})

test("campaign summary: a revenue platform with no section on the campaign adds no revenue cells", () => {
  // Google counts toward revenue, but this campaign only has Meta.
  const conv: DeliveryConversions = { ...CONV, trackedPlatforms: ["meta_ads", "google_ads"], valuePlatforms: ["google_ads"] }
  const s = campaignConversionSummary([section("social-meta", ["curatif004sm1"])], conv, {
    window: WINDOW,
    spendByLine: new Map(),
  })
  assert.equal(s?.valueTracked, false)
  assert.deepEqual(campaignConversionStripCells(s)?.map((c) => c.label), ["Purchases"])
})

test("campaign summary key: changes with whole cents of revenue and ROAS spend only", () => {
  const base = {
    headline: "purchases",
    count: 3,
    tracked: true,
    showRevenue: true,
    valueTracked: true,
    revenue: 1234.5,
    roasSpend: 100.004,
    roas: 12.34,
  } as unknown as Parameters<typeof campaignConversionSummaryKey>[0]
  const key = campaignConversionSummaryKey(base)
  assert.equal(key, "purchases|3|1|1|1|123450|10000")
  assert.equal(campaignConversionSummaryKey({ ...base!, roasSpend: 100.001 }), key)
  assert.notEqual(campaignConversionSummaryKey({ ...base!, roasSpend: 100.01 }), key)
})
