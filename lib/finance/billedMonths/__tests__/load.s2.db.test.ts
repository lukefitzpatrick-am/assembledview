/**
 * S2 A (B56fix R8): the real `loadBilledMonthsBase` SQL against Postgres.
 * Scratch database only: set BILLED_MONTHS_IT_DATABASE_URL. Each test makes
 * TEMP tables (they shadow any real table of the same name for this one
 * connection), fills them, runs the load and rolls back, so nothing is left
 * behind on any database.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { loadBilledMonthsBase } from "../load"

const url = process.env.BILLED_MONTHS_IT_DATABASE_URL?.trim()
const skip = url ? false : "scratch DB only (BILLED_MONTHS_IT_DATABASE_URL)"

class Rollback extends Error {}

type Tx = Parameters<typeof loadBilledMonthsBase>[0]

const TABLES = sql`
  CREATE TEMP TABLE media_plan_masters (id bigint, mba_number text, published_version_id bigint);
  CREATE TEMP TABLE media_plan_versions (
    id bigint, master_id bigint, mba_number text, version_number int,
    legacy_schedules jsonb, published_at timestamptz
  );
  CREATE TEMP TABLE finance_billing_records (
    invoice_key text, mba_number text, billing_month text, approved_at timestamptz,
    exported_at timestamptz, matched_xero_invoice_id text, billed boolean, billed_at timestamptz
  );
  CREATE TEMP TABLE xero_ar_invoices (xero_invoice_id text, status text);
  CREATE TEMP TABLE finance_periods (period_month date, status text);
  CREATE TEMP TABLE schedule_months (
    version_id bigint, line_item_id text, component text, basis text, month date, amount_cents bigint, source text
  );
`

const ROWS = sql`
  INSERT INTO media_plan_masters VALUES (1, 'TEST001', 11), (2, 'test002', 21);
  INSERT INTO media_plan_versions VALUES
    (10, 1, 'TEST001', 1, '{"billingSchedule": [{"monthYear": "v1"}]}', '2026-08-01T00:00:00Z'),
    (11, 1, 'TEST001', 2, '{"billingSchedule": [{"monthYear": "v2"}]}', '2026-09-01T00:00:00Z'),
    (12, 1, 'TEST001', 3, '{"billingSchedule": [{"monthYear": "v3"}]}', '2026-10-01T00:00:00Z'),
    (13, 1, 'TEST001', 4, '{"billingSchedule": [{"monthYear": "v4"}]}', NULL),
    (21, 2, 'test002', 1, '{"billingSchedule": []}', NULL);
  INSERT INTO finance_billing_records VALUES
    ('media:test001:2026-07', NULL, '2026-07', NULL, '2026-08-01', NULL, false, NULL),
    ('media:TEST001:2026-08', 'TEST001', '2026-08', '2026-08-30', NULL, 'inv-paid', false, NULL),
    ('media:test001:2026-09', 'TEST001', '2026-09', '2026-09-30', NULL, NULL, false, NULL),
    ('media:test001:2026-10', 'TEST001', '2026-10', NULL, NULL, 'inv-void', false, NULL),
    ('xero:inv-x1', 'test001', '2026-11', NULL, '1970-01-01', NULL, true, NULL),
    ('xero:inv-x2', 'TEST001', '2026-12', NULL, '1970-01-01', NULL, true, NULL),
    ('xero:inv-x3', 'other001', '2026-07', NULL, '1970-01-01', NULL, true, NULL),
    ('media:test0010:2026-07', 'TEST0010', '2026-07', NULL, '2026-08-01', NULL, false, NULL),
    ('media:test002:2026-07', 'test002', '2026-07', NULL, '2026-08-01', NULL, false, NULL);
  INSERT INTO xero_ar_invoices VALUES ('inv-paid', 'PAID'), ('inv-void', 'VOIDED'), ('inv-x1', 'AUTHORISED'), ('inv-x2', 'DELETED');
  INSERT INTO finance_periods VALUES ('2026-06-01', 'reconciled'), ('2026-05-01', 'open');
  INSERT INTO schedule_months VALUES
    (11, 'test001SM1', 'media', 'billing', '2026-07-01', 1000, 'computed'),
    (11, 'test001SM1', 'fee', 'billing', '2026-08-01', 150, 'override'),
    (11, 'test001SM1', 'media', 'delivery', '2026-07-01', 999, 'computed'),
    (12, 'test001SM1', 'media', 'billing', '2026-07-01', 5000, 'computed'),
    (10, 'test001SM1', 'media', 'billing', '2026-07-01', 7000, 'computed');
`

async function withScratch<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  const client = postgres(url!, { max: 1, onnotice: () => undefined })
  const db = drizzle(client)
  let out: T | undefined
  try {
    await db.transaction(async (tx) => {
      await tx.execute(TABLES)
      await tx.execute(ROWS)
      out = await run(tx as unknown as Tx)
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  } finally {
    await client.end()
  }
  return out as T
}

test("load: the tip by pointer and stamp, its billing rows only, invoiced months by MBA and media key", { skip }, async () => {
  const prev = process.env.FINANCE_PERIODS
  delete process.env.FINANCE_PERIODS
  try {
    const { base, invoiced } = await withScratch((tx) => loadBilledMonthsBase(tx, { mbaNumber: " test001 " }))
    assert.deepEqual(
      invoiced.map((m) => [m.month, m.reasons]),
      [
        // A media key with no mba_number on the row still counts.
        ["2026-07", ["sent_to_accounts"]],
        ["2026-08", ["xero_matched"]],
        // 2026-09 approved only, 2026-10 matched to a voided invoice, 2026-12 a deleted one: not invoiced.
        ["2026-11", ["xero_outside_av"]],
      ],
    )
    assert.ok(base)
    assert.equal(base.versionId, 11)
    assert.deepEqual(base.schedule, [{ monthYear: "v2" }])
    assert.deepEqual(
      base.rows.map((r) => [r.lineItemId, r.component, r.month, r.amountCents, r.source]).sort(),
      [
        ["test001SM1", "fee", "2026-08", 150, "override"],
        ["test001SM1", "media", "2026-07", 1000, "computed"],
      ],
    )
  } finally {
    if (prev === undefined) delete process.env.FINANCE_PERIODS
    else process.env.FINANCE_PERIODS = prev
  }
})

test("load: a closed finance period counts with FINANCE_PERIODS on", { skip }, async () => {
  const prev = process.env.FINANCE_PERIODS
  process.env.FINANCE_PERIODS = "on"
  try {
    const { invoiced } = await withScratch((tx) => loadBilledMonthsBase(tx, { mbaNumber: "test001" }))
    assert.deepEqual(
      invoiced.filter((m) => m.reasons.includes("finance_period_locked")).map((m) => m.month),
      ["2026-06"],
    )
  } finally {
    if (prev === undefined) delete process.env.FINANCE_PERIODS
    else process.env.FINANCE_PERIODS = prev
  }
})

test("load: a pointer to a version with no publish stamp is no tip", { skip }, async () => {
  const { base, invoiced } = await withScratch((tx) => loadBilledMonthsBase(tx, { mbaNumber: "test002" }))
  assert.equal(base, null)
  assert.deepEqual(invoiced, [])
})
