/**
 * B30 H1 (hotfix HF2 on main): a Direct Booked Digital section that has
 * delivery also shows its assume-spend lines (no delivery source,
 * `no_adserving`, no delivery of their own), labelled Assumed spend, and its
 * Spend total counts them, as the hub does per line. A section with no such
 * line keeps the 9bc95017 output (production main, pinned).
 *
 * Troye Holiday FY27 (PENFOLD020, published version 16999): PENFOLD020DV1 UMG
 * Popsta, cpv, $20,000, assumed; PENFOLD020DV2 Channel Factory, cpv, $30,000,
 * partner-file rows (HF1).
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import { buildAssumedSpendSection } from "../assumedSpendAdapter"
import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import { channelCoverage } from "@/lib/delivery/channelCoverage"
import { estimateDirectDigitalSpend } from "@/lib/delivery/estimateDirectDigitalSpend"
import { formatMoney } from "@/lib/format/money"
import { assumedSpendForBurst } from "@/lib/spend/assumedSpend"
import { assumedExpectedLinesForDelivery } from "@/lib/spend/assumedExpectedLines"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

type SectionInput = Parameters<typeof buildDirectDigitalChannelSection>[0]
const build = (input: Record<string, unknown>) =>
  buildDirectDigitalChannelSection(input as unknown as SectionInput)

const BURST_START = "2026-10-19T13:00:00.000Z"
const BURST_END = "2026-12-23T13:00:00.000Z"

function line(id: string, publisher: string, budget: string, cv: number, extra: Record<string, unknown> = {}) {
  return {
    line_item_id: id,
    buy_type: "cpv",
    publisher,
    platform: "",
    no_adserving: true,
    budget_includes_fees: false,
    client_pays_for_media: false,
    fixed_cost_media: false,
    bursts_json: [{ fee: 0, budget, buyAmount: "$0.07", calculatedValue: cv, startDate: BURST_START, endDate: BURST_END }],
    ...extra,
  }
}

const DV1 = line("PENFOLD020DV1", "UMG Popsta", "$20,000.00", 285714)
const DV2 = line("PENFOLD020DV2", "Channel Factory", "$30,000.00", 428571)

function row(channel: PacingRow["channel"], lineItemId: string, dateDay: string, impressions: number, completes: number, clicks = 0): PacingRow {
  return {
    channel,
    dateDay,
    adsetName: null,
    entityName: `ent-${lineItemId}`,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: `ent-${lineItemId}`,
    lineItemId,
    amountSpent: 0,
    impressions,
    clicks,
    results: 0,
    video3sViews: completes,
    maxFivetranSyncedAt: null,
    updatedAt: null,
  }
}

const CF_ROWS: PacingRow[] = [
  row("programmatic-video", "penfold020dv2", "2026-10-20", 10_000, 7_000),
  row("programmatic-video", "penfold020dv2", "2026-10-21", 12_000, 9_000, 3),
  row("programmatic-video", "penfold020dv2", "2026-11-03", 20_000, 15_000, 5),
]

const COMMON = {
  campaignStart: "2026-10-01",
  campaignEnd: "2027-01-04",
  mbaNumber: "PENFOLD020",
  filterRange: { start: null, end: null },
  kpiVersionNumber: 29,
  lineItemTargets: undefined,
  lastSyncedAt: null,
  asOfDate: "2026-11-08",
  pacingAsAtISO: "2026-11-07",
  packageNoUnitTarget: false,
  fixedCostFromDate: false,
}

function troye(lineItems: unknown[], rows: PacingRow[] = CF_ROWS, extra: Record<string, unknown> = {}) {
  return build({ key: "digital-video", title: "Digital Video", lineItems, combinedRows: rows, ...COMMON, ...extra })
}

/** DV1 alone, as the Assumed spend section renders it with no delivery in the container. */
function assumedOnly(window?: { filterRange?: { start: Date | null; end: Date | null } }) {
  const section = troye([DV1], [], window ?? {})
  assert.ok(section)
  assert.equal(section.title, "Assumed spend")
  return section
}

/** Hub oracle: the burst's assumed cents through the pacing as-at (same helper as `assumedSpendDollars`). */
function hubAssumed(asOf: string, fromISO?: string): number {
  const days = assumedSpendForBurst({
    rawBudget: 20_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 0,
    buyType: "cpv",
    startDate: BURST_START,
    endDate: BURST_END,
    asOfDate: asOf,
  })
  return days.filter((d) => !fromISO || d.date >= fromISO).reduce((sum, d) => sum + d.cents, 0) / 100
}

function dv2Estimate(): number {
  const est = estimateDirectDigitalSpend({
    lineItemId: "penfold020dv2",
    buyType: "cpv",
    budgetIncludesFees: false,
    bursts: DV2.bursts_json,
    days: [
      { date: "2026-10-20", impressions: 10_000, clicks: 0, results: 0, video3sViews: 7_000 },
      { date: "2026-10-21", impressions: 12_000, clicks: 3, results: 0, video3sViews: 9_000 },
      { date: "2026-11-03", impressions: 20_000, clicks: 5, results: 0, video3sViews: 15_000 },
    ],
  })
  return est.amount ?? 0
}

function chips(section: NonNullable<ReturnType<typeof troye>>) {
  return new Map(section.aggregate.summaryChips.map((c) => [c.label, c.value]))
}

test("B30: Troye DV1 assumed spend shows beside DV2 delivery", () => {
  const section = troye([DV1, DV2])
  assert.ok(section)
  assert.equal(section.title, "Digital Video")
  assert.deepEqual(section.lineItems.map((l) => [l.id, l.basis ?? null]), [
    ["penfold020dv2", null],
    ["penfold020dv1", "assumed"],
  ])
  // DV1's block is the block the Assumed spend section shows today.
  const only = assumedOnly()
  assert.deepEqual(section.lineItems[1]!.block, only.lineItems[0]!.block)
  assert.equal(section.lineItems[1]!.block.progressCards[0].title, "Assumed spend")
  assert.match(section.lineItems[0]!.block.progressCards[0].title, /estimated/i)
})

test("B30: the section Spend total is delivered plus assumed, matching the hub", () => {
  const section = troye([DV1, DV2])
  assert.ok(section)
  const assumed = hubAssumed("2026-11-07")
  const estimate = dv2Estimate()
  assert.ok(assumed > 0 && estimate > 0)
  // The assumed figure is the one the Assumed spend section shows today.
  assert.equal(assumedOnly().aggregate.progressCards[0].expected, assumed)
  const total = formatMoney(estimate + assumed)
  const c = chips(section)
  assert.equal(c.get("Spend"), total)
  assert.equal(c.get("Assumed spend"), formatMoney(assumed))
  assert.equal(c.has("Estimated spend"), false)
  const card = section.aggregate.progressCards[0]
  assert.equal(card.title, "Spend")
  assert.equal(card.value, total)
  assert.match(card.detail ?? "", new RegExp(`includes \\${formatMoney(assumed)} assumed spend`))
  // HF2 (B30 review L1): the lead names both kinds of dollars.
  assert.match(card.detail ?? "", /^Estimated and assumed \$/)
  assert.equal(card.plannedTotal, 50_000)
  // Delivery counts stay DV2's only.
  assert.equal(c.get("Impressions") ?? c.get("Served impressions"), "42,000")
  assert.equal(section.aggregate.progressCards[1].title, "Impressions delivery")
})

test("HF2 (B30 review L1): with reported delivered spend the lead says Reported and assumed", () => {
  const dv2Fixed = { ...DV2, fixed_cost_media: true }
  const reportedSpendByLineDate = new Map([["penfold020dv2", new Map([["2026-10-20", 1_000], ["2026-10-21", 500]])]])
  const section = troye([DV1, dv2Fixed], CF_ROWS, { reportedSpendByLineDate })
  assert.ok(section)
  const card = section.aggregate.progressCards[0]
  assert.equal(card.title, "Spend")
  assert.match(card.detail ?? "", /^Reported and assumed \$/)
})

test("B30: expected adds the assumed sum; expected to date ignores the date filter", () => {
  const filterRange = { start: new Date(2026, 10, 1), end: new Date(2026, 10, 5) }
  const mixed = troye([DV1, DV2], CF_ROWS, { filterRange })
  const delivered = troye([DV2], CF_ROWS, { filterRange })
  assert.ok(mixed && delivered)
  const m = mixed.aggregate.progressCards[0]
  const d = delivered.aggregate.progressCards[0]
  const inWindow = hubAssumed("2026-11-05", "2026-11-01")
  const toDate = hubAssumed("2026-11-07")
  assert.ok(inWindow > 0 && toDate > inWindow)
  assert.ok(Math.abs((m.expected ?? 0) - ((d.expected ?? 0) + inWindow)) < 0.005)
  assert.ok(Math.abs((m.expectedToDate ?? 0) - ((d.expectedToDate ?? 0) + toDate)) < 0.005)
  assert.equal(chips(mixed).get("Assumed spend"), formatMoney(inWindow))
})

test("B30: coverage counts DV1's assumed dollars once", () => {
  const items = [DV1, DV2]
  const section = troye(items)
  assert.ok(section)
  const assumedLines = assumedExpectedLinesForDelivery({
    digitalVideoLineItems: items,
    deliveryLineIds: new Set(["penfold020dv2"]),
  })
  assert.deepEqual(assumedLines.map((l) => l.id.toLowerCase()), ["penfold020dv1"])
  const entries = channelCoverage({
    buckets: {
      socialLineItems: [],
      searchLineItems: [],
      progDisplayLineItems: [],
      progVideoLineItems: [],
      progOohLineItems: [],
      digitalDisplayLineItems: [],
      digitalVideoLineItems: items,
      digitalAudioLineItems: [],
      bvodLineItems: [],
    },
    sections: [section],
    todayISO: "2026-11-08",
    assumedLines,
    window: { startISO: "2026-10-01", endISO: "2026-11-07" },
    channelExpected: [{ key: "digital-video", expected: 20_000, planned: 50_000 }],
  })
  const video = entries.find((e) => e.key === "digital-video")
  assert.ok(video)
  assert.ok(Math.abs((video.deliveredSpend ?? 0) - (dv2Estimate() + hubAssumed("2026-11-07"))) < 0.005)
  assert.equal(video.deliveredImpressions, 42_000)
})

test("B30: a qualifying line with only zero rows is shown once, as assumed", () => {
  const zero = row("ad-serving", "penfold020dv1", "2026-10-21", 0, 0)
  const section = troye([DV1, DV2], [...CF_ROWS, zero])
  assert.ok(section)
  assert.deepEqual(section.lineItems.map((l) => l.id), ["penfold020dv2", "penfold020dv1"])
  assert.equal(section.lineItems[1]!.basis, "assumed")
})

test("B30: a line with its own delivery is never assumed", () => {
  const cm360 = row("ad-serving", "penfold020dv1", "2026-10-21", 500, 0)
  const section = troye([DV1, DV2], [...CF_ROWS, cm360])
  assert.ok(section)
  assert.deepEqual(section.lineItems.map((l) => [l.id, l.basis ?? null]), [
    ["penfold020dv1", null],
    ["penfold020dv2", null],
  ])
  assert.equal(chips(section).has("Assumed spend"), false)
})

test("B30: a CM360 Digital Display section with an assumed line and no priced delivery leads with Assumed", () => {
  const counted = {
    line_item_id: "MBA009DD1",
    buy_type: "cpm",
    publisher: "News Corp",
    platform: "",
    no_adserving: false,
    budget_includes_fees: false,
    fixed_cost_media: false,
    // No planned deliverables, so no estimate and no delivered spend card.
    bursts_json: [{ budget: "$0.00", startDate: BURST_START, endDate: BURST_END }],
  }
  const assumedLine = { ...line("MBA009DD2", "Linkby", "$5,000.00", 0), buy_type: "cpm" }
  const section = build({
    key: "digital-display",
    title: "Digital Display",
    lineItems: [counted, assumedLine],
    combinedRows: [row("ad-serving", "mba009dd1", "2026-10-21", 4_000, 0, 7)],
    ...COMMON,
    mbaNumber: "MBA009",
  })
  assert.ok(section)
  assert.deepEqual(section.lineItems.map((l) => [l.id, l.basis ?? null]), [
    ["mba009dd1", null],
    ["mba009dd2", "assumed"],
  ])
  const card = section.aggregate.progressCards[0]
  assert.equal(card.title, "Spend")
  assert.match(card.detail ?? "", /^Assumed \$/)
  assert.equal(section.aggregate.progressCards[1].title, "Impressions delivery")
})

// ---- Unchanged outside a mixed section (JSON pinned at 9bc95017, production main; the two CM360 pins carry the C-159 ratio chart units) ----

const PINNED: Record<string, [number, string]> = {
  // HF2 C-183: the assumed-only rows carry basis "assumed" (+18 chars); without it the 1345 / 40b1d59c pin holds (assumedOnlyGlance.hf2.test.ts).
  "assumed only (no delivery in the section)": [1363, "e59ab729fe5924a81c331bf644b2665c10747764825e464c7e22475e7a40f602"],
  "CM360 section with a plan-only line that does not qualify": [4829, "32293f763bb9be259a7112cec0e3b742b82d5aaffed1b8a60fd0255206433d24"],
  "CM360 section whose no_adserving line has a delivery source": [4829, "7ca194e45b5a6725d086218e1406a142d434eb958d61819f26135a27dc560c18"],
}

function pinnedScenarios(): Array<[string, ReturnType<typeof build>]> {
  const youtube = { ...DV1, line_item_id: "PENFOLD020DV3", publisher: "YouTube", no_adserving: false }
  const cm360Line = { ...DV2, line_item_id: "PENFOLD020DV4", publisher: "YouTube", no_adserving: false }
  const cm360Rows = [row("ad-serving", "penfold020dv4", "2026-10-21", 9_000, 6_000, 2)]
  const sourced = { ...DV1, line_item_id: "PENFOLD020DV5", publisher: "Channel Factory" }
  return [
    ["assumed only (no delivery in the section)", troye([DV1], [])],
    ["CM360 section with a plan-only line that does not qualify", troye([cm360Line, youtube], cm360Rows)],
    ["CM360 section whose no_adserving line has a delivery source", troye([cm360Line, sourced], cm360Rows)],
  ]
}

test("B30: sections with no assumed line beside delivery are byte-identical to 9bc95017 (C-159 chart units aside)", () => {
  const scenarios = pinnedScenarios()
  assert.equal(scenarios.length, Object.keys(PINNED).length)
  for (const [name, section] of scenarios) {
    const json = JSON.stringify(section)
    const [length, sha] = PINNED[name]!
    assert.equal(json.length, length, name)
    assert.equal(createHash("sha256").update(json).digest("hex"), sha, name)
  }
})
