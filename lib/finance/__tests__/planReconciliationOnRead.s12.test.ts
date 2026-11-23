/**
 * S12 (switch `billing_compute_on_read`): Plan reconciliation drops the stored
 * figure of a record that is not yet approved, sent, matched or billed, so the
 * finance figure is the To bill figure from the billing-month function (the
 * real composeBillingRecordsForMonth over a fixture version). Approved and
 * sent records keep their snapshot. Run with --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { defaultReconciliationMonth } from "@/lib/finance/planReconciliation"
import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

function scheduleMonth(monthYear: string, media: number, fee: number) {
  return {
    monthYear,
    mediaTotal: `$${media.toFixed(2)}`,
    feeTotal: `$${fee.toFixed(2)}`,
    totalAmount: `$${(media + fee).toFixed(2)}`,
    adservingTechFees: "$0.00",
    production: "$0.00",
    lineItems: { search: [{ id: "AC-001SE1", header1: "Google", monthlyAmounts: { [monthYear]: media }, totalAmount: media }] },
  }
}

// The plan now: June $500.00, December $300.00, nothing in November.
const ac001 = {
  id: 101,
  version_number: 2,
  media_plan_master_id: 900,
  mba_number: "AC-001",
  campaign_name: "Winter Push",
  clients_id: 1,
  mp_client_name: "Acme",
  campaign_status: "booked",
  campaign_start_date: "2026-06-01",
  campaign_end_date: "2026-12-31",
  billingSchedule: [scheduleMonth("June 2026", 400, 100), scheduleMonth("December 2026", 250, 50)],
  deliverySchedule: [scheduleMonth("June 2026", 400, 0), scheduleMonth("December 2026", 250, 0)],
}

const planRow = (totalCents: number, feeCents: number) => ({
  mba_number: "AC-001",
  client_id: 1,
  mp_client_name: "Acme",
  campaign_name: "Winter Push",
  version_id: 101,
  published_at: "2026-05-20T00:00:00Z",
  row_count: 2,
  total_cents: totalCents,
  fee_cents: feeCents,
  adserving_cents: 0,
  service_production_cents: 0,
  line_production_cents: 0,
  client_pays_media_cents: 0,
})

type Row = Record<string, unknown>
const record = (month: string, over: Row = {}): Row => ({
  invoice_key: `media:AC-001:${month}`,
  mba_number: "AC-001",
  clients_id: 1,
  client_name: "Acme",
  campaign_name: "Winter Push",
  total: "650.00",
  approved_amount_cents: 65000,
  approved_at: null,
  exported_at: null,
  matched_xero_invoice_id: null,
  billed: false,
  ...over,
})

let plans: Row[] = []
let records: Row[] = []
let switchOn = true
const composeMonths: string[] = []

if (typeof mock.module === "function") {
  const relevant = await import("@/lib/finance/relevantPlanVersions")
  const overlay = await import("@/lib/finance/overlayFinanceStatus")
  const scheduleSource = await import("@/lib/finance/scheduleMonthsSource")
  await mock.module("@/db", {
    namedExports: {
      getDb: () => {
        let call = 0
        return { execute: async () => (call++ === 0 ? plans : records) }
      },
    },
  })
  await mock.module("@/lib/features/server", {
    namedExports: { isFeatureOn: async (key: string) => key === "billing_compute_on_read" && switchOn },
  })
  await mock.module("@/lib/finance/relevantPlanVersions", {
    namedExports: {
      ...relevant,
      fetchRelevantPlanVersionsForFinanceMonth: async (monthStr: string) => {
        composeMonths.push(monthStr)
        const [year, month] = monthStr.split("-").map(Number)
        const map = relevant.buildMbaToLatestVersionMap([{ id: 900, mba_number: "AC-001", version_number: 2 }])
        return { relevantVersions: relevant.selectRelevantVersionsForMonth([ac001], map, year!, month!) }
      },
    },
  })
  await mock.module("@/lib/finance/xanoReferenceCache", {
    namedExports: {
      getCachedClients: async () => [{ id: 1, clientname_input: "Acme", mp_client_name: "Acme", mbaidentifier: "AC" }],
      getCachedPublishers: async () => [],
    },
  })
  await mock.module("@/lib/finance/scheduleMonthsSource", {
    namedExports: { ...scheduleSource, hydrateVersionsFinanceScheduleSource: async () => {} },
  })
  await mock.module("@/lib/data/readFinance", { namedExports: { readScopeOfWork: async () => [] } })
  await mock.module("@/lib/billing/readBillingGhostFinanceGuard", {
    namedExports: { readBillingGhostFinanceGuard: async () => false },
  })
  await mock.module("@/lib/finance/overlayFinanceStatus", {
    namedExports: { ...overlay, fetchPersistedFinanceStatusForMonth: async () => [] },
  })
}

const { loadPlanReconciliation } = await import("@/lib/finance/loadPlanReconciliation")

async function rowFor(month: string, on: boolean) {
  switchOn = on
  composeMonths.length = 0
  const report = await loadPlanReconciliation(month)
  assert.deepEqual(composeMonths, [month])
  return report.rows.find((r) => r.mbaNumber === "AC-001")
}

test("parity: an open record that matches the plan gives the same row either way", { skip }, async () => {
  plans = [planRow(50000, 10000)]
  records = [record("2026-06", { total: "500.00", approved_amount_cents: null })]
  const off = await rowFor("2026-06", false)
  const on = await rowFor("2026-06", true)
  assert.equal(off!.financeCents, 50000)
  assert.equal(on!.financeCents, 50000)
  assert.equal(off!.status, "match")
  assert.equal(on!.status, "match")
  assert.equal(on!.financeSource, "export")
})

test("an open record's stale stored figure gives way to the To bill figure", { skip }, async () => {
  plans = [planRow(50000, 10000)]
  records = [record("2026-06")]
  const off = await rowFor("2026-06", false)
  assert.equal(off!.financeCents, 65000)
  assert.equal(off!.financeSource, "approved snapshot")
  assert.equal(off!.status, "gap")
  const on = await rowFor("2026-06", true)
  assert.equal(on!.financeCents, 50000)
  assert.equal(on!.recordCents, null)
  assert.equal(on!.status, "match")
})

test("approved, sent, matched or billed records keep their snapshot and still show the gap", { skip }, async () => {
  plans = [planRow(50000, 10000)]
  for (const stamp of [
    { approved_at: "2026-06-02T00:00:00Z" },
    { exported_at: "2026-06-03T00:00:00Z" },
    { matched_xero_invoice_id: "x-1" },
    { billed: true },
  ]) {
    records = [record("2026-06", stamp)]
    const on = await rowFor("2026-06", true)
    assert.equal(on!.financeCents, 65000, JSON.stringify(stamp))
    assert.equal(on!.financeSource, "approved snapshot")
    assert.equal(on!.status, "gap")
  }
})

test("Melbourne month edge: from 1 Dec in Melbourne (30 Nov 13:30 UTC) the default month reads December", { skip }, async () => {
  plans = [planRow(30000, 5000)]
  records = [record("2026-12", { total: "999.00", approved_amount_cents: null })]
  const december = defaultReconciliationMonth(new Date("2026-11-30T13:30:00Z"))
  assert.equal(december, "2026-12")
  const on = await rowFor(december, true)
  assert.equal(on!.financeCents, 30000, "December bills $300.00 now")
  assert.equal(on!.status, "match")
  assert.equal(defaultReconciliationMonth(new Date("2026-11-30T12:59:00Z")), "2026-11")
})
