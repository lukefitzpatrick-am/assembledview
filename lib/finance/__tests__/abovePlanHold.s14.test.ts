/**
 * S14 A: `splitAbovePlanHolds`, the choke point's split of a Send to accounts
 * pack into rows that go and media rows held above plan, against a fake
 * executor that answers the billed query and the reasons query.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"

import { insertAbovePlanReason, splitAbovePlanHolds } from "../abovePlanHold.server"
import type { AccountsPackRow } from "../sendToAccounts"
import type { BillingRecord } from "@/lib/types/financeBilling"

const dialect = new PgDialect()

function scheduleMonth(monthYear: string, total: number) {
  const money = (n: number) => "$" + n.toFixed(2)
  return {
    monthYear,
    mediaTotal: money(total),
    feeTotal: "$0.00",
    totalAmount: money(total),
    adservingTechFees: "$0.00",
    production: "$0.00",
    lineItems: { search: [{ id: "X1", header1: "Google", monthlyAmounts: { [monthYear]: total }, totalAmount: total }] },
  }
}

// AC-001 bills $1,000.00 in May and $500.00 in June: $1,500.00 in total.
const version = {
  id: 101,
  mba_number: "AC-001",
  campaign_status: "booked",
  campaign_start_date: "2026-05-01",
  campaign_end_date: "2026-06-30",
  billingSchedule: [scheduleMonth("May 2026", 1000), scheduleMonth("June 2026", 500)],
  deliverySchedule: [scheduleMonth("May 2026", 1000), scheduleMonth("June 2026", 500)],
}

const row = (over: Partial<AccountsPackRow>): AccountsPackRow => ({
  invoiceKey: "media:AC-001:2026-05",
  persistedId: 11,
  clientsId: 1,
  clientName: "Acme",
  mbaNumber: "AC-001",
  campaignName: "Winter",
  billingType: "media",
  status: "booked",
  billingMonth: "2026-05",
  total: 1000,
  blockers: [],
  ...over,
})
const records = [
  { invoice_key: "media:AC-001:2026-05", media_plan_version_id: 101 },
  { invoice_key: "media:ZZ-009:2026-05", media_plan_version_id: 999 },
] as unknown as BillingRecord[]

type Billed = { mba: string; billing_month: string; cents: string | number }
type Reason = { record_id: number; reason: string; covers_cents: number; by_name: string | null; at: string }

function fakeExec(billed: Billed[], reasons: Reason[] = []) {
  const sent: Array<{ sql: string; params: unknown[] }> = []
  const exec = {
    execute: async (q: SQL) => {
      const r = dialect.sqlToQuery(q)
      sent.push(r)
      return r.sql.includes("billing_above_plan_reasons") ? reasons : billed
    },
  }
  return { exec, sent }
}

test("a record within plan goes; a sow row goes and is never looked up", async () => {
  const { exec, sent } = fakeExec([{ mba: "ac-001", billing_month: "2026-04", cents: "50000" }])
  const sow = row({ invoiceKey: "sow:S1:2026-05", billingType: "sow", persistedId: 12, mbaNumber: "S1" })
  const out = await splitAbovePlanHolds(exec, { rows: [row({}), sow], records, versions: [version] })
  assert.deepEqual(out.rows.map((r) => r.invoiceKey), ["media:AC-001:2026-05", "sow:S1:2026-05"])
  assert.deepEqual(out.held, [])
  // The billed query is the shared billed rule, scoped to the pack's media MBAs, lower-cased.
  assert.match(sent[0]!.sql, /lower\(btrim\(finance_billing_records\.mba_number\)\) IN \(\$1\)/)
  assert.deepEqual(sent[0]!.params, ["ac-001"])
  assert.deepEqual(sent[1]!.params, [11])
  // The latest reason per record stands (R2; run on Postgres in abovePlanHold.s14.db).
  assert.match(sent[1]!.sql, /DISTINCT ON \(finance_billing_record_id\)[\s\S]*ORDER BY finance_billing_record_id, id DESC\s*$/)
})

test("billed so far plus this record over the plan's total is held, with the figures behind it", async () => {
  const { exec } = fakeExec([
    { mba: "ac-001", billing_month: "2026-04", cents: 50000 },
    { mba: "ac-001", billing_month: "2026-03", cents: 101 },
  ])
  const out = await splitAbovePlanHolds(exec, { rows: [row({})], records, versions: [version] })
  assert.deepEqual(out.rows, [])
  assert.equal(out.held.length, 1)
  assert.deepEqual(out.held[0], {
    invoiceKey: "media:AC-001:2026-05",
    persistedId: 11,
    clientName: "Acme",
    mbaNumber: "AC-001",
    billingMonth: "2026-05",
    toBillCents: 100000,
    planMonthCents: 100000,
    planTotalCents: 150000,
    billedMonthCents: 0,
    billedTotalCents: 50101,
    abovePlanCents: 101,
    reason: null,
  })
})

test("an invoice already billed this month holds the record (the month check)", async () => {
  const { exec } = fakeExec([{ mba: "ac-001", billing_month: "2026-05", cents: 20000 }])
  const out = await splitAbovePlanHolds(exec, { rows: [row({})], records, versions: [version] })
  assert.equal(out.held[0]?.abovePlanCents, 20000)
  assert.equal(out.held[0]?.billedMonthCents, 20000)
})

test("a reason covering the amount above plan lets it go; one covering less keeps it held", async () => {
  const billed = [{ mba: "ac-001", billing_month: "2026-04", cents: 80000 }]
  const covered = await splitAbovePlanHolds(
    fakeExec(billed, [{ record_id: 11, reason: "Agreed overage", covers_cents: 30000, by_name: "Luke", at: "2026-11-23" }]).exec,
    { rows: [row({})], records, versions: [version] },
  )
  assert.deepEqual(covered.held, [])
  assert.equal(covered.rows.length, 1)

  const short = await splitAbovePlanHolds(
    fakeExec(billed, [{ record_id: 11, reason: "Agreed overage", covers_cents: 29999, by_name: "Luke", at: "2026-11-23" }]).exec,
    { rows: [row({})], records, versions: [version] },
  )
  assert.equal(short.rows.length, 0)
  assert.deepEqual(short.held[0]?.reason, { reason: "Agreed overage", coversCents: 29999, byName: "Luke", at: "2026-11-23" })
})

test("a reason for another record does not count", async () => {
  const { exec } = fakeExec(
    [{ mba: "ac-001", billing_month: "2026-04", cents: 80000 }],
    [{ record_id: 99, reason: "Other", covers_cents: 900000, by_name: null, at: "x" }],
  )
  const out = await splitAbovePlanHolds(exec, { rows: [row({})], records, versions: [version] })
  assert.equal(out.held.length, 1)
})

test("a media record with no plan version is held in full (fail closed)", async () => {
  const { exec } = fakeExec([])
  const orphan = row({ invoiceKey: "media:ZZ-009:2026-05", persistedId: 13, mbaNumber: "ZZ-009", total: 250 })
  const out = await splitAbovePlanHolds(exec, { rows: [orphan], records, versions: [version] })
  assert.equal(out.held[0]?.planTotalCents, 0)
  assert.equal(out.held[0]?.abovePlanCents, 25000)
})

test("billed MBA keys match the pack's MBA in any case", async () => {
  const { exec } = fakeExec([{ mba: "ac-001", billing_month: "2026-05", cents: 500 }])
  const out = await splitAbovePlanHolds(exec, { rows: [row({ mbaNumber: " ac-001 " })], records, versions: [version] })
  assert.equal(out.held[0]?.billedMonthCents, 500)
})

test("no media rows: nothing is read", async () => {
  const { exec, sent } = fakeExec([])
  const sow = row({ invoiceKey: "sow:S1:2026-05", billingType: "sow" })
  const out = await splitAbovePlanHolds(exec, { rows: [sow], records, versions: [] })
  assert.equal(out.rows.length, 1)
  assert.equal(sent.length, 0)
})

test("insertAbovePlanReason appends one row with who and the amount covered", async () => {
  const { exec, sent } = fakeExec([])
  await insertAbovePlanReason(exec, { recordId: 11, reason: "Agreed overage", coversCents: 101, by: 7, byName: "Luke" })
  assert.match(sent[0]!.sql, /^\s*INSERT INTO billing_above_plan_reasons/)
  assert.deepEqual(sent[0]!.params, [11, "Agreed overage", 101, 7, "Luke"])
})
