import assert from "node:assert/strict"
import { test } from "node:test"

import { resolvePacingWindowISO } from "@/lib/pacing/expectedForWindow"
import {
  applyConversionsToSection,
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

test("revenue tiles say not tracked when no event counts toward revenue", () => {
  const out = applyConversionsToSection(
    section("social-meta", ["curatif004sm1"]),
    { ...CONV, valuePlatforms: [] },
    { window: WINDOW, spendByLine: new Map() },
  )
  const revenue = out.aggregate.kpiBand.tiles.find((t) => t.label === "Revenue")
  assert.equal(revenue?.value, null)
  assert.equal(revenue?.emptyHint, "not-tracked")
})
