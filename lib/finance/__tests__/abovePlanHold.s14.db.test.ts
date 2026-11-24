/**
 * S14 fix (review R2): the hold's reasons query against Postgres. The latest
 * reason for a record stands, not the oldest and not the largest. Scratch
 * database only: set BILLED_MONTHS_IT_DATABASE_URL. Each test makes TEMP
 * tables in a transaction and rolls back, so nothing is left behind.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { splitAbovePlanHolds } from "../abovePlanHold.server"
import type { AccountsPackRow } from "../sendToAccounts"

const url = process.env.BILLED_MONTHS_IT_DATABASE_URL?.trim()
const skip = url ? false : "scratch DB only (BILLED_MONTHS_IT_DATABASE_URL)"

class Rollback extends Error {}

const TABLES = sql`
  CREATE TEMP TABLE finance_billing_records (
    invoice_key text, mba_number text, billing_month text, matched_xero_invoice_id text,
    exported_at timestamptz, billed boolean, billed_amount_cents bigint,
    approved_amount_cents bigint, total numeric
  );
  CREATE TEMP TABLE xero_ar_invoices (xero_invoice_id text, status text);
  CREATE TEMP TABLE billing_above_plan_reasons (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, finance_billing_record_id bigint NOT NULL,
    reason text NOT NULL, covers_cents bigint NOT NULL, created_by bigint NOT NULL,
    created_by_name text, created_at timestamptz NOT NULL DEFAULT now()
  );
`

// Record 1's reasons grew: 500 then 600. Record 2's shrank: 700 then 500.
const REASONS = sql`
  INSERT INTO billing_above_plan_reasons (finance_billing_record_id, reason, covers_cents, created_by, created_by_name) VALUES
    (1, 'first', 500, 7, 'Fin'), (2, 'first', 700, 7, 'Fin'),
    (1, 'second', 600, 7, 'Fin'), (2, 'second', 500, 7, 'Fin');
`

const row = (persistedId: number): AccountsPackRow => ({
  invoiceKey: `media:AC-00${persistedId}:2026-05`,
  persistedId,
  clientsId: 1,
  clientName: "Acme",
  mbaNumber: `AC-00${persistedId}`,
  campaignName: "Winter",
  billingType: "media",
  status: "booked",
  billingMonth: "2026-05",
  // No plan version, so a plan of $0: each record is $6.00 above plan.
  total: 6,
  blockers: [],
})

test("the latest reason stands: a grown one releases, a shrunk one holds (R2)", { skip }, async () => {
  const client = postgres(url!, { max: 1, onnotice: () => undefined })
  const db = drizzle(client)
  let out: Awaited<ReturnType<typeof splitAbovePlanHolds>> | null = null
  try {
    await db.transaction(async (tx) => {
      await tx.execute(TABLES)
      await tx.execute(REASONS)
      out = await splitAbovePlanHolds(tx, { rows: [row(1), row(2)], records: [], versions: [] })
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  } finally {
    await client.end()
  }
  assert.ok(out)
  const { rows, held } = out as Awaited<ReturnType<typeof splitAbovePlanHolds>>
  assert.deepEqual(rows.map((r) => r.persistedId), [1])
  assert.deepEqual(
    held.map((h) => [h.persistedId, h.abovePlanCents, h.reason?.reason, h.reason?.coversCents]),
    [[2, 600, "second", 500]],
  )
})
