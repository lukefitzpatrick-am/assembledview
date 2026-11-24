/**
 * S14 (S12 review R7, R8): the C-399 billed rule in SQL (`billedSentSql`), with
 * its Xero status join, against Postgres. Scratch database only: set
 * BILLED_MONTHS_IT_DATABASE_URL (the S2 load test's variable). Each test makes
 * TEMP tables in a transaction and rolls back, so nothing is left behind.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { billedSentSql } from "../billedSent"

const url = process.env.BILLED_MONTHS_IT_DATABASE_URL?.trim()
const skip = url ? false : "scratch DB only (BILLED_MONTHS_IT_DATABASE_URL)"

class Rollback extends Error {}

const TABLES = sql`
  CREATE TEMP TABLE finance_billing_records (
    invoice_key text, mba_number text, client_name text, billing_month text,
    matched_xero_invoice_id text, exported_at timestamptz, billed boolean,
    billed_amount_cents bigint, approved_amount_cents bigint, total numeric
  );
  CREATE TEMP TABLE xero_ar_invoices (xero_invoice_id text, status text);
`

const ROWS = sql`
  INSERT INTO finance_billing_records VALUES
    ('xero:INV-1', 'AC001', 'Acme', '2026-05', NULL, NULL, true, 100000, NULL, 1000.00),
    ('media:AC001:2026-05', 'AC001', 'Acme', '2026-05', 'INV-1', NULL, false, NULL, 100000, 1000.00),
    ('media:AC001:2026-06', 'AC001', 'Acme', '2026-06', NULL, NULL, false, NULL, 50000, 500.00),
    ('media:AC001:2026-09', 'AC001', 'Acme', '2026-09', '  ', NULL, false, NULL, NULL, 90.00),
    ('media:AC001:2026-07', 'AC001', 'Acme', '2026-07', NULL, '2026-07-02', false, NULL, 30000, 299.99),
    ('media:AC001:2026-08', 'AC001', 'Acme', '2026-08', 'INV-9', NULL, false, NULL, 20000, NULL),
    ('media:AC001:2026-10', 'AC001', 'Acme', '2026-10', NULL, NULL, true, 1234, NULL, NULL),
    ('xero:INV-2', 'AC001', 'Acme', '2026-05', NULL, NULL, true, 40000, NULL, NULL),
    ('xero:INV-3', 'AC001', 'Acme', '2026-05', NULL, NULL, true, 5000, NULL, NULL),
    ('media:AC001:2026-04', 'AC001', 'Acme', '2026-04', 'INV-4', NULL, false, NULL, 7000, NULL),
    ('xero:INV-5', 'AC001', 'Acme', '2026-05 ', NULL, NULL, true, 600, NULL, NULL),
    ('XERO:INV-7', 'AC001', 'Acme', '2026-11', NULL, NULL, true, 700, NULL, NULL),
    ('media:AC001:2026-12', 'AC001', 'Acme', '2026-12', 'INV-8', NULL, false, NULL, 800, NULL),
    ('xero:INV-8', NULL, 'Other', '2026-12', NULL, NULL, true, 800, NULL, NULL),
    ('xero:INV-6', 'ZZ001', 'Zed', '2026-05', NULL, NULL, true, 5000, NULL, NULL),
    ('media:AC001:2026-03', 'AC001', 'Acme', '2026-03', 'inv-10', NULL, false, NULL, 3000, NULL),
    ('xero:INV-10', 'AC001', 'Acme', '2026-02', NULL, NULL, true, 3100, NULL, NULL),
    ('media:AC001:2027-01', 'AC001', 'Acme', '2027-01', ' INV-11 ', NULL, false, NULL, 999, NULL);
  INSERT INTO xero_ar_invoices VALUES
    ('INV-10', 'PAID'), ('INV-11', 'VOIDED'),
    ('INV-1', 'PAID'), ('INV-2', 'VOIDED'), ('INV-3', ' deleted '), ('INV-4', 'VOIDED'),
    ('INV-5', 'AUTHORISED'), ('INV-6', 'PAID'), ('INV-7', 'AUTHORISED'), ('INV-8', 'PAID'), ('INV-9', 'AUTHORISED');
`

async function billed(scope = sql`finance_billing_records.mba_number = 'AC001'`) {
  const client = postgres(url!, { max: 1, onnotice: () => undefined })
  const db = drizzle(client)
  let out: Array<[string, number]> = []
  try {
    await db.transaction(async (tx) => {
      await tx.execute(TABLES)
      await tx.execute(ROWS)
      const rows = (await tx.execute(
        sql`SELECT billing_month, cents FROM (${billedSentSql(scope)}) b ORDER BY billing_month, cents`,
      )) as unknown as Array<{ billing_month: string; cents: string | number }>
      out = rows.map((r) => [r.billing_month, Number(r.cents)])
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  } finally {
    await client.end()
  }
  return out
}

test("billed: each invoice once, sent only, voided and deleted left out, months trimmed", { skip }, async () => {
  assert.deepEqual(await billed(), [
    // INV-10 is matched by the 2026-03 record, so it counts there (R1).
    ["2026-03", 3100],
    // INV-1 once: the app record matched to it is left out. INV-5's month is trimmed.
    ["2026-05", 600],
    ["2026-05", 100000],
    // Sent to accounts, at its approved amount, not the stored total.
    ["2026-07", 30000],
    // Matched to a live invoice with no `xero:` row here.
    ["2026-08", 20000],
    ["2026-10", 1234],
    // An upper-case `xero:` key still joins its status.
    ["2026-11", 700],
    // INV-8's `xero:` row is outside this scope, so the matched app record is the invoice.
    ["2026-12", 800],
  ])
})

test("billed: a matched invoice counts in its record's month, not its issue month (R1)", { skip }, async () => {
  const rows = await billed()
  // INV-10 was issued in 2026-02, in advance of the 2026-03 record it matches.
  assert.deepEqual(rows.filter(([m]) => m === "2026-02" || m === "2026-03"), [["2026-03", 3100]])
  // A padded match id still joins its VOIDED status (R11), so 2027-01 is not billed.
  assert.equal(rows.some(([m]) => m === "2027-01"), false)
})

test("billed: the scope decides which `xero:` rows dedupe", { skip }, async () => {
  const rows = await billed(sql`true`)
  assert.equal(rows.filter(([m]) => m === "2026-12").length, 1)
  assert.equal(rows.reduce((s, [, c]) => s + c, 0), 600 + 100000 + 30000 + 20000 + 1234 + 700 + 800 + 5000 + 3100)
})
