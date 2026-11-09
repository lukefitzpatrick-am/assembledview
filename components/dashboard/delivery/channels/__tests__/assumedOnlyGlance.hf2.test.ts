/**
 * HF2 (C-183): the glance counted an assumed-only Direct Booked Digital section
 * twice when the delivery schedule had a slice for the container: once from
 * the section's Assumed spend cards (`matchingLineItems`) and again from
 * `assumedLines` (`stampChannelExpected`). Troye Digital Video on 10 Nov: the
 * section shows $6,364 and the glance showed $12,727.63, Ahead (pacing as at
 * 9 Nov; the fixtures below run to 7 Nov).
 *
 * The section rows now carry `basis: "assumed"` (nothing else changes), and
 * coverage does not add the assumed lines again for a group whose spend is
 * read from those cards. Without a slice the glance is unchanged.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import { channelCoverage } from "@/lib/delivery/channelCoverage"
import { assumedExpectedLinesForDelivery } from "@/lib/spend/assumedExpectedLines"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

type SectionInput = Parameters<typeof buildDirectDigitalChannelSection>[0]
const build = (input: Record<string, unknown>) =>
  buildDirectDigitalChannelSection(input as unknown as SectionInput)

const BURST_START = "2026-10-19T13:00:00.000Z"
const BURST_END = "2026-12-23T13:00:00.000Z"

function line(id: string, publisher: string, budget: string, cv: number) {
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
  }
}

const DV1 = line("PENFOLD020DV1", "UMG Popsta", "$20,000.00", 285714)
const DV2 = line("PENFOLD020DV2", "Channel Factory", "$30,000.00", 428571)

function cfRow(dateDay: string, impressions: number, completes: number): PacingRow {
  return {
    channel: "programmatic-video",
    dateDay,
    adsetName: null,
    entityName: "ent",
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: "ent",
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

const COMMON = {
  key: "digital-video",
  title: "Digital Video",
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

function section(lineItems: unknown[], rows: PacingRow[]) {
  const s = build({ ...COMMON, lineItems, combinedRows: rows })
  assert.ok(s)
  return s
}

function glance(lineItems: unknown[], rows: PacingRow[], slice: number) {
  const s = section(lineItems, rows)
  const deliveryLineIds = new Set(rows.filter((r) => r.impressions > 0).map((r) => String(r.lineItemId)))
  const assumedLines = assumedExpectedLinesForDelivery({ digitalVideoLineItems: lineItems, deliveryLineIds })
  const [entry] = channelCoverage({
    buckets: {
      socialLineItems: [],
      searchLineItems: [],
      progDisplayLineItems: [],
      progVideoLineItems: [],
      progOohLineItems: [],
      digitalDisplayLineItems: [],
      digitalVideoLineItems: lineItems,
      digitalAudioLineItems: [],
      bvodLineItems: [],
    },
    sections: [s],
    todayISO: "2026-11-08",
    assumedLines,
    window: { startISO: "2026-10-01", endISO: "2026-11-07" },
    channelExpected: slice > 0 ? [{ key: "digital-video", expected: slice, planned: 50_000 }] : [],
  })
  assert.ok(entry)
  return entry
}

test("HF2 C-183: an assumed-only section only gains the basis tag (9bc95017 output otherwise)", () => {
  const s = section([DV1], [])
  assert.equal(s.title, "Assumed spend")
  assert.deepEqual(s.lineItems.map((l) => l.basis), ["assumed"])
  const stripped = { ...s, lineItems: s.lineItems.map(({ basis: _basis, ...row }) => row) }
  const json = JSON.stringify(stripped)
  // Same pin as the B30 "assumed only" scenario before the tag.
  assert.equal(json.length, 1345)
  assert.equal(createHash("sha256").update(json).digest("hex"), "40b1d59c318c7475b8eca55ec12ea45943f91a3e0bcaef21f56bb569e09b2b35")
})

test("HF2 C-183: with a schedule slice the glance counts the assumed-only section once", () => {
  const s = section([DV1], [])
  assert.equal(s.aggregate.summaryChips[0]?.value, "$5,758")
  const entry = glance([DV1], [], 5_757.57)
  assert.equal(entry.deliveredSpend, 5_758) // was 11,515.57 (cards plus assumedLines)
  assert.equal(entry.deliveryStatus, "on-track")
})

test("HF2 C-183: without a slice the glance is unchanged", () => {
  assert.equal(glance([DV1], [], 0).deliveredSpend, 5_758)
})

test("HF2 C-183: two assumed lines in one assumed-only section are each counted once", () => {
  const other = line("PENFOLD020DV3", "UMG Popsta", "$10,000.00", 142857)
  const entry = glance([DV1, other], [], 9_000)
  const s = section([DV1, other], [])
  const cards = s.lineItems.reduce(
    (sum, row) => sum + Number(String(row.block.progressCards[0].value).replace(/[^0-9.]/g, "")),
    0,
  )
  assert.equal(entry.deliveredSpend, cards)
})

test("HF2 C-183: a mixed section still adds the assumed line from assumedLines (B30)", () => {
  const rows = [cfRow("2026-10-20", 10_000, 7_000), cfRow("2026-11-03", 20_000, 15_000)]
  const mixed = section([DV1, DV2], rows)
  assert.deepEqual(mixed.lineItems.map((l) => [l.id, l.basis ?? null]), [
    ["penfold020dv2", null],
    ["penfold020dv1", "assumed"],
  ])
  const withSlice = glance([DV1, DV2], rows, 15_000).deliveredSpend ?? 0
  const noSlice = glance([DV1, DV2], rows, 0).deliveredSpend ?? 0
  // DV1's assumed dollars to 7 Nov: $20,000 over 66 days, 19 days.
  assert.ok(Math.abs(withSlice - noSlice - 5_757.57) < 0.005, `${withSlice} - ${noSlice}`)
})
