/**
 * HF2 (B30 review M1): the hub counts fixed-cost reported spend as delivery
 * (`planHasDeliveryPresence`), and so does the page (`deliveryLineIds`). A
 * `no_adserving` fixed-cost line with client-reported spend beside a delivering
 * CM360 line must stay Reported in the section and on the glance, not become
 * an Assumed spend line.
 *
 * Reviewer scenario (`rv30/scen.test.mts`, SCEN=fc): DD1 CM360 cpm, 100,000
 * impressions at $10 CPM ($1,000 estimated); DD2 `no_adserving`, no delivery
 * source, fixed cost $6,000, REPORTED_SPEND 5 x $1,500 = $7,500 (CAP `none`),
 * only zero-impression CM360 rows. Base and hub: DD2 Reported $7,500, section
 * $8,500.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import { channelCoverage } from "@/lib/delivery/channelCoverage"
import { assumedExpectedLinesForDelivery } from "@/lib/spend/assumedExpectedLines"
import { addDailyFactDeliveryLineIds } from "@/lib/spend/deliveryLineIds"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

type SectionInput = Parameters<typeof buildDirectDigitalChannelSection>[0]
const build = (input: Record<string, unknown>) =>
  buildDirectDigitalChannelSection(input as unknown as SectionInput)

const START = "2026-09-30T14:00:00.000Z"
const END = "2026-11-29T13:00:00.000Z"
const LINES = [
  {
    line_item_id: "TESTFC001DD1",
    buy_type: "cpm",
    publisher: "News Corp",
    platform: "CM360",
    no_adserving: false,
    fixed_cost_media: false,
    budget_includes_fees: false,
    client_pays_for_media: false,
    bursts_json: [{ budget: "$10,000.00", buyAmount: "$10.00", calculatedValue: 1_000_000, startDate: START, endDate: END }],
  },
  {
    line_item_id: "TESTFC001DD2",
    buy_type: "fixed_cost",
    publisher: "Nine",
    platform: "",
    no_adserving: true,
    fixed_cost_media: true,
    budget_includes_fees: false,
    client_pays_for_media: false,
    bursts_json: [{ budget: "$6,000.00", buyAmount: "$6,000.00", calculatedValue: 1, startDate: START, endDate: END }],
  },
]
const DATES = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]

function row(lineItemId: string, dateDay: string, impressions: number, clicks: number): PacingRow {
  return {
    channel: "ad-serving",
    dateDay,
    adsetName: null,
    entityName: `e-${lineItemId}`,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: `e-${lineItemId}`,
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

const ROWS = [
  ...DATES.map((d) => row("testfc001dd1", d, 20_000, 40)),
  ...DATES.map((d) => row("testfc001dd2", d, 0, 0)),
]

function facts(cap: string) {
  return DATES.map((d) => ({
    LINE_ITEM_ID: "testfc001dd2",
    DATE_DAY: d,
    REPORTED_SPEND: 1500,
    ACTUAL_PLATFORM_SPEND: 0,
    ACTUAL_DELIVERABLES: 0,
    CAP_APPLIED: cap,
  }))
}

/** The page's `deliveryLineIds`: positive rows plus non-`assumed_spend` fixed-cost facts. */
function pageDeliveryIds(cap: string): Set<string> {
  const ids = new Set<string>()
  for (const r of ROWS) if (r.impressions > 0 || r.clicks > 0 || r.amountSpent > 0) ids.add(String(r.lineItemId))
  addDailyFactDeliveryLineIds(ids, facts(cap))
  return ids
}

function section(cap: string, withIds: boolean) {
  const reported = new Map([["testfc001dd2", new Map(DATES.map((d) => [d, 1500]))]])
  const s = build({
    key: "digital-display",
    title: "Digital Display",
    lineItems: LINES,
    combinedRows: ROWS,
    campaignStart: "2026-10-01",
    campaignEnd: "2026-11-30",
    mbaNumber: "TESTFC001",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
    asOfDate: "2026-11-10",
    pacingAsAtISO: "2026-11-09",
    packageNoUnitTarget: false,
    fixedCostFromDate: false,
    reportedSpendByLineDate: reported,
    estimateVersionId: 1,
    ...(withIds ? { deliveryLineIds: pageDeliveryIds(cap) } : {}),
  })
  assert.ok(s)
  return s
}

function glance(cap: string, slice: number) {
  const s = section(cap, true)
  const ids = pageDeliveryIds(cap)
  const assumedLines = assumedExpectedLinesForDelivery({ digitalDisplayLineItems: LINES, deliveryLineIds: ids, estimateVersionId: 1 })
  const [entry] = channelCoverage({
    buckets: {
      socialLineItems: [],
      searchLineItems: [],
      progDisplayLineItems: [],
      progVideoLineItems: [],
      progOohLineItems: [],
      digitalDisplayLineItems: LINES,
      digitalVideoLineItems: [],
      digitalAudioLineItems: [],
      bvodLineItems: [],
    },
    sections: [s],
    todayISO: "2026-11-10",
    assumedLines,
    window: { startISO: "2026-10-01", endISO: "2026-11-09" },
    channelExpected: slice > 0 ? [{ key: "digital-display", expected: slice, planned: 16_000 }] : [],
  })
  assert.ok(entry)
  return entry
}

test("HF2 M1: a fixed-cost line with reported spend beside delivery stays Reported", () => {
  const s = section("none", true)
  assert.deepEqual(s.lineItems.map((l) => [l.id, l.basis ?? null]), [
    ["testfc001dd1", null],
    ["testfc001dd2", null],
  ])
  const chips = new Map(s.aggregate.summaryChips.map((c) => [c.label, c.value]))
  assert.equal(chips.has("Assumed spend"), false)
  assert.equal(s.aggregate.progressCards[0].value, "$8,500.00")
  const dd2 = s.lineItems[1]!.block.progressCards[0]
  assert.equal(dd2.value, "$7,500.00")
  assert.doesNotMatch(dd2.title, /assumed/i)
})

test("HF2 M1: the glance counts the reported $7,500 once, with or without a schedule slice", () => {
  for (const slice of [0, 9_000]) {
    const entry = glance("none", slice)
    assert.equal(entry.deliveredSpend, 8_500, `slice ${slice}`)
  }
})

test("HF2 M1: without the page ids the line would show as assumed (the B30 gap this closes)", () => {
  const s = section("none", false)
  assert.deepEqual(s.lineItems.map((l) => [l.id, l.basis ?? null]), [
    ["testfc001dd1", null],
    ["testfc001dd2", "assumed"],
  ])
})

test("HF2 M1: assumed_spend facts are not delivery, so the line stays assumed beside delivery", () => {
  const s = section("assumed_spend", true)
  assert.deepEqual(s.lineItems.map((l) => [l.id, l.basis ?? null]), [
    ["testfc001dd1", null],
    ["testfc001dd2", "assumed"],
  ])
})
