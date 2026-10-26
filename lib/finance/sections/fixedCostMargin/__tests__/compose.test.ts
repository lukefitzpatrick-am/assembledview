/**
 * Fixed cost margin: billed (plan schedule) vs actual platform spend.
 * Totals, margin and sign, no platform data, zero-cost feeds, out-of-range months.
 */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  FINANCE_STATUS_INCLUDED_SQL,
} from "../../financeCampaignStatus.js"

import {
  composeFixedCostMargin,
  filterFixedCostMarginLines,
  invoicedMonthKey,
  lineFlagLabels,
  marginPctOf,
  summariseFixedCostMargin,
  type FixedCostPlanCell,
  type PlatformSpendCell,
} from "../compose.js"

function cell(over: Partial<FixedCostPlanCell>): FixedCostPlanCell {
  return {
    clientId: 1,
    clientName: "Krusty Krab",
    mbaNumber: "KK001",
    campaignName: "Spring",
    campaignStatus: "booked",
    lineItemId: "KK001PD1",
    lineName: "Prospecting",
    publisher: "DV360",
    platform: "DV360",
    channel: "prog_display",
    buyType: "cpm",
    fixedCostMedia: true,
    month: "2026-10",
    basis: "billing",
    amountCents: 0,
    ...over,
  }
}

function spend(over: Partial<PlatformSpendCell>): PlatformSpendCell {
  return {
    lineItemId: "kk001pd1",
    month: "2026-10",
    source: "DV360",
    spendCents: 0,
    impressions: 1000,
    rowCount: 10,
    ...over,
  }
}

const RANGE = { from: "2026-07", to: "2027-06" }

test("DV360 margin is billed minus DV360 cost (AMOUNT_SPENT), matched on lowercase line id", () => {
  const lines = composeFixedCostMargin({
    plan: [cell({ amountCents: 3_750_36 })],
    spend: [spend({ spendCents: 3_232_23 })],
    invoiced: new Set(),
    ...RANGE,
  })
  assert.equal(lines.length, 1)
  const [line] = lines
  assert.equal(line!.costStatus, "reported")
  assert.deepEqual(line!.sources, ["DV360"])
  const m = line!.months[0]!
  assert.equal(m.billedCents, 375036)
  assert.equal(m.actualCents, 323223)
  assert.equal(m.marginCents, 51813)
  assert.equal("mediaCostCents" in m, false)
  assert.ok(Math.abs((m.marginPct ?? 0) - 51813 / 375036) < 1e-12)
  assert.equal(line!.flags.negativeMargin, false)
})

test("negative margin when the platform charged more than we billed", () => {
  const [line] = composeFixedCostMargin({
    plan: [cell({ amountCents: 9_741_44 })],
    spend: [spend({ spendCents: 13_786_86 })],
    invoiced: new Set(),
    ...RANGE,
  })
  assert.equal(line!.totals.marginCents, 974144 - 1378686)
  assert.ok(line!.totals.marginCents < 0)
  assert.equal(line!.flags.negativeMargin, true)
  assert.ok(lineFlagLabels(line!).includes("Negative margin"))
})

test("no platform data: margin null and kept out of the margin base", () => {
  const lines = composeFixedCostMargin({
    plan: [
      cell({ amountCents: 100_00 }),
      cell({ lineItemId: "KK001DD1", publisher: "News Corp", platform: "News Corp", amountCents: 500_00 }),
    ],
    spend: [spend({ spendCents: 80_00 })],
    invoiced: new Set(),
    ...RANGE,
  })
  const dd = lines.find((l) => l.lineItemId === "KK001DD1")!
  assert.equal(dd.costStatus, "none")
  assert.equal(dd.flags.noPlatformData, true)
  assert.equal(dd.months[0]!.marginCents, null)
  assert.equal(dd.months[0]!.marginPct, null)
  const { grand } = summariseFixedCostMargin(lines)
  assert.equal(grand.billedCents, 600_00)
  assert.equal(grand.billedWithCostCents, 100_00)
  assert.equal(grand.billedWithoutCostCents, 500_00)
  assert.equal(grand.actualCents, 80_00)
  assert.equal(grand.marginCents, 20_00)
  assert.equal(grand.marginPct, 0.2)
})

test("delivery rows with zero cost are 'No cost in feed', not a 100% margin", () => {
  const [line] = composeFixedCostMargin({
    plan: [cell({ lineItemId: "KK001PV1", platform: "Channel Factory", amountCents: 16_000_00 })],
    spend: [spend({ lineItemId: "kk001pv1", source: "Channel Factory", spendCents: 0, rowCount: 25 })],
    invoiced: new Set(),
    ...RANGE,
  })
  assert.equal(line!.costStatus, "zero_cost")
  assert.equal(line!.flags.noCostInFeed, true)
  assert.equal(line!.flags.noPlatformData, false)
  assert.equal(line!.totals.marginCents, 0)
  assert.equal(line!.totals.billedWithoutCostCents, 16_000_00)
  assert.equal(line!.totals.marginPct, null)
})

test("spend in a month outside the line's schedule months is flagged", () => {
  const [line] = composeFixedCostMargin({
    plan: [
      cell({ month: "2026-07", amountCents: 50_00 }),
      cell({ month: "2026-08", amountCents: 50_00 }),
      cell({ month: "2026-08", basis: "delivery", amountCents: 100_00 }),
    ],
    spend: [
      spend({ month: "2026-08", spendCents: 40_00 }),
      spend({ month: "2026-10", spendCents: 12_00 }),
    ],
    invoiced: new Set(),
    ...RANGE,
  })
  assert.deepEqual(line!.flags.outOfRangeMonths, ["2026-10"])
  const oct = line!.months.find((m) => m.month === "2026-10")!
  assert.equal(oct.outsideLineMonths, true)
  assert.equal(oct.billedCents, 0)
  assert.equal(oct.marginCents, -12_00)
  assert.equal(oct.marginPct, null)
  assert.equal(line!.months.find((m) => m.month === "2026-08")!.outsideLineMonths, false)
  assert.equal(line!.totals.marginCents, 100_00 - 52_00)
  assert.ok(lineFlagLabels(line!).some((l) => l.startsWith("Spend outside line months")))
})

test("delivery months widen the line window but are never billed", () => {
  const [line] = composeFixedCostMargin({
    plan: [
      cell({ month: "2026-09", amountCents: 100_00 }),
      cell({ month: "2026-10", basis: "delivery", amountCents: 100_00 }),
    ],
    spend: [spend({ month: "2026-10", spendCents: 90_00 })],
    invoiced: new Set(),
    ...RANGE,
  })
  assert.equal(line!.lineLastMonth, "2026-10")
  assert.deepEqual(line!.flags.outOfRangeMonths, [])
  assert.equal(line!.totals.billedCents, 100_00)
})

test("month range: billed and spend outside the range are left out; window still uses all months", () => {
  const lines = composeFixedCostMargin({
    plan: [
      cell({ month: "2026-06", amountCents: 999_00 }),
      cell({ month: "2026-10", amountCents: 100_00 }),
    ],
    spend: [spend({ month: "2026-06", spendCents: 500_00 }), spend({ month: "2026-10", spendCents: 60_00 })],
    invoiced: new Set(),
    from: "2026-10",
    to: "2026-10",
  })
  assert.equal(lines[0]!.lineFirstMonth, "2026-06")
  assert.equal(lines[0]!.totals.billedCents, 100_00)
  assert.equal(lines[0]!.totals.actualCents, 60_00)
  assert.deepEqual(lines[0]!.months.map((m) => m.month), ["2026-10"])
})

test("a line with nothing in range is dropped; spend for unknown lines is ignored", () => {
  const lines = composeFixedCostMargin({
    plan: [cell({ month: "2026-05", amountCents: 100_00 })],
    spend: [spend({ lineItemId: "other001pd1", spendCents: 5_00 })],
    invoiced: new Set(),
    ...RANGE,
  })
  assert.equal(lines.length, 0)
})

test("invoiced follows the MBA-month invoice status", () => {
  const [line] = composeFixedCostMargin({
    plan: [cell({ month: "2026-09", amountCents: 100_00 }), cell({ month: "2026-10", amountCents: 200_00 })],
    spend: [spend({ month: "2026-09", spendCents: 70_00 })],
    invoiced: new Set([invoicedMonthKey("kk001", "2026-09")]),
    ...RANGE,
  })
  assert.equal(line!.months[0]!.invoiced, true)
  assert.equal(line!.months[0]!.invoicedCents, 100_00)
  assert.equal(line!.months[1]!.invoiced, false)
  assert.equal(line!.totals.invoicedCents, 100_00)
})

test("summary: client, publisher and month totals add to the grand total", () => {
  const lines = composeFixedCostMargin({
    plan: [
      cell({ month: "2026-09", amountCents: 100_00 }),
      cell({ month: "2026-10", amountCents: 100_00 }),
      cell({
        clientId: 2,
        clientName: "Chum Bucket",
        mbaNumber: "CB001",
        lineItemId: "CB001PD3",
        publisher: "Taboola",
        platform: "Taboola",
        month: "2026-10",
        amountCents: 300_00,
      }),
    ],
    spend: [
      spend({ month: "2026-09", spendCents: 90_00 }),
      spend({ month: "2026-10", spendCents: 120_00 }),
      spend({ lineItemId: "cb001pd3", source: "Taboola", spendCents: 100_00 }),
    ],
    invoiced: new Set(),
    ...RANGE,
  })
  const s = summariseFixedCostMargin(lines)
  assert.equal(s.grand.billedCents, 500_00)
  assert.equal(s.grand.actualCents, 310_00)
  assert.equal(s.grand.marginCents, 190_00)
  const sum = (xs: Array<{ totals: { marginCents: number; billedCents: number } }>) =>
    xs.reduce((a, x) => a + x.totals.marginCents, 0)
  assert.equal(sum(s.byClient), s.grand.marginCents)
  assert.equal(sum(s.byPublisher), s.grand.marginCents)
  assert.equal(sum(s.byMonth), s.grand.marginCents)
  assert.deepEqual(s.byMonth.map((m) => m.month), ["2026-09", "2026-10"])
  assert.equal(s.byMonth[1]!.totals.marginCents, -20_00 + 200_00)
  assert.deepEqual(s.byClient.map((c) => c.clientName), ["Chum Bucket", "Krusty Krab"])
})

test("filters: publisher and platform match whole lines, case-insensitive", () => {
  const lines = composeFixedCostMargin({
    plan: [
      cell({ amountCents: 100_00 }),
      cell({ lineItemId: "KK001PD3", publisher: "Taboola", platform: "Taboola", amountCents: 50_00 }),
    ],
    spend: [],
    invoiced: new Set(),
    ...RANGE,
  })
  assert.equal(filterFixedCostMarginLines(lines, { publishers: ["taboola"] }).length, 1)
  assert.equal(filterFixedCostMarginLines(lines, { platforms: ["DV360"] }).length, 1)
  assert.equal(filterFixedCostMarginLines(lines, { clientIds: [9] }).length, 0)
  assert.equal(filterFixedCostMarginLines(lines, {}).length, 2)
})

test("Vistar cost is its reported spend (Vistar revenue)", () => {
  const [line] = composeFixedCostMargin({
    plan: [
      cell({
        mbaNumber: "SINCH001",
        lineItemId: "sinch001PO2",
        publisher: "Broadsign",
        platform: "Vistar",
        channel: "prog_ooh",
        amountCents: 19_076_92,
      }),
    ],
    spend: [spend({ lineItemId: "sinch001po2", source: "Vistar", spendCents: 9_401_35 })],
    invoiced: new Set(),
    ...RANGE,
  })
  assert.equal(line!.costStatus, "reported")
  assert.equal(line!.totals.actualCents, 9_401_35)
  assert.equal(line!.totals.marginCents, 19_076_92 - 9_401_35)
})

test("scope: approved, booked and completed only; planned and draft are excluded", () => {
  assert.equal(
    FINANCE_STATUS_INCLUDED_SQL,
    "(LOWER(COALESCE(m.campaign_status, '')) IN ('approved', 'booked', 'completed'))"
  )
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, "..", "query.ts"), "utf8")
  assert.match(src, /AND \$\{sql\.raw\(FINANCE_STATUS_INCLUDED_SQL\)\}/)
  assert.doesNotMatch(src, /'planned'|'draft'/)
})

test("marginPctOf is null at zero billed and keeps its sign", () => {
  assert.equal(marginPctOf(10, 0), null)
  assert.equal(marginPctOf(-25, 100), -0.25)
})
