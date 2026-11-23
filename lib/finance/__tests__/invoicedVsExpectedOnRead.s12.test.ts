/**
 * S12 (switch `billing_compute_on_read`): Invoiced vs expected takes an open
 * record's expected amount from the billing-month function (the real
 * composeBillingRecordsForMonth over fixture plan versions), and keeps the
 * stored copy once a record is approved, sent, matched or billed.
 * Run with --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

function scheduleMonth(monthYear: string, media: number, fee: number, lineId: string) {
  return {
    monthYear,
    mediaTotal: `$${media.toFixed(2)}`,
    feeTotal: `$${fee.toFixed(2)}`,
    totalAmount: `$${(media + fee).toFixed(2)}`,
    adservingTechFees: "$0.00",
    production: "$0.00",
    lineItems: { search: [{ id: lineId, header1: "Google", monthlyAmounts: { [monthYear]: media }, totalAmount: media }] },
  }
}

// AC-001 v2 is the plan now: May $1,000.00, June $500.00 (June was $650.00 when its record was saved).
const ac001 = {
  id: 101,
  version_number: 2,
  media_plan_master_id: 900,
  mba_number: "AC-001",
  campaign_name: "Winter Push",
  clients_id: 1,
  mp_client_name: "Acme",
  campaign_status: "booked",
  campaign_start_date: "2026-05-01",
  campaign_end_date: "2026-07-31",
  billingSchedule: [scheduleMonth("May 2026", 800, 200, "AC-001SE1"), scheduleMonth("June 2026", 400, 100, "AC-001SE1")],
  deliverySchedule: [scheduleMonth("May 2026", 800, 0, "AC-001SE1"), scheduleMonth("June 2026", 400, 0, "AC-001SE1")],
}
// AC-002 is a partial MBA: its billing schedule holds only the booked line ($350.00 in May), not the whole plan.
const ac002 = {
  id: 201,
  version_number: 1,
  media_plan_master_id: 901,
  mba_number: "AC-002",
  campaign_name: "May Sprint",
  clients_id: 2,
  mp_client_name: "Beta Co",
  campaign_status: "booked",
  campaign_start_date: "2026-05-01",
  campaign_end_date: "2026-05-31",
  mba_scope: { partial: true, months: ["2026-05"] },
  billingSchedule: [scheduleMonth("May 2026", 300, 50, "AC-002SE1")],
  deliverySchedule: [scheduleMonth("May 2026", 900, 0, "AC-002SE1")],
}
// AC-003 is a draft plan (not booked): To bill lists it, so on read does too. May $200.00.
const ac003 = {
  ...ac002,
  id: 301,
  media_plan_master_id: 902,
  mba_number: "AC-003",
  campaign_name: "Draft Idea",
  campaign_status: "draft",
  mba_scope: undefined,
  billingSchedule: [scheduleMonth("May 2026", 200, 0, "AC-003SE1")],
  deliverySchedule: [scheduleMonth("May 2026", 200, 0, "AC-003SE1")],
}
const clients = [
  { id: 1, clientname_input: "Acme", mp_client_name: "Acme", mbaidentifier: "AC" },
  { id: 2, clientname_input: "Beta Co", mp_client_name: "Beta Co", mbaidentifier: "AC" },
]

type Row = Record<string, unknown>
const row = (over: Row): Row => ({
  invoice_key: "",
  billing_month: "2026-05",
  client_name: "Acme",
  clients_id: 1,
  mba_number: "AC-001",
  campaign_name: "Winter Push",
  billing_type: "media",
  approved_amount_cents: null,
  total: null,
  billed_amount_cents: null,
  matched_xero_invoice_id: null,
  approved_at: null,
  exported_at: null,
  billed: false,
  xero_match_resolution: null,
  invoice_number: null,
  status: null,
  sub_total: null,
  ...over,
})

let planRows: Row[] = []
let switchOn = true
const switchKeys: string[] = []
let composeMonths: string[] = []
let scopeReads = 0

if (typeof mock.module === "function") {
  const relevant = await import("@/lib/finance/relevantPlanVersions")
  const overlay = await import("@/lib/finance/overlayFinanceStatus")
  const scheduleSource = await import("@/lib/finance/scheduleMonthsSource")
  await mock.module("@/db", {
    namedExports: {
      getDb: () => {
        let call = 0
        return { execute: async () => (call++ === 0 ? planRows : []) }
      },
    },
  })
  await mock.module("@/lib/features/server", {
    namedExports: {
      isFeatureOn: async (key: string) => {
        switchKeys.push(key)
        return switchOn
      },
    },
  })
  await mock.module("@/lib/finance/relevantPlanVersions", {
    namedExports: {
      ...relevant,
      fetchRelevantPlanVersionsForFinanceMonth: async (monthStr: string) => {
        composeMonths.push(monthStr)
        if (monthStr === "2026-03") return { error: "Failed to load media plan versions", status: 502 }
        const [year, month] = monthStr.split("-").map(Number)
        const map = relevant.buildMbaToLatestVersionMap([
          { id: 900, mba_number: "AC-001", version_number: 2 },
          { id: 901, mba_number: "AC-002", version_number: 1 },
          { id: 902, mba_number: "AC-003", version_number: 1 },
        ])
        return { relevantVersions: relevant.selectRelevantVersionsForMonth([ac001, ac002, ac003], map, year!, month!) }
      },
    },
  })
  await mock.module("@/lib/finance/xanoReferenceCache", {
    namedExports: { getCachedClients: async () => clients, getCachedPublishers: async () => [] },
  })
  await mock.module("@/lib/finance/scheduleMonthsSource", {
    namedExports: { ...scheduleSource, hydrateVersionsFinanceScheduleSource: async () => {} },
  })
  await mock.module("@/lib/data/readFinance", {
    namedExports: {
      readScopeOfWork: async () => {
        scopeReads++
        throw new Error("scope read failed")
      },
    },
  })
  await mock.module("@/lib/billing/readBillingGhostFinanceGuard", {
    namedExports: { readBillingGhostFinanceGuard: async () => false },
  })
  await mock.module("@/lib/finance/overlayFinanceStatus", {
    namedExports: { ...overlay, fetchPersistedFinanceStatusForMonth: async () => [] },
  })
}

const { loadInvoicedVsExpected } = await import("@/lib/finance/loadInvoicedVsExpected")

async function report(rows: Row[], on: boolean) {
  planRows = rows
  switchOn = on
  composeMonths = []
  const out = await loadInvoicedVsExpected({ fy: "fy26", clientId: null, type: "all", view: "all" })
  return new Map([...out.pairs, ...out.unmatchedMonths].map((r) => [`${r.reference}|${r.month}`, r]))
}

test("parity: an open record whose stored total is what the plan bills reads the same either way", { skip }, async () => {
  const rows = [row({ invoice_key: "media:AC-001:2026-05", total: "1000.00" })]
  const off = await report(rows, false)
  const on = await report(rows, true)
  assert.deepEqual(on.get("AC-001|2026-05"), off.get("AC-001|2026-05"))
  assert.equal(on.get("AC-001|2026-05")!.expectedCents, 100000)
  assert.equal(on.get("AC-001|2026-05")!.source, "schedule")
  assert.deepEqual(switchKeys.at(-1), "billing_compute_on_read")
})

test("an open record with a stale stored total is expected at what the plan bills now", { skip }, async () => {
  const rows = [row({ invoice_key: "media:ac-001:2026-06", billing_month: "2026-06", total: "650.00", approved_amount_cents: 65000 })]
  assert.equal((await report(rows, false)).get("AC-001|2026-06")!.expectedCents, 65000)
  const on = (await report(rows, true)).get("AC-001|2026-06")!
  assert.equal(on.expectedCents, 50000, "June bills $500.00 now; the key matches in any case")
  assert.equal(on.source, "schedule")
  assert.deepEqual(composeMonths, ["2026-06"], "only the open record's month is composed")
})

test("an open record for a month the plan no longer bills is expected at nothing", { skip }, async () => {
  const rows = [row({ invoice_key: "media:AC-001:2026-04", billing_month: "2026-04", total: "120.00", billed_amount_cents: 12000 })]
  const on = (await report(rows, true)).get("AC-001|2026-04")!
  assert.equal(on.expectedCents, 0)
})

test("a partial MBA reads its billing schedule (the booked line), not the whole plan", { skip }, async () => {
  const rows = [row({ invoice_key: "media:AC-002:2026-05", mba_number: "AC-002", clients_id: 2, client_name: "Beta Co", total: "950.00" })]
  assert.equal((await report(rows, true)).get("AC-002|2026-05")!.expectedCents, 35000)
})

test("approved, sent, matched or billed records keep their stored copy and compose nothing", { skip }, async () => {
  const stamps: Row[] = [
    { approved_at: "2026-06-02T00:00:00Z" },
    { exported_at: "2026-06-03T00:00:00Z" },
    { matched_xero_invoice_id: "x-1", sub_total: "650.00", status: "AUTHORISED" },
    { billed: true },
  ]
  for (const stamp of stamps) {
    const rows = [row({ invoice_key: "media:AC-001:2026-06", billing_month: "2026-06", total: "650.00", approved_amount_cents: 65000, ...stamp })]
    const on = (await report(rows, true)).get("AC-001|2026-06")!
    assert.equal(on.expectedCents, 65000, JSON.stringify(stamp))
    assert.equal(on.source, "approved snapshot")
    assert.deepEqual(composeMonths, [], "nothing to compose when every record stands")
  }
})

test("off: the stored amounts, and the billing-month function is never called", { skip }, async () => {
  const rows = [row({ invoice_key: "media:AC-001:2026-06", billing_month: "2026-06", total: "650.00" })]
  const off = (await report(rows, false)).get("AC-001|2026-06")!
  assert.equal(off.expectedCents, 65000)
  assert.equal(off.source, "schedule")
  assert.deepEqual(composeMonths, [])
})

test("a month the billing-month function cannot load fails the report, never the stored copy", { skip }, async () => {
  const rows = [row({ invoice_key: "media:AC-001:2026-03", billing_month: "2026-03", total: "10.00" })]
  await assert.rejects(report(rows, true), /2026-03: Failed to load media plan versions/)
})

test("open records in two months compose both months", { skip }, async () => {
  const rows = [
    row({ invoice_key: "media:AC-001:2026-05", total: "1.00" }),
    row({ invoice_key: "media:AC-001:2026-06", billing_month: "2026-06", total: "2.00" }),
  ]
  const on = await report(rows, true)
  assert.deepEqual(composeMonths, ["2026-05", "2026-06"])
  assert.equal(on.get("AC-001|2026-05")!.expectedCents, 100000)
  assert.equal(on.get("AC-001|2026-06")!.expectedCents, 50000)
})

test("a plan that is not booked is read too, as To bill lists it", { skip }, async () => {
  const rows = [row({ invoice_key: "media:AC-003:2026-05", mba_number: "AC-003", clients_id: 2, client_name: "Beta Co", total: "1.00" })]
  assert.equal((await report(rows, true)).get("AC-003|2026-05")!.expectedCents, 20000)
})

test("open SOW and retainer records keep their stored copy: a failed scope read never reads $0", { skip }, async () => {
  scopeReads = 0
  const rows = [
    row({ invoice_key: "sow:SOW-9:2026-05", billing_type: "sow", mba_number: "SOW-9", total: "123.00" }),
    row({ invoice_key: "retainer:1:2026-05", billing_type: "retainer", mba_number: "", campaign_name: "Retainer", total: "456.00" }),
    row({ invoice_key: "media:AC-001:2026-05", total: "1.00" }),
  ]
  const on = await report(rows, true)
  assert.equal(on.get("SOW-9|2026-05")!.expectedCents, 12300)
  assert.equal(on.get("Retainer|2026-05")!.expectedCents, 45600)
  assert.equal(on.get("AC-001|2026-05")!.expectedCents, 100000)
  assert.equal(scopeReads, 0, "on read composes media only, so the failing scope source is never read")
})
