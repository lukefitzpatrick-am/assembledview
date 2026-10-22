import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"

import { buildPlanReconciliationWorkbook } from "../exportPlanReconciliation.js"
import {
  PLAN_RECONCILIATION_COLUMNS,
  buildPlanReconciliation,
  defaultReconciliationMonth,
  exportFactsFromRecord,
  isBillingMonth,
  joinPlanReconciliationInputs,
  reconcilePlanMonth,
  reconciliationMonthOptions,
  recordFactsFromSqlRow,
  type ExportMonthFacts,
  type PlanFactsSqlRow,
  type PlanMonthFacts,
  type PlanReconciliationInput,
  type RecordMonthFacts,
} from "../planReconciliation.js"

function plan(partial: Partial<PlanMonthFacts> = {}): PlanMonthFacts {
  return {
    versionId: 100,
    publishedAt: "2026-09-01T00:00:00Z",
    rowCount: 4,
    totalCents: 0,
    feeCents: 0,
    adservingCents: 0,
    serviceProductionCents: 0,
    lineProductionCents: 0,
    clientPaysMediaCents: 0,
    ...partial,
  }
}

function exported(partial: Partial<ExportMonthFacts> = {}): ExportMonthFacts {
  return { versionId: 100, totalCents: 0, feeCents: 0, adservingCents: 0, productionCents: 0, ...partial }
}

function record(partial: Partial<RecordMonthFacts> = {}): RecordMonthFacts {
  return {
    invoiceKey: "media:X:2026-09",
    totalCents: null,
    approvedCents: null,
    approvedAt: "2026-09-28T00:00:00Z",
    ...partial,
  }
}

function input(partial: Partial<PlanReconciliationInput> = {}): PlanReconciliationInput {
  return {
    month: "2026-09",
    mbaNumber: "X001",
    clientName: "Client",
    clientsId: 1,
    campaignName: "Campaign",
    plan: null,
    exported: null,
    record: null,
    ...partial,
  }
}

test("match to the cent has no reasons", () => {
  const row = reconcilePlanMonth(
    input({
      plan: plan({ totalCents: 1_424_572 }),
      exported: exported({ totalCents: 1_424_572 }),
      record: record({ approvedCents: 1_424_572, totalCents: 1_424_572 }),
    }),
  )
  assert.equal(row.status, "match")
  assert.equal(row.gapCents, 0)
  assert.deepEqual(row.reasons, [])
  assert.equal(row.financeSource, "approved snapshot")
})

test("PGAAUS014 shape: fee in the export header, no fee rows (C-94)", () => {
  const row = reconcilePlanMonth(
    input({
      mbaNumber: "PGAAUS014",
      plan: plan({ totalCents: 529_500, feeCents: 0 }),
      exported: exported({ totalCents: 661_875, feeCents: 132_375 }),
      record: record({ approvedCents: 661_875, totalCents: 661_875 }),
    }),
  )
  assert.equal(row.status, "gap")
  assert.equal(row.gapCents, 132_375)
  assert.equal(row.feeGapCents, 132_375)
  assert.deepEqual(row.reasons, ["fee_rows_missing"])
})

test("BICAU002 shape: 2 cents is rounding", () => {
  const row = reconcilePlanMonth(
    input({
      plan: plan({ totalCents: 4_963_405, feeCents: 261_647, adservingCents: 15_306 }),
      exported: exported({ totalCents: 4_963_403, feeCents: 261_647, adservingCents: 15_304 }),
      record: record({ approvedCents: 4_963_403 }),
    }),
  )
  assert.equal(row.gapCents, -2)
  assert.deepEqual(row.reasons, ["rounding"])
})

test("sinch001 shape: production on __service__production and a bare PROD line", () => {
  const row = reconcilePlanMonth(
    input({
      mbaNumber: "sinch001",
      plan: plan({
        totalCents: 11_491_897,
        adservingCents: 54_933,
        serviceProductionCents: 490_000,
        lineProductionCents: 490_000,
      }),
      exported: exported({ totalCents: 11_001_897, adservingCents: 54_933, productionCents: 490_000 }),
      record: record({ approvedCents: 11_001_897 }),
    }),
  )
  assert.equal(row.gapCents, -490_000)
  assert.deepEqual(row.reasons, ["production_counted_twice"])
})

test("republished after approval: plan moved, snapshot frozen", () => {
  const row = reconcilePlanMonth(
    input({
      mbaNumber: "BOSS011",
      plan: plan({ totalCents: 718_300, feeCents: 100_020, adservingCents: 4_800, publishedAt: "2026-10-05T00:00:00Z" }),
      exported: exported({ totalCents: 718_300, feeCents: 100_020, adservingCents: 4_800 }),
      record: record({ approvedCents: 932_638, approvedAt: "2026-09-28T00:00:00Z" }),
    }),
  )
  assert.equal(row.gapCents, 214_338)
  assert.equal(row.exportGapCents, 0)
  assert.deepEqual(row.reasons, ["republished_after_approval"])
})

test("approved snapshot differs from export without a republish", () => {
  const row = reconcilePlanMonth(
    input({
      plan: plan({ totalCents: 100_000, publishedAt: "2026-09-01T00:00:00Z" }),
      exported: exported({ totalCents: 100_000 }),
      record: record({ approvedCents: 90_000, approvedAt: "2026-09-28T00:00:00Z" }),
    }),
  )
  assert.deepEqual(row.reasons, ["approved_differs_from_export"])
})

test("no persisted record: export is the finance figure", () => {
  const row = reconcilePlanMonth(
    input({ plan: plan({ totalCents: 50_000 }), exported: exported({ totalCents: 50_000 }) }),
  )
  assert.equal(row.financeSource, "export")
  assert.equal(row.status, "match")
})

test("plan bills, finance has nothing", () => {
  const row = reconcilePlanMonth(input({ plan: plan({ totalCents: 320_000 }) }))
  assert.equal(row.gapCents, -320_000)
  assert.deepEqual(row.reasons, ["not_in_export"])
})

test("finance bills, plan has no rows", () => {
  const row = reconcilePlanMonth(input({ exported: exported({ totalCents: 10_000 }) }))
  assert.equal(row.planCents, null)
  assert.equal(row.gapCents, 10_000)
  assert.deepEqual(row.reasons, ["not_in_plan"])
})

test("export reading another version and client-pays rows are named", () => {
  const row = reconcilePlanMonth(
    input({
      plan: plan({ totalCents: 200_000, clientPaysMediaCents: 50_000 }),
      exported: exported({ versionId: 99, totalCents: 150_000 }),
    }),
  )
  assert.deepEqual(row.reasons, ["export_reads_other_version", "client_pays_in_plan"])
})

test("gap with nothing to explain it is unexplained", () => {
  const row = reconcilePlanMonth(
    input({ plan: plan({ totalCents: 100_000 }), exported: exported({ totalCents: 100_500 }) }),
  )
  assert.deepEqual(row.reasons, ["unexplained"])
  assert.match(row.reasonText, /Unexplained/)
})

test("exportFactsFromRecord splits service lines by item code", () => {
  const facts = exportFactsFromRecord({
    total: 49_634.03,
    media_plan_version_id: 42,
    line_items: [
      { item_code: "G.Media", line_type: "media", amount: 46_864.52 },
      { item_code: "Service", line_type: "service", amount: 2_616.47 },
      { item_code: "T.Adserving", line_type: "service", amount: 153.04 },
      { item_code: "Production", line_type: "service", amount: 0.1 },
    ] as never,
  })
  assert.deepEqual(facts, {
    versionId: 42,
    totalCents: 4_963_403,
    feeCents: 261_647,
    adservingCents: 15_304,
    productionCents: 10,
  })
})

test("recordFactsFromSqlRow reads numeric strings", () => {
  const facts = recordFactsFromSqlRow({
    invoice_key: "media:PENFOLD016:2026-09",
    mba_number: "PENFOLD016",
    clients_id: "5",
    client_name: "Penfolds",
    campaign_name: "Father's Day",
    total: "14245.72",
    approved_amount_cents: "1424572",
    approved_at: "2026-09-28T03:00:00Z",
  })
  assert.equal(facts.totalCents, 1_424_572)
  assert.equal(facts.approvedCents, 1_424_572)
})

test("join matches MBA numbers case-insensitively and fills names", () => {
  const planRow: PlanFactsSqlRow = {
    mba_number: "BICAU008",
    client_id: 3,
    mp_client_name: "BIC",
    campaign_name: "Back to school",
    version_id: 7,
    published_at: "2026-09-01T00:00:00Z",
    row_count: "2",
    total_cents: "288461",
    fee_cents: "28846",
    adserving_cents: "0",
    service_production_cents: "0",
    line_production_cents: "0",
    client_pays_media_cents: "0",
  }
  const inputs = joinPlanReconciliationInputs({
    month: "2026-09",
    plans: [planRow],
    records: [
      {
        invoice_key: "media:bicau008:2026-09",
        mba_number: "bicau008",
        clients_id: 3,
        client_name: "BIC",
        campaign_name: null,
        total: "2884.61",
        approved_amount_cents: 288461,
        approved_at: "2026-09-28T00:00:00Z",
      },
    ],
    exported: [
      {
        mba_number: "bicau008",
        client_name: "BIC",
        clients_id: 3,
        campaign_name: "Back to school",
        total: 2884.61,
        media_plan_version_id: 7,
        line_items: [{ item_code: "Service", line_type: "service", amount: 288.46 }] as never,
      },
    ],
  })
  assert.equal(inputs.length, 1)
  const report = buildPlanReconciliation("2026-09", inputs)
  assert.equal(report.kpis.mbaMonths, 1)
  assert.equal(report.kpis.matched, 1)
  assert.equal(report.rows[0].clientName, "BIC")
})

test("report puts gaps first and sums the net gap", () => {
  const report = buildPlanReconciliation("2026-09", [
    input({ mbaNumber: "A1", clientName: "A", plan: plan({ totalCents: 100 }), exported: exported({ totalCents: 100 }) }),
    input({ mbaNumber: "B1", clientName: "B", plan: plan({ totalCents: 100 }), exported: exported({ totalCents: 150 }) }),
    input({ mbaNumber: "C1", clientName: "C", plan: plan({ totalCents: 300 }), exported: exported({ totalCents: 200 }) }),
    input({ mbaNumber: "Z0", clientName: "Z", plan: plan({ totalCents: 0, rowCount: 1 }) }),
  ])
  assert.deepEqual(report.rows.map((r) => r.mbaNumber), ["B1", "C1", "A1"])
  assert.equal(report.kpis.gaps, 2)
  assert.equal(report.kpis.netGapCents, -50)
  assert.equal(report.kpis.absGapCents, 150)
})

test("month helpers use the Melbourne month", () => {
  // 31 Oct 2026 14:30 UTC is 1 Nov 2026 01:30 in Melbourne (AEDT).
  const now = new Date("2026-10-31T14:30:00Z")
  assert.equal(defaultReconciliationMonth(now), "2026-11")
  const options = reconciliationMonthOptions(now)
  assert.equal(options[0], "2027-01")
  assert.equal(options[2], "2026-11")
  assert.equal(options.at(-1), "2026-05")
  assert.equal(isBillingMonth("2026-09"), true)
  assert.equal(isBillingMonth("2026-13"), false)
  assert.equal(isBillingMonth("2026-9"), false)
})

test("workbook has the columns and money formats", async () => {
  const report = buildPlanReconciliation("2026-09", [
    input({ mbaNumber: "B1", clientName: "B", plan: plan({ totalCents: 100 }), exported: exported({ totalCents: 150 }) }),
  ])
  const buffer = await buildPlanReconciliationWorkbook(report.rows)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as never)
  const sheet = workbook.getWorksheet("Plan reconciliation")
  assert.ok(sheet)
  assert.deepEqual(
    (sheet!.getRow(1).values as unknown[]).slice(1),
    [...PLAN_RECONCILIATION_COLUMNS],
  )
  assert.equal(sheet!.getRow(2).getCell(9).value, 0.5)
  assert.equal(sheet!.getRow(2).getCell(12).value, "Unexplained")
})
