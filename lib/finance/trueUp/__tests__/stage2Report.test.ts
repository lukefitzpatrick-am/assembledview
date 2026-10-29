/**
 * True-up report with the 0109 inputs: hand links, billing timing and the
 * ledger (explained, one-off and credit-note entries).
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"

import {
  attributeInvoiceLines,
  buildTrueUpReport,
  type TrueUpActionSqlRow,
  type TrueUpInvoiceSqlRow,
  type TrueUpPlanSqlRow,
  type TrueUpScheduleSqlRow,
} from "../compute.js"
import { loadTrueUpWith, trueUpActionsSql } from "../load.js"
import { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } from "./fixtures.js"

const plan = (mba: string, clientId = 1, end = "2026-12-31"): TrueUpPlanSqlRow => ({
  master_id: clientId * 10,
  mba_number: mba,
  client_id: clientId,
  mp_client_name: "Test client",
  campaign_name: "Test",
  campaign_status: "booked",
  campaign_end_date: end,
  version_id: 100 + clientId,
  version_number: 1,
})

const sched = (mba: string, month: string, fee: number): TrueUpScheduleSqlRow => ({
  mba_number: mba,
  month,
  fee_cents: fee,
  adserving_cents: 0,
  media_cents: 0,
  service_production_cents: 0,
  line_production_cents: 0,
  client_pays_media_cents: 0,
})

const inv = (id: string, issue: string, mba: string | null, feeDollars: number): TrueUpInvoiceSqlRow => ({
  xero_invoice_id: id,
  invoice_number: `INV-${id}`,
  status: "AUTHORISED",
  issue_date: issue,
  mba_number: mba,
  reference_raw: mba ?? "",
  sent_to_contact: "true",
  invoice_type: "ACCREC",
  line_amount_types: "Exclusive",
  line_items_json: [{ ItemCode: "Service", AccountCode: "21403", LineAmount: feeDollars, TaxAmount: 0 }],
})

test("a hand link wins over the invoice's own MBA and can set the month", () => {
  const out = attributeInvoiceLines({
    invoices: [inv("x", "2026-05-31", "golf012", 1000), inv("y", "2026-08-04", null, 500)],
    matchedRecords: [],
    masters: [{ id: 1, mba_number: "golf025" }, { id: 2, mba_number: "jayco017" }],
    publishedMbaKeys: new Set(["golf025", "jayco017"]),
    invoiceLinks: [
      { xero_invoice_id: "x", mba_number: "golf025", billing_month: null },
      { xero_invoice_id: "y", mba_number: "JAYCO017", billing_month: "2026-07-01" },
    ],
  })
  assert.deepEqual(
    out.lines.map((l) => [l.invoiceNumber, l.mbaKey, l.month, l.source]),
    [
      ["INV-x", "golf025", "2026-05", "hand_link"],
      ["INV-y", "jayco017", "2026-07", "hand_link"],
    ],
  )
})

test("billing timing: month ahead moves the issue month on, in arrears moves it back", () => {
  const base = {
    asOfMonth: "2026-09",
    fromMonth: "2026-07",
    plans: [plan("mit001", 5), plan("arr001", 6)],
    schedule: [
      sched("mit001", "2026-08", 105000),
      sched("mit001", "2026-09", 105000),
      sched("arr001", "2026-08", 50000),
      sched("arr001", "2026-09", 50000),
    ],
    invoices: [
      inv("m1", "2026-07-31", "mit001", 1050),
      inv("m2", "2026-08-31", "mit001", 1050),
      inv("a1", "2026-09-03", "arr001", 500),
      inv("a2", "2026-10-02", "arr001", 500),
    ],
    matchedRecords: [],
  }
  const without = buildTrueUpReport(base)
  const mitWithout = without.rows.find((r) => r.mbaNumber === "mit001")!
  assert.equal(mitWithout.months.find((m) => m.month === "2026-07")!.components.fee.invoiced, 105000)
  assert.equal(mitWithout.months.find((m) => m.month === "2026-09")!.components.fee.invoiced, 0)
  const withTiming = buildTrueUpReport({ ...base, billingTiming: { "5": "month_ahead", "6": "in_arrears" } })
  const mit = withTiming.rows.find((r) => r.mbaNumber === "mit001")!
  assert.equal(mit.components.fee.status, "matches")
  assert.equal(mit.months.find((m) => m.month === "2026-08")!.components.fee.invoiced, 105000)
  const arr = withTiming.rows.find((r) => r.mbaNumber === "arr001")!
  assert.equal(arr.months.find((m) => m.month === "2026-08")!.components.fee.invoiced, 50000)
  assert.equal(arr.months.find((m) => m.month === "2026-09")!.components.fee.invoiced, 50000)
  assert.equal(arr.components.fee.status, "matches")
})

test("explained and to-raise ledger entries cover the gap while it stays within $1", () => {
  const base = {
    asOfMonth: "2026-08",
    fromMonth: "2026-07",
    plans: [plan("abc001")],
    schedule: [sched("abc001", "2026-07", 100000), sched("abc001", "2026-08", 100000), sched("abc001", "2026-09", 100000)],
    invoices: [inv("1", "2026-07-31", "abc001", 1000), inv("2", "2026-08-31", "abc001", 900)],
    matchedRecords: [],
  }
  const action = (over: Partial<TrueUpActionSqlRow>): TrueUpActionSqlRow => ({
    id: 1,
    mba_number: "ABC001",
    component: "fee",
    action: "explained",
    gap_cents: -10000,
    amount_cents: 0,
    as_of_month: "2026-08",
    billing_revision_id: null,
    reason_code: "client_agreed",
    note: "Agreed discount",
    xero_invoice_id: null,
    created_at: "2026-09-02T00:00:00.000Z",
    created_by_name: "Luke",
    ...over,
  })
  const plain = buildTrueUpReport(base)
  assert.equal(plain.rows[0]!.components.fee.status, "gap")
  const explained = buildTrueUpReport({ ...base, actions: [action({})] })
  const fee = explained.rows[0]!.components.fee
  assert.equal(fee.status, "explained")
  assert.equal(fee.underlyingStatus, "gap")
  assert.equal(fee.coveredBy!.note, "Agreed discount")
  assert.equal(explained.totals.mbasNeedingAction, 0)
  assert.equal(explained.rows[0]!.actions.length, 1)
  // The gap moves by $1 or more: it flags again.
  const moved = buildTrueUpReport({ ...base, actions: [action({ gap_cents: -9000 })] })
  assert.equal(moved.rows[0]!.components.fee.status, "gap")
  // A one-off charge to raise of $100.
  const raise = buildTrueUpReport({ ...base, actions: [action({ action: "one_off", gap_cents: -10000, amount_cents: -10000 })] })
  assert.equal(raise.rows[0]!.components.fee.status, "to_raise")
  assert.match(raise.rows[0]!.components.fee.suggestion, /Charge recorded to raise/)
})

test("loader reads the 0109 tables only when asked (marker), and the ledger query is applied rows only", async () => {
  const dialect = new PgDialect()
  const seen: string[] = []
  const run = async (q: SQL) => {
    const text = dialect.sqlToQuery(q).sql
    seen.push(text)
    if (text.includes("FROM media_plan_masters m") && !text.includes("schedule_months")) return { rows: PLANS }
    if (text.includes("schedule_months")) return { rows: SCHEDULE }
    if (text.includes("max(last_synced_at)")) return { rows: [{ last_synced_at: "2026-10-29T00:15:00Z" }] }
    if (text.includes("FROM xero_ar_invoices i")) return { rows: INVOICES }
    if (text.includes("FROM finance_billing_records r")) return { rows: MATCHED_RECORDS }
    if (text.includes("true_up_invoice_links")) return { rows: [] }
    if (text.includes("client_finance_owners")) return { rows: [{ client_id: 19, billing_timing: "same_month" }] }
    if (text.includes("true_up_actions")) return { rows: [] }
    throw new Error(`unexpected ${text}`)
  }
  await loadTrueUpWith(run, { asOfMonth: "2026-09", fromMonth: "2026-07" })
  assert.equal(seen.some((t) => t.includes("true_up_")), false)
  seen.length = 0
  await loadTrueUpWith(run, { asOfMonth: "2026-09", fromMonth: "2026-07", with0109: true })
  assert.equal(seen.filter((t) => t.includes("true_up_") || t.includes("client_finance_owners")).length, 3)
  assert.match(dialect.sqlToQuery(trueUpActionsSql()).sql, /status = 'applied'/)
})
