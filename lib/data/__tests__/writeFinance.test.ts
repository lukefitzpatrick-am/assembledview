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
  clearFinanceBillingRecordApproval,
  setFinanceBillingRecordApproved,
  setFinanceBillingRecordBilled,
  setFinanceBillingRecordExported,
  setFinanceBillingRecordNotes,
  upsertFinanceBillingRecordByInvoiceKey,
} from "@/lib/data/writeFinance"
import { billedSnapshotAmountEchoOk } from "@/lib/finance/billedSnapshotEcho"
import { hashBilledLineSet } from "@/lib/finance/billedDrift"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

async function skipPostgresIfLifecycleColumnsMissing(): Promise<string | boolean> {
  if (!hasDb) return "DATABASE_URL unset"
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'finance_billing_records'
        AND column_name = 'approved_at'
    ) AS exists
  `)
  const list = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: Array<{ exists?: boolean }> }).rows ?? [])
  const exists = Boolean((list[0] as { exists?: boolean } | undefined)?.exists)
  if (!exists) return "0053 approval columns not applied on this DATABASE_URL"
  return false
}

const skipPg = await skipPostgresIfLifecycleColumnsMissing()
if (skipPg) {
  await closeDb()
}

const MBA = `T01WF${Date.now().toString(36)}`
const INVOICE_KEY = `media:${MBA}:2026-09`
const INVOICE_KEY_B = `media:${MBA}:2026-10`
const LINE_SNAPSHOTS = [
  { item_code: "FEE", amount: 100.5, schedule_line_item_id: `${MBA}SE1` },
]
const HASH = hashBilledLineSet(LINE_SNAPSHOTS)
const KEYS = [INVOICE_KEY, INVOICE_KEY_B]

async function wipe(): Promise<void> {
  if (!hasDb) return
  const db = getDb()
  await db.execute(
    sql`DELETE FROM finance_billing_line_items
        WHERE finance_billing_records_id IN (
          SELECT id FROM finance_billing_records
          WHERE invoice_key IN (${INVOICE_KEY}, ${INVOICE_KEY_B})
        )`
  )
  await db.execute(
    sql`DELETE FROM finance_billing_records
        WHERE invoice_key IN (${INVOICE_KEY}, ${INVOICE_KEY_B})`
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
    await assert.rejects(
      () =>
        setFinanceBillingRecordApproved({
          invoiceKey: "xero:INV-1",
          approvedBy: 1,
          approvedByName: "Ada",
          approvedAmountCents: 100,
          approvedLinesHash: HASH,
        }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "XERO_KEY_REFUSED")
        return true
      }
    )
    await assert.rejects(
      () => clearFinanceBillingRecordApproval("xero:INV-1"),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "XERO_KEY_REFUSED")
        return true
      }
    )
    await assert.rejects(
      () => setFinanceBillingRecordExported({ invoiceKey: "xero:INV-1", exportedBy: 1 }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "XERO_KEY_REFUSED")
        return true
      }
    )
  })
})

describe("writeFinance postgres path", { skip: skipPg }, () => {
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

  it("approve stamps approval columns and the echo passes at cents precision", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
      initial_total: 100.123,
    })
    const approved = await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10012,
      approvedLinesHash: HASH,
    })
    const echoed = await fetchFinanceBillingRecordByIdFromPostgres(Number(approved.id))
    assert.ok(echoed)
    assert.ok(echoed.approved_at, "approved_at must be stamped")
    assert.equal(Number(echoed.approved_by), 7)
    assert.equal(echoed.approved_by_name, "Ada Admin")
    assert.equal(echoed.approved_lines_hash, HASH)
    assert.equal(billedSnapshotAmountEchoOk(echoed.approved_amount, 100.123), true)
    assert.equal(Math.round(Number(echoed.approved_amount) * 100), 10012)
  })

  it("approve is refused without reapprove when already approved", async () => {
    await assert.rejects(
      () =>
        setFinanceBillingRecordApproved({
          invoiceKey: INVOICE_KEY,
          approvedBy: 8,
          approvedByName: "Other",
          approvedAmountCents: 50,
          approvedLinesHash: HASH,
        }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "ALREADY_APPROVED")
        return true
      }
    )
    const reapproved = await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 8,
      approvedByName: "Other",
      approvedAmountCents: 50,
      approvedLinesHash: HASH,
      reapprove: true,
    })
    assert.equal(Number(reapproved.approved_by), 8)
    assert.equal(reapproved.approved_by_name, "Other")
  })

  it("unapprove refuses once exported", async () => {
    await setFinanceBillingRecordExported({ invoiceKey: INVOICE_KEY, exportedBy: 7 })
    await assert.rejects(
      () => clearFinanceBillingRecordApproval(INVOICE_KEY),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "ALREADY_EXPORTED")
        return true
      }
    )
  })

  it("mark-exported stamps exported_at and exported_by for every key in the batch", async () => {
    await wipe()
    for (const key of KEYS) {
      const month = key === INVOICE_KEY ? "2026-09" : "2026-10"
      await upsertFinanceBillingRecordByInvoiceKey(key, {
        billing_type: "media",
        clients_id: 1,
        client_name: "T0-1 writeFinance",
        mba_number: MBA,
        campaign_name: "T0-1",
        billing_month: month,
      })
    }
    const stamped = await Promise.all(
      KEYS.map((invoiceKey) =>
        setFinanceBillingRecordExported({ invoiceKey, exportedBy: 11 })
      )
    )
    assert.equal(stamped.length, 2)
    for (const row of stamped) {
      assert.ok(row.exported_at, "exported_at must be stamped")
      assert.equal(Number(row.exported_by), 11)
    }
    const listed = await fetchFinanceBillingRecordsFromPostgres()
    for (const key of KEYS) {
      const row = listed.find((r) => r.invoice_key === key)
      assert.ok(row, `missing ${key}`)
      assert.ok(row.exported_at)
      assert.equal(Number(row.exported_by), 11)
    }
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
