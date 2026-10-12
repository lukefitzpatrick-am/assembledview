import assert from "node:assert/strict"
import test from "node:test"

import { generateBillingLineItems } from "@/lib/billing/generateBillingLineItems"
import { explodeExcelLineItems } from "@/lib/docs/explodeExcelLineItems"
import { buildMbaDataFromFinancials } from "@/lib/docs/buildMbaDataFromFinancials"
import { computeApprovedSlice } from "@/lib/finance/approvedSlice"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { mapLineItemFromPostgres } from "@/lib/data/planShapes"
import { excelBuyTypeFromLine, formatBuyTypeForExport } from "@/lib/mediaplan/buyTypeLabels"
import { normaliseSaveLineDeliverables } from "@/lib/mediaplan/deliverableBudget"
import {
  mapOohExpertRowsToStandardLineItems,
  mapStandardOohLineItemsToExpertRows,
  type StandardOohFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import type { OohExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import { extractAndFormatBursts } from "@/lib/mediaplan/formatBurstsForPersist"
import { assumeSpendForSnapshotLine } from "@/lib/spend/assumeSpendRule"
import { assumedSpendForBurst } from "@/lib/spend/assumedSpend"
import { mapPgLineItemToSnapshot } from "@/lib/snowflake/pgLineItemSnapshotMap"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const CS = new Date(2026, 0, 4)
const CE = new Date(2026, 0, 31)
const FEE = 10

function expertRow(
  buyType: "package_inclusions" | "bonus" = "package_inclusions",
  qty = 4,
): OohExpertScheduleRow {
  const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
  const weekKey = cols[0]!.weekKey
  return {
    id: "row-1",
    sourceLineItemId: "penfold026OH20",
    market: "SYD",
    network: "QMS",
    format: "street_furniture",
    type: "Static",
    placement: "Epping Road",
    startDate: "2026-01-04",
    endDate: "2026-01-10",
    size: "6x3",
    panels: "",
    buyingDemo: "P25-54",
    buyType,
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 250,
    grossCost: 0,
    weeklyValues: { [weekKey]: qty },
    mergedWeekSpans: [],
  }
}

function appliedLine(): StandardOohFormLineItem {
  const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
  const [line] = mapOohExpertRowsToStandardLineItems([expertRow()], cols, CS, CE, {
    feePctOoh: FEE,
  })
  return line!
}

function withBurstLabel(
  line: StandardOohFormLineItem,
  buyType: "bonus" | "package_inclusions",
): StandardOohFormLineItem {
  return {
    ...line,
    bursts: line.bursts.map((burst) => ({ ...burst, buyType })),
  }
}

function saveBursts(line: StandardOohFormLineItem) {
  const [normalised] = normaliseSaveLineDeliverables([
    {
      lineItemId: String(line.line_item_id),
      buyType: line.buyType,
      bursts: line.bursts,
    },
  ])
  return extractAndFormatBursts(
    { ...line, buyType: normalised!.buyType, bursts: normalised!.bursts },
    FEE,
  )
}

function reload(line: StandardOohFormLineItem, bursts: unknown[]) {
  return mapLineItemFromPostgres(
    {
      id: 20,
      channel: "ooh",
      line_item_id: line.line_item_id,
      position: 0,
      buy_type: line.buyType,
      market: line.market,
      publisher: line.network,
      bursts,
      budget_includes_fees: false,
      client_pays_for_media: false,
      no_adserving: true,
      fixed_cost_media: false,
      attrs: {},
      created_at: "2026-01-04T00:00:00.000Z",
    },
    {
      versionId: 1,
      versionNumber: 1,
      mbaNumber: "penfold026",
      mpClientName: "Penfold",
    },
  )
}

function moneyView(saved: Array<Record<string, unknown>>) {
  return saved.map((burst) => {
    const { buyType: _buyType, buy_type: _buy_type, ...rest } = burst
    return rest
  })
}

function billingTotals(line: Record<string, unknown>) {
  const months = [{ monthYear: "January 2026" }]
  const billing = generateBillingLineItems([line], "OOH", months, "billing")
  const delivery = generateBillingLineItems([line], "OOH", months, "delivery")
  const sum = (rows: typeof billing) =>
    rows.map((row) => ({
      totalAmount: row.totalAmount,
      totalFeeAmount: row.totalFeeAmount ?? null,
      monthly: row.monthlyAmounts,
      feeMonthly: row.feeMonthlyAmounts ?? null,
    }))
  return { billing: sum(billing), delivery: sum(delivery) }
}

function mbaTotals(line: Record<string, unknown>, bursts: unknown[]) {
  const input: LineItemInput = {
    lineItemId: String(line.line_item_id),
    mediaType: "ooh",
    buyType: String(line.buy_type ?? line.buyType),
    rate: 250,
    enteredAmount: 0,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: FEE,
    bursts: bursts as LineItemInput["bursts"],
    approval: "approved",
  }
  const financials = computeCampaignFinancials([input], { feeLoading: { feeooh: FEE } })
  const slice = computeApprovedSlice({
    financials,
    selectedMonthYears: ["January 2026"],
    approvedLineItemIds: [input.lineItemId],
  })
  const mba = buildMbaDataFromFinancials({
    mbaNumber: "penfold026",
    campaignName: "Penfold",
    brand: "Penfold",
    poNumber: "",
    versionNumber: 1,
    campaignStartDate: "2026-01-04",
    campaignEndDate: "2026-01-31",
    clientName: "Penfold",
    financials,
    slice,
    now: new Date("2026-10-12T00:00:00.000Z"),
  })
  return {
    perLine: financials.perLine.map((row) => ({
      media: row.media,
      fee: row.fee,
      nett: row.nett,
      deliverables: row.deliverables,
    })),
    mbaScopeTotals: financials.mbaScopeTotals,
    reconciliation: financials.reconciliation,
    billingSchedule: financials.billingSchedule,
    gross_media: mba.gross_media,
    totals: mba.totals,
  }
}

function excelView(line: Record<string, unknown>) {
  const rows = explodeExcelLineItems("ooh", line, FEE, 0, {
    campaignStart: CS,
    campaignEnd: CE,
  })
  return rows.map((row) => ({
    ...row,
    buyTypeLabel: formatBuyTypeForExport(
      excelBuyTypeFromLine({ buyType: String(line.buy_type ?? line.buyType ?? "") }),
    ),
  }))
}

function snapshotView(line: StandardOohFormLineItem, bursts: unknown[]) {
  const row = mapPgLineItemToSnapshot({
    id: 20,
    channel: "ooh",
    lineItemId: String(line.line_item_id),
    createdAt: "2026-01-04T00:00:00.000Z",
    buyType: line.buyType,
    bidStrategy: null,
    fixedCostMedia: false,
    noAdserving: true,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    feePct: FEE,
    asOfDate: "2026-10-12",
    bursts,
    mbaNumber: "penfold026",
    publisher: "QMS",
    platform: null,
  })
  assert.ok(row)
  const burstsJson = (row.bursts_json as Array<Record<string, unknown>>).map((burst) => {
    const { buyType: _buyType, buy_type: _buy_type, ...rest } = burst
    return rest
  })
  return {
    assume_spend: row.assume_spend,
    buy_type: row.buy_type,
    burstsJson,
    labels: (row.bursts_json as Array<Record<string, unknown>>).map(
      (burst) => burst.buyType ?? burst.buy_type,
    ),
  }
}

function cycle(label: "bonus" | "package_inclusions") {
  const line = withBurstLabel(appliedLine(), label)
  const saved = saveBursts(line)
  const loaded = reload(line, saved)
  const resaved = extractAndFormatBursts(loaded, FEE)
  return { line, saved, loaded, resaved }
}

test("package_inclusions save, reload, and re-save keep totals when the burst label changes", () => {
  const before = cycle("bonus")
  const after = cycle("package_inclusions")

  assert.deepEqual(moneyView(before.saved), moneyView(after.saved))
  assert.deepEqual(moneyView(before.resaved), moneyView(after.resaved))
  assert.deepEqual(moneyView(before.saved), moneyView(before.resaved))
  assert.deepEqual(moneyView(after.saved), moneyView(after.resaved))

  assert.deepEqual(billingTotals(before.loaded), billingTotals(after.loaded))
  assert.deepEqual(mbaTotals(before.loaded, before.resaved), mbaTotals(after.loaded, after.resaved))
  assert.deepEqual(excelView(before.loaded), excelView(after.loaded))

  const beforeSnap = snapshotView(before.line, before.resaved)
  const afterSnap = snapshotView(after.line, after.resaved)
  assert.equal(beforeSnap.assume_spend, false)
  assert.equal(afterSnap.assume_spend, false)
  assert.deepEqual(beforeSnap.burstsJson, afterSnap.burstsJson)
  assert.deepEqual(beforeSnap.labels, ["bonus"])
  assert.deepEqual(afterSnap.labels, ["package_inclusions"])

  assert.equal(assumeSpendForSnapshotLine({
    buyType: "package_inclusions",
    sourceTable: "media_plan_ooh",
    noAdserving: true,
    publisher: "QMS",
    platform: null,
    deliveryMediaCents: 100000,
  }), false)
  assert.equal(assumeSpendForSnapshotLine({
    buyType: "bonus",
    sourceTable: "media_plan_ooh",
    noAdserving: true,
    publisher: "QMS",
    platform: null,
    deliveryMediaCents: 100000,
  }), false)
  assert.deepEqual(
    assumedSpendForBurst({
      rawBudget: 1000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: FEE,
      buyType: "package_inclusions",
      startDate: "2026-01-04",
      endDate: "2026-01-10",
      asOfDate: "2026-10-12",
    }),
    [],
  )
  assert.deepEqual(
    assumedSpendForBurst({
      rawBudget: 1000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: FEE,
      buyType: "bonus",
      startDate: "2026-01-04",
      endDate: "2026-01-10",
      asOfDate: "2026-10-12",
    }),
    [],
  )
})

test("OOH Expert Apply stamps the line buy type on the burst", () => {
  const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
  const inclusions = mapOohExpertRowsToStandardLineItems(
    [expertRow("package_inclusions", 4)],
    cols,
    CS,
    CE,
    { feePctOoh: FEE },
  )[0]!
  const bonus = mapOohExpertRowsToStandardLineItems(
    [expertRow("bonus", 4)],
    cols,
    CS,
    CE,
    { feePctOoh: FEE },
  )[0]!
  assert.equal(inclusions.bursts[0]!.buyType, "package_inclusions")
  assert.equal(bonus.bursts[0]!.buyType, "bonus")

  const zero = mapOohExpertRowsToStandardLineItems(
    [expertRow("package_inclusions", 0)],
    cols,
    CS,
    CE,
    { feePctOoh: FEE },
  )[0]!
  assert.equal(zero.bursts[0]!.buyType, "package_inclusions")
  assert.equal(zero.bursts[0]!.calculatedValue, 0)
  const [reopened] = mapStandardOohLineItemsToExpertRows([zero], cols, CS, CE)
  const spanQty = reopened!.mergedWeekSpans?.[0]?.totalQty
  const weekQty = reopened!.weeklyValues[cols[0]!.weekKey]
  assert.equal(spanQty ?? weekQty, 0)
})
