/**
 * HF1: a Direct Booked Digital Video line booked with Channel Factory reads its
 * own partner-file rows (PACING_FACT 'Programmatic - Video', app channel
 * `programmatic-video`) with estimated spend. Every other container, publisher
 * and row keeps the a5184377 output (pinned below).
 *
 * Troye Holiday FY27 (PENFOLD020, published version 16999): PENFOLD020DV2
 * Channel Factory cpv, $30,000 for 428,571 views, 20 Oct to 24 Dec 2026.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import {
  buildDirectDigitalChannelSection,
  directDigitalPartnerFileLineIds,
} from "../directDigitalAdapterShared"
import { estimateDirectDigitalSpend } from "@/lib/delivery/estimateDirectDigitalSpend"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

type SectionInput = Parameters<typeof buildDirectDigitalChannelSection>[0]
/** Scenario inputs are plain records; the adapter normalises line items itself. */
const build = (input: Record<string, unknown>) =>
  buildDirectDigitalChannelSection(input as unknown as SectionInput)

type Row = Record<string, unknown>

function pinRow(channel: string, lineItemId: string, dateDay: string, impressions: number, clicks: number, views: number): Row {
  return {
    channel,
    dateDay,
    adsetName: null,
    entityName: `ent-${lineItemId}`,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: `plc-${lineItemId}`,
    lineItemId,
    amountSpent: 0,
    impressions,
    clicks,
    results: 0,
    video3sViews: views,
    maxFivetranSyncedAt: null,
    updatedAt: null,
  }
}

function pinLine(id: string, publisher: string, platform: string, buyType: string, budget: string, cv: number): Row {
  return {
    line_item_id: id,
    buy_type: buyType,
    publisher,
    platform,
    budget_includes_fees: false,
    fixed_cost_media: false,
    bursts_json: [
      { budget, calculatedValue: cv, startDate: "2026-10-19T13:00:00.000Z", endDate: "2026-12-23T13:00:00.000Z" },
    ],
  }
}

const PIN_ROWS: Row[] = [
  pinRow("ad-serving", "mba001dv1", "2026-10-21", 1000, 4, 0),
  pinRow("ad-serving", "mba001dv1", "2026-10-22", 1500, 6, 0),
  pinRow("programmatic-video", "mba001dv1", "2026-10-22", 900, 0, 700),
  pinRow("programmatic-video", "mba001pv1", "2026-10-22", 800, 0, 600),
  pinRow("ad-serving", "mba001dd1", "2026-10-21", 5000, 12, 0),
  pinRow("programmatic-video", "mba001dd1", "2026-10-21", 700, 0, 500),
  pinRow("ad-serving", "mba001da1", "2026-10-21", 2000, 0, 0),
  pinRow("ad-serving", "mba001bv1", "2026-10-21", 3000, 0, 0),
  pinRow("ad-serving", "mba001dv3", "2026-10-21", 1200, 2, 0),
]

/**
 * CM360-only inputs: sections must be byte-identical to a5184377. CM360 rows
 * carry no completes so the pin does not cover completion-rate formatting.
 */
function pinnedScenarios(): Array<{ name: string; input: Record<string, unknown> }> {
  const common = {
    combinedRows: PIN_ROWS,
    campaignStart: "2026-10-20",
    campaignEnd: "2026-12-24",
    mbaNumber: "mba001",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
    asOfDate: "2026-11-08",
    pacingAsAtISO: "2026-11-07",
    packageNoUnitTarget: false,
    fixedCostFromDate: false,
  }
  return [
    {
      name: "digital-video CM360 line with a stray partner row",
      input: {
        ...common,
        key: "digital-video",
        title: "Digital Video",
        lineItems: [pinLine("MBA001DV1", "YouTube", "", "cpv", "$30,000.00", 428571)],
      },
    },
    {
      name: "digital-video Channel Factory line with CM360 rows only",
      input: {
        ...common,
        key: "digital-video",
        title: "Digital Video",
        lineItems: [pinLine("MBA001DV3", "Channel Factory", "Channel Factory", "cpv", "$10,000.00", 100000)],
      },
    },
    {
      name: "digital-display Channel Factory line ignores partner rows",
      input: {
        ...common,
        key: "digital-display",
        title: "Digital Display",
        lineItems: [pinLine("MBA001DD1", "Channel Factory", "Channel Factory", "cpm", "$5,000.00", 500000)],
      },
    },
    {
      name: "digital-audio",
      input: {
        ...common,
        key: "digital-audio",
        title: "Digital Audio",
        lineItems: [pinLine("MBA001DA1", "Spotify", "Spotify", "cpm", "$15,004.85", 425428)],
      },
    },
    {
      name: "bvod",
      input: {
        ...common,
        key: "bvod",
        title: "BVOD",
        lineItems: [pinLine("MBA001BV1", "Seven", "", "cpm", "$9,000.00", 300000)],
      },
    },
  ]
}

const PINNED: Record<string, [number, string]> = {
  "digital-video CM360 line with a stray partner row": [3461, "079129b39b5f694a7c423a7f5b1e85fb244c2ca5b9bc311c777c9730d720500e"],
  "digital-video Channel Factory line with CM360 rows only": [3349, "cecbae9f30a261e5392def70ba4be5dbd996198a5da57c83fb6145ca56ad6331"],
  "digital-display Channel Factory line ignores partner rows": [4326, "463e70376b54ba4802fac6d2a66e9780662101329809348a9dd4ee03937d7e2f"],
  "digital-audio": [4308, "42d5a825a5c83bb6e8a79ddb6c05a6bfa9fed19b106b8e36518b6dce8c2e8c1c"],
  bvod: [4418, "21e837aa23d1c29d9b6f9a48844efef762730505f8b7b8b3f3acb25637c75683"],
}

test("HF1: CM360 sections are byte-identical to a5184377", () => {
  const scenarios = pinnedScenarios()
  assert.equal(scenarios.length, Object.keys(PINNED).length)
  for (const s of scenarios) {
    const json = JSON.stringify(build(s.input))
    const [length, sha] = PINNED[s.name]!
    assert.equal(json.length, length, s.name)
    assert.equal(createHash("sha256").update(json).digest("hex"), sha, s.name)
  }
})

// ---- Troye Holiday FY27 ----

const TROYE_DV2 = {
  line_item_id: "PENFOLD020DV2",
  buy_type: "cpv",
  publisher: "Channel Factory",
  platform: "",
  budget_includes_fees: false,
  fixed_cost_media: false,
  bursts_json: [
    {
      fee: 0,
      budget: "$30,000.00",
      buyAmount: "$0.07",
      calculatedValue: 428571,
      startDate: "2026-10-19T13:00:00.000Z",
      endDate: "2026-12-23T13:00:00.000Z",
    },
  ],
}

/** UMG Popsta, no delivery source. */
const TROYE_DV1 = { ...TROYE_DV2, line_item_id: "PENFOLD020DV1", publisher: "UMG Popsta" }

function cfRow(entity: string, dateDay: string, impressions: number, completes: number): PacingRow {
  return {
    channel: "programmatic-video",
    dateDay,
    adsetName: "OP079074_<Penfolds Holiday by Troye_CF12/CF14>_@YT TrueView In-Stream AU P25-54 PL292082",
    entityName: entity,
    campaignId: null,
    campaignName: "OP079074_<Penfolds Holiday by Troye_CF12/CF14>_@YT TrueView In-Stream AU P25-54 PL292082",
    adsetId: entity.toLowerCase(),
    entityId: entity.toLowerCase(),
    lineItemId: "penfold020dv2",
    amountSpent: 0,
    impressions,
    clicks: 0,
    results: 0,
    video3sViews: completes,
    maxFivetranSyncedAt: null,
    updatedAt: null,
  }
}

const TROYE_ROWS: PacingRow[] = [
  cfRow("CF14_AT1_P25-44_PENFOLD020DV2", "2026-10-20", 10_000, 7_000),
  cfRow("CF14_AT1_P25-44_PENFOLD020DV2", "2026-10-21", 12_000, 9_000),
  cfRow("CF12_AT1_P25-44_PENFOLD020DV2", "2026-10-21", 1_000, 800),
]

function troye(lineItems: unknown[], rows: PacingRow[] = TROYE_ROWS, key = "digital-video") {
  return build({
    key,
    title: key === "digital-video" ? "Digital Video" : "Digital Display",
    lineItems,
    combinedRows: rows,
    campaignStart: "2026-10-20",
    campaignEnd: "2026-12-24",
    mbaNumber: "PENFOLD020",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
    asOfDate: "2026-11-08",
    pacingAsAtISO: "2026-11-07",
    packageNoUnitTarget: false,
    fixedCostFromDate: false,
  })
}

test("HF1: Troye DV2 Channel Factory rows show in the Digital Video section", () => {
  const section = troye([TROYE_DV2])
  assert.ok(section)
  assert.equal(section.key, "digital-video")
  assert.equal(section.lineItems.length, 1)
  assert.equal(section.lineItems[0]!.id, "penfold020dv2")
  const chips = new Map(section.aggregate.summaryChips.map((c) => [c.label, c.value]))
  assert.equal(chips.get("Served impressions"), "23,000")
  assert.equal(chips.get("Video completes"), "16,800")
  const daily = section.aggregate.chart.daily
  assert.deepEqual(
    daily.map((d) => [d.date, d.impressions]),
    [
      ["2026-10-20", 10_000],
      ["2026-10-21", 13_000],
    ],
  )
})

test("HF1: Troye DV2 uses estimated spend from the plan rate on completes (cpv)", () => {
  const section = troye([TROYE_DV2])
  assert.ok(section)
  const oracle = estimateDirectDigitalSpend({
    lineItemId: "penfold020dv2",
    buyType: "cpv",
    budgetIncludesFees: false,
    bursts: TROYE_DV2.bursts_json,
    days: [
      { date: "2026-10-20", impressions: 10_000, clicks: 0, results: 0, video3sViews: 7_000 },
      { date: "2026-10-21", impressions: 13_000, clicks: 0, results: 0, video3sViews: 9_800 },
    ],
  })
  assert.equal(oracle.spendMode, "estimated")
  // $30,000 ÷ 428,571 views × 16,800 completes, under the cap.
  assert.ok(Math.abs((oracle.amount ?? 0) - (30_000 / 428_571) * 16_800) < 0.01)
  const card = section.aggregate.progressCards[0]!
  assert.match(card.title, /estimated/i)
  assert.equal(card.value, `$${(oracle.amount ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  assert.equal(section.aggregate.kpiBand?.subtitle, "Spend estimated from the plan rate")
})

test("HF1: the Channel Factory section names its source, not CM360", () => {
  const section = troye([TROYE_DV2])
  assert.ok(section)
  assert.deepEqual(section.connections, [{ label: "Channel Factory (partner file)", tone: "partner-file" }])
})

test("HF1: a mixed CM360 and Channel Factory Digital Video section names both sources", () => {
  const cm360Line = { ...TROYE_DV2, line_item_id: "PENFOLD020DV3", publisher: "YouTube" }
  const cm360Row: PacingRow = {
    ...cfRow("plc-1", "2026-10-21", 5_000, 1_000),
    channel: "ad-serving",
    lineItemId: "penfold020dv3",
  }
  const section = troye([TROYE_DV2, cm360Line], [...TROYE_ROWS, cm360Row])
  assert.ok(section)
  assert.deepEqual(
    section.connections.map((c) => c.tone),
    ["cm360", "partner-file"],
  )
  assert.equal(section.lineItems.length, 2)
})

test("HF1: a line with no delivery source does not take partner-file rows", () => {
  // PENFOLD020DV1 (UMG Popsta) is not in delivery_source_map; a stray row on its id is ignored.
  const stray: PacingRow = { ...cfRow("x", "2026-10-21", 999, 0), lineItemId: "penfold020dv1" }
  const section = troye([TROYE_DV1, TROYE_DV2], [...TROYE_ROWS, stray])
  assert.ok(section)
  assert.deepEqual(section.lineItems.map((l) => l.id), ["penfold020dv2"])
  const chips = new Map(section.aggregate.summaryChips.map((c) => [c.label, c.value]))
  assert.equal(chips.get("Served impressions"), "23,000")
})

test("HF1: Channel Factory rows do not reach a Digital Display line", () => {
  const displayLine = { ...TROYE_DV2, line_item_id: "PENFOLD020DD1", buy_type: "cpm" }
  const rows = TROYE_ROWS.map((r) => ({ ...r, lineItemId: "penfold020dd1" }))
  const section = troye([displayLine], rows, "digital-display")
  // No CM360 delivery and not an assumed-spend line: no section, as at a5184377.
  assert.equal(section, null)
})

test("HF1: a partner-file row for another plan line is ignored", () => {
  const other: PacingRow = { ...cfRow("y", "2026-10-21", 5_555, 10), lineItemId: "penfold020pv1" }
  const section = troye([TROYE_DV2], [...TROYE_ROWS, other])
  assert.ok(section)
  const chips = new Map(section.aggregate.summaryChips.map((c) => [c.label, c.value]))
  assert.equal(chips.get("Served impressions"), "23,000")
})

test("HF1: a fixed-cost Channel Factory Digital Video line keeps reported spend", () => {
  const fixed = { ...TROYE_DV2, fixed_cost_media: true, fixedCostMedia: true }
  const reported = new Map([["penfold020dv2", new Map([["2026-10-20", 100], ["2026-10-21", 150]])]])
  const section = build({
    key: "digital-video",
    title: "Digital Video",
    lineItems: [fixed],
    combinedRows: TROYE_ROWS,
    campaignStart: "2026-10-20",
    campaignEnd: "2026-12-24",
    mbaNumber: "PENFOLD020",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
    reportedSpendByLineDate: reported,
    asOfDate: "2026-11-08",
    pacingAsAtISO: "2026-11-07",
    packageNoUnitTarget: false,
    fixedCostFromDate: false,
  })
  assert.ok(section)
  const card = section.aggregate.progressCards[0]!
  assert.equal(card.value, "$250.00")
  assert.doesNotMatch(card.title, /estimated/i)
})

test("HF1: directDigitalPartnerFileLineIds is Channel Factory on Digital Video only", () => {
  const items = [
    { line_item_id: "a1dv1", publisher: "Channel Factory", platform: "" },
    { line_item_id: "A1DV2", publisher: "", platform: "Channel Factory" },
    { line_item_id: "a1dv3", publisher: "  channel factory ", platform: null },
    { line_item_id: "a1dv4", publisher: "Vistar", platform: "" },
    { line_item_id: "a1dv5", publisher: "Quantcast", platform: "" },
    { line_item_id: "a1dv6", publisher: "UMG Popsta", platform: "Channel Factory" },
    { line_item_id: "", publisher: "Channel Factory", platform: "" },
  ]
  assert.deepEqual([...directDigitalPartnerFileLineIds("digital-video", items)], ["a1dv1", "a1dv2", "a1dv3"])
  for (const key of ["digital-display", "digital-audio", "bvod"] as const) {
    assert.equal(directDigitalPartnerFileLineIds(key, items).size, 0, key)
  }
})
