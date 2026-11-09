/**
 * B30 (HF1 review L2, L3, L4, L6): a Digital Video section whose only delivery
 * is Channel Factory uses partner wording, not CM360 verification wording.
 * CM360 and mixed sections keep their labels (CM360 pins live in the HF1 test).
 * Also pins the channel guard, the pill edge, and the CM360 plus Channel
 * Factory sum on one line that the C-182 watch query looks for in live data.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

type SectionInput = Parameters<typeof buildDirectDigitalChannelSection>[0]
const build = (input: Record<string, unknown>) =>
  buildDirectDigitalChannelSection(input as unknown as SectionInput)

const BURSTS = [
  { budget: "$30,000.00", calculatedValue: 428571, startDate: "2026-10-19T13:00:00.000Z", endDate: "2026-12-23T13:00:00.000Z" },
]
const CF_LINE = {
  line_item_id: "PENFOLD020DV2",
  buy_type: "cpv",
  publisher: "Channel Factory",
  platform: "",
  budget_includes_fees: false,
  fixed_cost_media: false,
  bursts_json: BURSTS,
}

function row(channel: PacingRow["channel"], lineItemId: string, dateDay: string, impressions: number, completes: number): PacingRow {
  return {
    channel,
    dateDay,
    adsetName: null,
    entityName: `ent-${channel}`,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: `ent-${channel}`,
    lineItemId,
    amountSpent: 0,
    impressions,
    clicks: 0,
    results: 0,
    video3sViews: completes,
    maxFivetranSyncedAt: null,
    updatedAt: null,
  }
}

const CF_ROWS = [
  row("programmatic-video", "penfold020dv2", "2026-10-20", 10_000, 7_000),
  row("programmatic-video", "penfold020dv2", "2026-10-21", 13_000, 9_800),
]

function section(lineItems: unknown[], rows: PacingRow[]) {
  const s = build({
    key: "digital-video",
    title: "Digital Video",
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
  assert.ok(s)
  return s
}

test("B30: a Channel Factory-only section uses partner wording", () => {
  const s = section([CF_LINE], CF_ROWS)
  const json = JSON.stringify(s)
  assert.equal(json.includes("Served impressions"), false)
  assert.equal(json.includes("Verification KPIs"), false)
  assert.equal(s.aggregate.kpiBand.title, "Delivery KPIs")
  assert.equal(s.aggregate.summaryChips.some((c) => c.label === "Impressions"), true)
  assert.equal(s.aggregate.kpiBand.tiles[0]?.label, "Impressions")
  const block = s.lineItems[0]!.block
  assert.equal(block.kpiBand.title, "Delivery KPIs")
  assert.equal(block.kpiBand.tiles[0]?.label, "Impressions")
})

test("B30: a Channel Factory-only section with no estimate says partner delivery counts", () => {
  const noPlan = { ...CF_LINE, bursts_json: [{ ...BURSTS[0], calculatedValue: 0, budget: "$0.00" }] }
  const s = section([noPlan], CF_ROWS)
  assert.equal(s.aggregate.kpiBand.subtitle, "Channel Factory delivery counts")
  assert.equal(s.aggregate.progressCards[0].varianceLabel, "delivery counts only")
  assert.equal(JSON.stringify(s).includes("verification counts only"), false)
})

test("B30: a section with CM360 delivery keeps the CM360 wording", () => {
  const cm360Line = { ...CF_LINE, line_item_id: "PENFOLD020DV3", publisher: "YouTube" }
  const s = section([CF_LINE, cm360Line], [...CF_ROWS, row("ad-serving", "penfold020dv3", "2026-10-21", 5_000, 1_000)])
  assert.equal(s.aggregate.kpiBand.title, "Verification KPIs")
  assert.equal(s.aggregate.summaryChips.some((c) => c.label === "Served impressions"), true)
  for (const li of s.lineItems) assert.equal(li.block.kpiBand.title, "Verification KPIs")
})

test("B30 (L3): a Channel Factory Digital Video line ignores a non-video partner channel row", () => {
  const stray = row("programmatic-display", "penfold020dv2", "2026-10-21", 99_999, 0)
  const s = section([CF_LINE], [...CF_ROWS, stray])
  const chips = new Map(s.aggregate.summaryChips.map((c) => [c.label, c.value]))
  assert.equal(chips.get("Impressions"), "23,000")
})

test("B30 (L4): a zero CM360 row beside Channel Factory delivery names Channel Factory only", () => {
  const zero = row("ad-serving", "penfold020dv2", "2026-10-21", 0, 0)
  const s = section([CF_LINE], [...CF_ROWS, zero])
  assert.deepEqual(s.connections, [{ label: "Channel Factory (partner file)", tone: "partner-file" }])
  assert.equal(s.aggregate.kpiBand.title, "Delivery KPIs")
})

test("B30 (L6 watch): CM360 and Channel Factory rows on one line are both counted", () => {
  // The hub (loadDeliverySnapshot) sums both too. KNOWN-ISSUES C-182 holds the live watch query.
  const cm360 = row("ad-serving", "penfold020dv2", "2026-10-21", 4_000, 0)
  const s = section([CF_LINE], [...CF_ROWS, cm360])
  const chips = new Map(s.aggregate.summaryChips.map((c) => [c.label, c.value]))
  assert.equal(chips.get("Served impressions"), "27,000")
  assert.deepEqual(s.connections.map((c) => c.tone), ["cm360", "partner-file"])
})
