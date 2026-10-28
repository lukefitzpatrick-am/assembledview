/**
 * golf025 News Corp (Direct Booked Digital, CM360), published version 19590.
 * DD1, DD2, DD7 and DD8 are CM360 click trackers: clicks, no impressions.
 * Pacing compares delivered with what was expected to Melbourne yesterday,
 * here fixed at 19 Oct 2026. Click trackers drop out of expected and planned
 * impressions and CPM, and say "No impression tracking" (REP-5, Luke 28 Oct
 * 2026, option c).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

const AS_AT = "2026-10-19"
const START = "2026-10-01T14:00:00.000Z" // 2 Oct, Sydney
const END = "2026-12-02T13:00:00.000Z" // 3 Dec, Sydney

const LINES = [
  { id: "golf025DD1", budget: "3600.01", cv: 138462, start: START },
  { id: "golf025DD2", budget: "2514.75", cv: 127072, start: START },
  { id: "golf025DD3", budget: "9947", cv: 580000, start: START },
  { id: "golf025DD4", budget: "10198.18", cv: 594646, start: START },
  { id: "golf025DD7", budget: "15523.55", cv: 711111, start: "2026-10-31T13:00:00.000Z" },
  { id: "golf025DD8", budget: "15523.55", cv: 711111, start: "2026-10-31T13:00:00.000Z" },
].map((l) => ({
  line_item_id: l.id,
  buy_type: "cpm",
  publisher: "News Corp",
  budget_includes_fees: false,
  client_pays_for_media: false,
  fixed_cost_media: false,
  totalMedia: Number(l.budget),
  bursts_json: [{ budget: l.budget, calculatedValue: l.cv, startDate: l.start, endDate: END }],
}))

// CM360 to 19 Oct (PACING_FACT, summed per line onto one day).
const FACTS: Array<[string, number, number]> = [
  ["golf025dd1", 0, 136],
  ["golf025dd2", 0, 167],
  ["golf025dd3", 262_025, 868],
  ["golf025dd4", 110_698, 315],
  ["golf025dd7", 0, 114],
  ["golf025dd8", 0, 298],
]

function row(lineItemId: string, impressions: number, clicks: number, dateDay = "2026-10-15"): PacingRow {
  return {
    channel: "ad-serving",
    dateDay,
    adsetName: null,
    entityName: "Placement",
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: `plc-${lineItemId}`,
    lineItemId,
    amountSpent: 0,
    impressions,
    clicks,
    results: 0,
    video3sViews: 0,
    maxFivetranSyncedAt: null,
    updatedAt: null,
  }
}

function build(extraRows: PacingRow[] = [], filterRange = { start: null as Date | null, end: null as Date | null }) {
  const section = buildDirectDigitalChannelSection({
    key: "digital-display",
    title: "Digital Display",
    lineItems: LINES,
    combinedRows: [...FACTS.map(([id, i, c]) => row(id, i, c)), ...extraRows],
    campaignStart: "2026-04-09",
    campaignEnd: "2026-12-06",
    mbaNumber: "golf025",
    filterRange,
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
    pacingAsAtISO: AS_AT,
  })
  assert.ok(section)
  return section
}

const EXPECTED_IMPRESSIONS = ((580_000 + 594_646) * 18) / 63

test("golf025 News Corp impressions compare with expected to yesterday, trackers left out", () => {
  const section = build()
  const card = section.aggregate.progressCards.find((c) => c.title === "Impressions delivery")
  assert.ok(card)
  assert.equal(card.value, "372,723")
  assert.ok(Math.abs((card.expected ?? 0) - EXPECTED_IMPRESSIONS) < 1e-6)
  // Click trackers DD1, DD2, DD7 and DD8 are out of the plan total too.
  assert.equal(card.plannedTotal, 580_000 + 594_646)
  assert.equal(card.status, "ahead")
  assert.ok(Math.abs((card.pct ?? 0) - (372_723 / EXPECTED_IMPRESSIONS) * 100) < 1e-6)
  assert.equal(card.progress, 1)
  assert.equal(card.varianceLabel, "vs expected to date")
  assert.match(card.detail, /Expected 335,613 to date/)
  assert.match(card.detail, /No impression tracking on 4 click-tracker lines/)
})

test("a click-tracker line says No impression tracking and has no pace", () => {
  const section = build()
  const dd1 = section.lineItems.find((l) => l.id === "golf025dd1")
  assert.ok(dd1)
  const card = dd1.block.progressCards.find((c) => c.title === "Impressions delivery")
  assert.ok(card)
  assert.equal(card.status, "no-data")
  assert.equal(card.expected, 0)
  assert.match(card.detail, /No impression tracking \(click tracker\)/)
  assert.equal(card.varianceLabel, "no impression tracking")
})

test("a click tracker stays a click tracker in a window where it has no rows", () => {
  // 1 to 10 Oct holds only a DD3 row; the trackers' clicks sit on 15 Oct.
  const section = build([row("golf025dd3", 1_000, 1, "2026-10-05")], {
    start: new Date(2026, 9, 1),
    end: new Date(2026, 9, 10),
  })
  const card = section.aggregate.progressCards.find((c) => c.title === "Impressions delivery")
  assert.ok(card)
  // DD3 and DD4 only: 2 to 10 Oct is 9 of 63 burst days.
  assert.ok(Math.abs((card.expected ?? 0) - ((580_000 + 594_646) * 9) / 63) < 1e-6)
  assert.equal(card.plannedTotal, 580_000 + 594_646)
  assert.match(card.detail, /No impression tracking on 4 click-tracker lines/)
})

test("CPM leaves click-tracker spend out", () => {
  const cpcTracker = {
    ...LINES[0]!,
    line_item_id: "golf025DD9",
    buy_type: "cpc",
    totalMedia: 1000,
    bursts_json: [{ budget: "1000", calculatedValue: 1000, startDate: START, endDate: END }],
  }
  const section = buildDirectDigitalChannelSection({
    key: "digital-display",
    title: "Digital Display",
    lineItems: [LINES[2]!, cpcTracker],
    combinedRows: [row("golf025dd3", 262_025, 868), row("golf025dd9", 0, 500)],
    campaignStart: "2026-04-09",
    campaignEnd: "2026-12-06",
    mbaNumber: "golf025",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
    pacingAsAtISO: AS_AT,
  })
  assert.ok(section)
  const tile = section.aggregate.kpiBand.tiles.find((t) => t.label === "CPM")
  assert.ok(tile)
  // DD3 estimate: 262,025 × 9,947 / 580,000 = $4,493.67; CPM = $17.15.
  // With the tracker's $500 of CPC spend it would read $19.06.
  assert.equal(tile.value, "$17.15")
})

test("today's delivery does not count against expected to yesterday", () => {
  const section = build([row("golf025dd3", 50_000, 10, "2026-10-20")])
  const card = section.aggregate.progressCards.find((c) => c.title === "Impressions delivery")
  assert.equal(card?.value, "372,723")
})

test("a date filter windows both delivered and expected, stopping at yesterday", () => {
  const section = build([row("golf025dd3", 1_000, 1, "2026-10-05")], {
    start: new Date(2026, 9, 10),
    end: new Date(2026, 9, 31),
  })
  const card = section.aggregate.progressCards.find((c) => c.title === "Impressions delivery")
  assert.ok(card)
  // 10 to 19 Oct is 10 of 63 burst days; the 5 Oct row sits outside the filter.
  assert.ok(Math.abs((card.expected ?? 0) - ((580_000 + 594_646) * 10) / 63) < 1e-6)
  assert.equal(card.value, "372,723")
  assert.equal(card.varianceLabel, "vs expected in period")
  assert.match(card.detail, /in period/)
})
