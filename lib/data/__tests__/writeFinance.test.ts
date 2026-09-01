/**
 * T0-1 — finance_billing_records app writes go to Postgres.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"

import { sql } from "drizzle-orm"

import { closeDb, getDb } from "@/db"
import {
  fetchFinanceBillingRecordByIdFromPostgres,
  fetchFinanceBillingRecordsFromPostgres,
  readFinanceBillingRecords,
} from "@/lib/data/readFinance"
import {
  FinanceBillingWriteError,
  setFinanceBillingRecordBilled,
  setFinanceBillingRecordNotes,
  upsertFinanceBillingRecordByInvoiceKey,
} from "@/lib/data/writeFinance"
import { hashBilledLineSet } from "@/lib/finance/billedDrift"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())
const MBA = `T01WF${Date.now().toString(36)}`
const INVOICE_KEY = `media:${MBA}:2026-09`
const LINE_SNAPSHOTS = [
  { item_code: "FEE", amount: 100.5, schedule_line_item_id: `${MBA}SE1` },
]
const HASH = hashBilledLineSet(LINE_SNAPSHOTS)

async function wipe(): Promise<void> {
  if (!hasDb) return
  const db = getDb()
  await db.execute(
    sql`DELETE FROM finance_billing_line_items
        WHERE finance_billing_records_id IN (
          SELECT id FROM finance_billing_records WHERE invoice_key = ${INVOICE_KEY}
        )`
  )
  await db.execute(
    sql`DELETE FROM finance_billing_records WHERE invoice_key = ${INVOICE_KEY}`
  )
}

describe("writeFinance xero: guard", () => {
  it("refuses an app write on a xero: invoice_key", async () => {
    await assert.rejects(
      () =>
        upsertFinanceBillingRecordByInvoiceKey("xero:INV-1", {
          billing_type: "media",
          clients_id: 1,
          client_name: "Nope",
          mba_number: "NOPE001",
          campaign_name: "Nope",
          billing_month: "2026-09",
        }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "XERO_KEY_REFUSED")
        return true
      }
    )
    await assert.rejects(
      () =>
        setFinanceBillingRecordBilled({
          invoiceKey: "xero:INV-1",
          billed: true,
          billedBy: 1,
          billedAt: new Date().toISOString(),
          billedAmountCents: 100,
          billedLinesHash: "abcd",
        }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "XERO_KEY_REFUSED")
        return true
      }
    )
    await assert.rejects(
      () => setFinanceBillingRecordNotes({ invoiceKey: "xero:INV-1", notes: "no" }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "XERO_KEY_REFUSED")
        return true
      }
    )
  })
})

describe("writeFinance postgres path", { skip: hasDb ? false : "DATABASE_URL unset" }, () => {
  after(async () => {
    await wipe()
    await closeDb()
  })

  it("marks billed, echo snapshot matches Postgres, and readFinanceBillingRecords returns billed=true", async () => {
    await wipe()
    const created = await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
      initial_total: 100.5,
    })
    const createdId = Number(created.id)
    assert.ok(createdId > 0)

    const billedAt = new Date().toISOString()
    const billed = await setFinanceBillingRecordBilled({
      invoiceKey: INVOICE_KEY,
      billed: true,
      billedBy: 42,
      billedAt,
      billedAmountCents: 10050,
      billedLinesHash: HASH,
    })

    const echoed = await fetchFinanceBillingRecordByIdFromPostgres(Number(billed.id))
    assert.ok(echoed)
    const echoAmount = Number(echoed.billed_amount)
    const echoHash =
      typeof echoed.billed_lines_hash === "string" ? echoed.billed_lines_hash : ""
    assert.equal(echoAmount, 100.5)
    assert.equal(echoHash, HASH)
    assert.equal(echoed.billed, true)

    const listed = await readFinanceBillingRecords()
    const row = listed.find((r) => r.invoice_key === INVOICE_KEY)
    assert.ok(row, "readFinanceBillingRecords should include the marked row")
    assert.equal(row.billed, true)

    const listedPg = await fetchFinanceBillingRecordsFromPostgres()
    assert.equal(
      listedPg.filter((r) => r.invoice_key === INVOICE_KEY).length,
      1
    )
  })

  it("round-trips notes through Postgres", async () => {
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
    })
    const saved = await setFinanceBillingRecordNotes({
      invoiceKey: INVOICE_KEY,
      notes: "bookkeeper note",
    })
    const echoed = await fetchFinanceBillingRecordByIdFromPostgres(Number(saved.id))
    assert.equal(echoed?.notes, "bookkeeper note")
  })

  it("a second mark-billed on the same invoice_key updates rather than duplicating", async () => {
    await setFinanceBillingRecordBilled({
      invoiceKey: INVOICE_KEY,
      billed: true,
      billedBy: 42,
      billedAt: new Date().toISOString(),
      billedAmountCents: 20000,
      billedLinesHash: HASH,
    })
    const listed = await fetchFinanceBillingRecordsFromPostgres()
    const matches = listed.filter((r) => r.invoice_key === INVOICE_KEY)
    assert.equal(matches.length, 1)
    assert.equal(Number(matches[0]?.billed_amount), 200)
  })
})
