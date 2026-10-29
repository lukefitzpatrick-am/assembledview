import assert from "node:assert/strict"
import test from "node:test"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"

import {
  loadTrueUpWith,
  trueUpInvoicesSql,
  trueUpMatchedRecordsSql,
  trueUpPlansSql,
  trueUpScheduleSql,
} from "../load.js"
import { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } from "./fixtures.js"

const dialect = new PgDialect()
const render = (q: SQL) => dialect.sqlToQuery(q)

test("plans and schedule read the published version by pointer and stamp, billing basis only", () => {
  const plans = render(trueUpPlansSql()).sql
  assert.match(plans, /v\.id = m\.published_version_id AND v\.published_at IS NOT NULL/)
  assert.doesNotMatch(plans, /max\(/i)
  const schedule = render(trueUpScheduleSql()).sql
  assert.match(schedule, /s\.basis = 'billing'/)
  assert.match(schedule, /__service__production/)
  assert.match(schedule, /client_pays_for_media IS TRUE/)
  assert.doesNotMatch(schedule, /\b(INSERT|UPDATE|DELETE)\b/i)
})

test("invoices window: one month before from to three months after as-of, voided and deleted out", () => {
  const q = render(trueUpInvoicesSql("2026-07", "2026-09"))
  assert.deepEqual(q.params, ["2026-06-01", "2027-01-01"])
  assert.match(q.sql, /NOT IN \('VOIDED', 'DELETED'\)/)
  assert.match(q.sql, /SentToContact/)
  assert.match(q.sql, /LineAmountTypes/)
})

test("matched records: media keys with a Xero match, carrying matched_by", () => {
  const q = render(trueUpMatchedRecordsSql("2026-07", "2026-09"))
  assert.match(q.sql, /matched_xero_invoice_id IS NOT NULL/)
  assert.match(q.sql, /invoice_key LIKE 'media:%'/)
  assert.match(q.sql, /r\.matched_by/)
  assert.deepEqual(q.params, ["2026-04", "2026-12"])
})

test("loader wires the five reads into the report", async () => {
  const calls: string[] = []
  const report = await loadTrueUpWith(
    async (q) => {
      const text = render(q).sql
      calls.push(text)
      if (text.includes("FROM media_plan_masters m") && !text.includes("schedule_months")) return { rows: PLANS }
      if (text.includes("schedule_months")) return { rows: SCHEDULE }
      if (text.includes("max(last_synced_at)")) return { rows: [{ last_synced_at: "2026-10-29T00:15:00Z" }] }
      if (text.includes("FROM xero_ar_invoices i")) return { rows: INVOICES }
      if (text.includes("FROM finance_billing_records r")) return { rows: MATCHED_RECORDS }
      throw new Error(`unexpected query ${text}`)
    },
    { asOfMonth: "2026-09", fromMonth: "2026-07", now: new Date("2026-10-29T10:00:00Z") },
  )
  assert.equal(calls.length, 5)
  assert.equal(report.xeroSyncedAt, "2026-10-29T00:15:00.000Z")
  assert.equal(report.generatedAt, "2026-10-29T10:00:00.000Z")
  assert.equal(report.rows.find((r) => r.mbaNumber === "golf025")?.components.fee.gap, -163893)
})
