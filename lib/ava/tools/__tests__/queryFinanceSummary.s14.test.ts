/**
 * S14 (S12 review R7): Ava's finance summary sums billed and planned per month
 * in SQL, so no row cap drops money. Billed runs the shared C-399 rule
 * (`billedSentSql`, tested on a scratch database in
 * lib/finance/__tests__/billedSent.s14.db.test.ts); this test runs the tool
 * against a fake Ava database that records the query it is sent.
 */
import assert from "node:assert/strict"
import { after, test } from "node:test"

import { sql, type SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"

import { setAvaDbForTests } from "@/db/avaClient"
import { billedSentSql } from "@/lib/finance/billedSent"
import { queryFinanceSummaryTool } from "../queryFinanceSummary.js"
import type { AvaToolContext } from "../types.js"

const dialect = new PgDialect()
type Row = Record<string, unknown>

function fakeDb(billed: Row[], planned: Row[]) {
  const seen: { billed?: SQL; plannedGrouped: boolean; plannedLimited: boolean } = {
    plannedGrouped: false,
    plannedLimited: false,
  }
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "from", "leftJoin", "innerJoin", "where"]) chain[m] = () => chain
  chain.groupBy = async () => {
    seen.plannedGrouped = true
    return planned
  }
  chain.limit = async () => {
    seen.plannedLimited = true
    return planned
  }
  chain.execute = async (q: SQL) => {
    seen.billed = q
    return billed
  }
  return { db: chain as unknown as Parameters<typeof setAvaDbForTests>[0], seen }
}

const context = {
  pageContext: undefined,
  clientSlug: undefined,
  mbaNumber: undefined,
  versionNumber: undefined,
  enabledMediaTypes: undefined,
  userSub: "admin-1",
  userEmail: "admin@example.com",
  roles: ["admin"],
  clientSlugs: [],
  mbaNumbers: [],
  capturedPatch: null,
  capturedAttachments: null,
  capturedQuestions: null,
  pendingParsedPlan: null,
  capturedLineItemsLoad: null,
  currentLineItems: null,
} as unknown as AvaToolContext

const priorUrl = process.env.AVA_DATABASE_URL
process.env.AVA_DATABASE_URL = "postgres://ava-test"
after(() => {
  setAvaDbForTests(null)
  if (priorUrl === undefined) delete process.env.AVA_DATABASE_URL
  else process.env.AVA_DATABASE_URL = priorUrl
})

async function run(input: Record<string, unknown>, billed: Row[], planned: Row[] = []) {
  const fake = fakeDb(billed, planned)
  setAvaDbForTests(fake.db)
  const out = await queryFinanceSummaryTool.execute(input, context)
  assert.equal(out.isError, false, String(out.content))
  return { out: JSON.parse(String(out.content)), seen: fake.seen }
}

test("billed is the shared C-399 SQL, scoped to the question, summed per month in SQL", async () => {
  const { seen } = await run({ mba: "AC-001", fy: 2026 }, [])
  assert.ok(seen.billed)
  const sent = dialect.sqlToQuery(seen.billed)
  const rule = dialect.sqlToQuery(billedSentSql(sql.join([sql`finance_billing_records.mba_number = ${"AC-001"}`], sql` AND `)))
  assert.ok(sent.sql.includes(rule.sql), "the billed query wraps billedSentSql with the question's scope")
  // The FY filters the attributed month on the output, so a matched invoice issued
  // before the FY still counts in its record's month (R1).
  assert.match(sent.sql, /\) b\s+WHERE b\.billing_month >= \$\d+ AND b\.billing_month < \$\d+\s+GROUP BY b\.billing_month/)
  assert.deepEqual(sent.params, [...rule.params, "2025-07", "2026-07"])
})

test("months and invoice counts come from the grouped rows, with no row cap", async () => {
  const { out, seen } = await run(
    { mba: "AC-001" },
    [
      { billing_month: "2026-05", cents: "100600", invoices: "2" },
      { billing_month: "2026-07", cents: 30000, invoices: 1 },
    ],
    [
      { month: "2026-05-01", amountCents: "100000" },
      { month: "2026-06-01", amountCents: "25050" },
    ],
  )
  assert.equal(seen.plannedGrouped, true)
  assert.equal(seen.plannedLimited, false)
  assert.equal(out.billed_total_aud, 1306)
  assert.equal(out.planned_total_aud, 1250.5)
  assert.equal(out.billed_invoice_count, 3)
  assert.deepEqual(
    out.months.map((m: { month: string; billed_aud: number; planned_aud: number }) => [m.month, m.billed_aud, m.planned_aud]),
    [
      ["2026-05", 1006, 1000],
      ["2026-06", 0, 250.5],
      ["2026-07", 300, 0],
    ],
  )
  assert.equal("billing_record_count" in out, false)
})

test("a client question scopes billed by client name", async () => {
  const { seen } = await run({ client: "Acme" }, [])
  const sent = dialect.sqlToQuery(seen.billed!)
  assert.match(sent.sql, /finance_billing_records\.client_name ILIKE \$1/)
  assert.deepEqual(sent.params, ["%Acme%"])
})
