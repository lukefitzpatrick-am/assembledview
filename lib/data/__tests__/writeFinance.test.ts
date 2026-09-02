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
  classifyApprovePersistedKeys,
  classifyMarkExportedKeys,
  billingBatchOk,
  classifyUnapproveKeys,
  clearFinanceBillingRecordApproval,
  clearFinanceBillingRecordExported,
  createFinanceBillingLineItem,
  deleteFinanceBillingLineItemById,
  loadFinanceBillingKeyStamps,
  materialiseAndApproveFinanceBillingRecord,
  patchFinanceBillingLineItemById,
  patchFinanceBillingRecordById,
  reapproveAuditOldValue,
  setFinanceBillingRecordApproved,
  setFinanceBillingRecordBilled,
  setFinanceBillingRecordExported,
  setFinanceBillingRecordNotes,
  setFinanceBillingRecordXeroMatch,
  stampExportedKeysSkippingUnapproved,
  upsertFinanceBillingRecordByInvoiceKey,
} from "@/lib/data/writeFinance"
import { persistAutoStamps } from "@/lib/finance/sections/draftMatchQuery"
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
const XERO_INVOICE_KEY = `xero:${MBA}:2026-09`
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
          WHERE invoice_key IN (${INVOICE_KEY}, ${INVOICE_KEY_B}, ${XERO_INVOICE_KEY})
        )`
  )
  await db.execute(
    sql`DELETE FROM finance_billing_records
        WHERE invoice_key IN (${INVOICE_KEY}, ${INVOICE_KEY_B}, ${XERO_INVOICE_KEY})`
  )
}

async function lineItemRowCount(id: number): Promise<number> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM finance_billing_line_items WHERE id = ${id}
  `)
  const list = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: Array<{ n?: number }> }).rows ?? [])
  return Number((list[0] as { n?: number } | undefined)?.n ?? 0)
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
    await assert.rejects(
      () => clearFinanceBillingRecordExported("xero:INV-1"),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "XERO_KEY_REFUSED")
        return true
      }
    )
  })
})

describe("writeFinance batch key classification", () => {
  it("unapprove treats a missing key as a per-key error, not a batch abort", () => {
    const stamps = new Map([
      ["media:A:2026-09", { approved_at: "2026-09-01T00:00:00Z", approved_amount_cents: 100, exported_at: null }],
    ])
    const classified = classifyUnapproveKeys(["media:A:2026-09", "media:MISSING:2026-09"], stamps)
    assert.deepEqual(classified.actionable, ["media:A:2026-09"])
    assert.deepEqual(classified.errors, [
      { invoice_key: "media:MISSING:2026-09", error: "not_found" },
    ])
  })

  it("unapprove treats an exported key as a per-key already_exported error", () => {
    const stamps = new Map([
      ["media:A:2026-09", { approved_at: "2026-09-01T00:00:00Z", approved_amount_cents: 100, exported_at: null }],
      ["media:B:2026-09", { approved_at: "2026-09-01T00:00:00Z", approved_amount_cents: 100, exported_at: "2026-09-02T00:00:00Z" }],
    ])
    const classified = classifyUnapproveKeys(["media:A:2026-09", "media:B:2026-09"], stamps)
    assert.deepEqual(classified.actionable, ["media:A:2026-09"])
    assert.equal(classified.errors[0]?.error, "already_exported")
  })

  it("mark-sent skips unapproved and errors missing, without aborting", () => {
    const stamps = new Map([
      ["media:A:2026-09", { approved_at: "2026-09-01T00:00:00Z", approved_amount_cents: 100, exported_at: null }],
      ["media:B:2026-09", { approved_at: null, approved_amount_cents: null, exported_at: null }],
    ])
    const classified = classifyMarkExportedKeys(
      ["media:A:2026-09", "media:B:2026-09", "media:MISSING:2026-09"],
      stamps
    )
    assert.deepEqual(classified.actionable, ["media:A:2026-09"])
    assert.deepEqual(classified.skipped, [{ invoice_key: "media:B:2026-09", error: "not_approved" }])
    assert.deepEqual(classified.errors, [{ invoice_key: "media:MISSING:2026-09", error: "not_found" }])
  })

  it("approve already-approved is per-key so a ready key still proceeds", () => {
    const stamps = new Map([
      ["media:A:2026-09", { approved_at: "2026-09-01T00:00:00Z", approved_amount_cents: 100, exported_at: null }],
    ])
    const classified = classifyApprovePersistedKeys(
      ["media:A:2026-09", "media:B:2026-09"],
      stamps,
      false
    )
    assert.deepEqual(classified.actionable, ["media:B:2026-09"])
    assert.equal(classified.errors[0]?.error, "already_approved")
  })

  it("unapprove with one failing key returns ok:false and the per-key error", () => {
    const stamps = new Map([
      ["media:A:2026-09", { approved_at: "2026-09-01T00:00:00Z", approved_amount_cents: 100, exported_at: null }],
    ])
    const classified = classifyUnapproveKeys(["media:A:2026-09", "media:MISSING:2026-09"], stamps)
    assert.equal(billingBatchOk(classified.errors), false)
    assert.deepEqual(classified.errors, [
      { invoice_key: "media:MISSING:2026-09", error: "not_found" },
    ])
  })

  it("mark-exported with one failing key returns ok:false and the per-key error", () => {
    const stamps = new Map([
      ["media:A:2026-09", { approved_at: "2026-09-01T00:00:00Z", approved_amount_cents: 100, exported_at: null }],
    ])
    const classified = classifyMarkExportedKeys(
      ["media:A:2026-09", "media:MISSING:2026-09"],
      stamps
    )
    assert.equal(billingBatchOk(classified.errors), false)
    assert.deepEqual(classified.errors, [
      { invoice_key: "media:MISSING:2026-09", error: "not_found" },
    ])
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
    const echoed = await fetchFinanceBillingRecordByIdFromPostgres(Number(approved.record.id))
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
    assert.equal(Number(reapproved.record.approved_by), 8)
    assert.equal(reapproved.record.approved_by_name, "Other")
  })

  it("reapprove refuses once exported", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
      initial_total: 100.5,
    })
    await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
    await setFinanceBillingRecordExported({ invoiceKey: INVOICE_KEY, exportedBy: 7 })
    await assert.rejects(
      () =>
        setFinanceBillingRecordApproved({
          invoiceKey: INVOICE_KEY,
          approvedBy: 8,
          approvedByName: "Other",
          approvedAmountCents: 50,
          approvedLinesHash: HASH,
          reapprove: true,
        }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "ALREADY_EXPORTED")
        return true
      }
    )
  })

  it("reapprove audit captures the prior stamp and prior amount", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
      initial_total: 100.5,
    })
    const first = await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
    const second = await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 8,
      approvedByName: "Other",
      approvedAmountCents: 50,
      approvedLinesHash: HASH,
      reapprove: true,
    })
    assert.ok(second.priorApprovedAt)
    assert.equal(
      new Date(String(second.priorApprovedAt)).getTime(),
      new Date(String(first.record.approved_at)).getTime()
    )
    assert.equal(second.priorApprovedAmountCents, 10050)
    const auditOld = JSON.parse(reapproveAuditOldValue(second)) as {
      approved_at: string | null
      approved_amount_cents: number | null
    }
    assert.equal(auditOld.approved_at, second.priorApprovedAt)
    assert.equal(auditOld.approved_amount_cents, 10050)
  })

  it("unapprove audit captures the pre-update approved_at", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
      initial_total: 100.5,
    })
    const approved = await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
    assert.ok(approved.record.approved_at, "approved_at must be stamped before unapprove")
    const cleared = await clearFinanceBillingRecordApproval(INVOICE_KEY)
    assert.ok(cleared.priorApprovedAt)
    assert.notEqual(String(cleared.priorApprovedAt), "cleared")
    assert.equal(
      new Date(String(cleared.priorApprovedAt)).getTime(),
      new Date(String(approved.record.approved_at)).getTime()
    )
    assert.ok(cleared.record.approved_at == null || cleared.record.approved_at === "")
  })

  it("unapprove refuses once exported", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
      initial_total: 100.5,
    })
    await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
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

  it("mark-exported refuses an unapproved key", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
    })
    await assert.rejects(
      () => setFinanceBillingRecordExported({ invoiceKey: INVOICE_KEY, exportedBy: 11 }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "NOT_APPROVED")
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
      await setFinanceBillingRecordApproved({
        invoiceKey: key,
        approvedBy: 7,
        approvedByName: "Ada Admin",
        approvedAmountCents: 10050,
        approvedLinesHash: HASH,
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

  it("a mid-batch approve write failure rolls the whole batch back", async () => {
    await wipe()
    const seed = {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
      initial_total: 100.5,
    }
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, seed)
    const db = getDb()
    await assert.rejects(
      () =>
        db.transaction(async (tx) => {
          await materialiseAndApproveFinanceBillingRecord(
            {
              invoiceKey: INVOICE_KEY,
              seed,
              approvedBy: 7,
              approvedByName: "Ada",
              approvedAmountCents: 10050,
              approvedLinesHash: HASH,
            },
            tx
          )
          await materialiseAndApproveFinanceBillingRecord(
            {
              invoiceKey: INVOICE_KEY,
              seed,
              approvedBy: 8,
              approvedByName: "Other",
              approvedAmountCents: 50,
              approvedLinesHash: HASH,
            },
            tx
          )
        }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "ALREADY_APPROVED")
        return true
      }
    )
    const listed = await fetchFinanceBillingRecordsFromPostgres()
    const row = listed.find((r) => r.invoice_key === INVOICE_KEY)
    assert.ok(row)
    assert.ok(row.approved_at == null || row.approved_at === "")
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

  it("mark-as-sent stamps every approved key and skips unapproved ones", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
    })
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY_B, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-10",
    })
    await materialiseAndApproveFinanceBillingRecord({
      invoiceKey: INVOICE_KEY,
      seed: {
        billing_type: "media",
        clients_id: 1,
        client_name: "T0-1 writeFinance",
        mba_number: MBA,
        campaign_name: "T0-1",
        billing_month: "2026-09",
        initial_total: 100.5,
      },
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
    const stamped = await stampExportedKeysSkippingUnapproved(
      [INVOICE_KEY, INVOICE_KEY_B],
      11
    )
    assert.equal(stamped.stamped.length, 1)
    assert.equal(stamped.stamped[0]?.invoiceKey, INVOICE_KEY)
    assert.ok(stamped.stamped[0]?.record.exported_at)
    assert.equal(stamped.skipped.length, 1)
    assert.equal(stamped.skipped[0]?.invoiceKey, INVOICE_KEY_B)
    assert.equal(stamped.skipped[0]?.reason, "not_approved")
    const listed = await fetchFinanceBillingRecordsFromPostgres()
    const approved = listed.find((r) => r.invoice_key === INVOICE_KEY)
    const unapproved = listed.find((r) => r.invoice_key === INVOICE_KEY_B)
    assert.ok(approved?.exported_at)
    assert.equal(Number(approved?.exported_by), 11)
    assert.ok(unapproved)
    assert.ok(unapproved.exported_at == null || unapproved.exported_at === "")
  })

  it("a missing mark-sent key is skipped and the rest of the batch still stamps", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
    })
    await materialiseAndApproveFinanceBillingRecord({
      invoiceKey: INVOICE_KEY,
      seed: {
        billing_type: "media",
        clients_id: 1,
        client_name: "T0-1 writeFinance",
        mba_number: MBA,
        campaign_name: "T0-1",
        billing_month: "2026-09",
        initial_total: 100.5,
      },
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
    const missingKey = `media:${MBA}:2099-01`
    const result = await stampExportedKeysSkippingUnapproved(
      [INVOICE_KEY, missingKey],
      11
    )
    assert.equal(result.stamped.length, 1)
    assert.equal(result.stamped[0]?.invoiceKey, INVOICE_KEY)
    assert.equal(result.skipped.length, 1)
    assert.equal(result.skipped[0]?.invoiceKey, missingKey)
    assert.equal(result.skipped[0]?.reason, "not_found")
  })

  it("unapprove classifies a missing key as not_found and still clears the other", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
      initial_total: 100.5,
    })
    await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
    const missingKey = `media:${MBA}:2099-01`
    const stamps = await loadFinanceBillingKeyStamps([INVOICE_KEY, missingKey])
    const classified = classifyUnapproveKeys([INVOICE_KEY, missingKey], stamps)
    assert.deepEqual(classified.actionable, [INVOICE_KEY])
    assert.equal(classified.errors[0]?.error, "not_found")
    await clearFinanceBillingRecordApproval(classified.actionable[0]!)
    const after = await loadFinanceBillingKeyStamps([INVOICE_KEY])
    assert.equal(after.get(INVOICE_KEY)?.approved_at, null)
  })

  it("unmark-exported clears the stamp, leaves approved_at, and makes unapprove possible", async () => {
    await wipe()
    await materialiseAndApproveFinanceBillingRecord({
      invoiceKey: INVOICE_KEY,
      seed: {
        billing_type: "media",
        clients_id: 1,
        client_name: "T0-1 writeFinance",
        mba_number: MBA,
        campaign_name: "T0-1",
        billing_month: "2026-09",
        initial_total: 100.5,
      },
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
    await setFinanceBillingRecordExported({ invoiceKey: INVOICE_KEY, exportedBy: 11 })
    await assert.rejects(
      () => clearFinanceBillingRecordApproval(INVOICE_KEY),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "ALREADY_EXPORTED")
        return true
      }
    )
    const unmarked = await clearFinanceBillingRecordExported(INVOICE_KEY)
    assert.ok(unmarked.record.approved_at, "unmark must not clear approved_at")
    assert.equal(unmarked.record.approved_by_name, "Ada Admin")
    assert.ok(unmarked.record.exported_at == null || unmarked.record.exported_at === "")
    assert.ok(unmarked.record.exported_by == null || unmarked.record.exported_by === "")
    const listed = await fetchFinanceBillingRecordsFromPostgres()
    const row = listed.find((r) => r.invoice_key === INVOICE_KEY)
    assert.ok(row?.approved_at)
    assert.ok(row.exported_at == null || row.exported_at === "")
    const cleared = await clearFinanceBillingRecordApproval(INVOICE_KEY)
    assert.ok(cleared.record.approved_at == null || cleared.record.approved_at === "")
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

  it("PATCH rejects total with a typed error naming the field", async () => {
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
    await assert.rejects(
      () => patchFinanceBillingRecordById(Number(created.id), { total: 999.99 }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "FIELD_NOT_ALLOWED")
        assert.equal(err.field, "total")
        assert.match(err.message, /total/)
        return true
      }
    )
    const echoed = await fetchFinanceBillingRecordByIdFromPostgres(Number(created.id))
    assert.equal(Number(echoed?.total), 100.5)
  })

  it("PATCH rejects billed_amount_cents with a typed error naming the field", async () => {
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
    await assert.rejects(
      () =>
        patchFinanceBillingRecordById(Number(created.id), { billed_amount_cents: 1 }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "FIELD_NOT_ALLOWED")
        assert.equal(err.field, "billed_amount_cents")
        assert.match(err.message, /billed_amount_cents/)
        return true
      }
    )
  })

  it("PATCH still writes notes and po_number", async () => {
    await wipe()
    const created = await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
    })
    const patched = await patchFinanceBillingRecordById(Number(created.id), {
      notes: "bookkeeper note via patch",
      po_number: "PO-77",
    })
    assert.equal(patched.notes, "bookkeeper note via patch")
    assert.equal(patched.po_number, "PO-77")
    const echoed = await fetchFinanceBillingRecordByIdFromPostgres(Number(created.id))
    assert.equal(echoed?.notes, "bookkeeper note via patch")
    assert.equal(echoed?.po_number, "PO-77")
  })

  it("refuses a line-item amount edit once the parent is approved", async () => {
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
    const line = await createFinanceBillingLineItem({
      finance_billing_records_id: Number(created.id),
      item_code: "FEE",
      amount: 100.5,
    })
    await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
    await assert.rejects(
      () => patchFinanceBillingLineItemById(Number(line.id), { amount: 1 }),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "APPROVED_FROZEN")
        assert.equal(err.field, "amount")
        return true
      }
    )
  })

  it("refuses to delete a line under an approved parent (row stays)", async () => {
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
    const line = await createFinanceBillingLineItem({
      finance_billing_records_id: Number(created.id),
      item_code: "FEE",
      amount: 100.5,
    })
    const lineId = Number(line.id)
    await setFinanceBillingRecordApproved({
      invoiceKey: INVOICE_KEY,
      approvedBy: 7,
      approvedByName: "Ada Admin",
      approvedAmountCents: 10050,
      approvedLinesHash: HASH,
    })
    await assert.rejects(
      () => deleteFinanceBillingLineItemById(lineId),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "APPROVED_FROZEN")
        return true
      }
    )
    assert.equal(await lineItemRowCount(lineId), 1)
  })

  it("deletes a line under an unapproved parent (row gone)", async () => {
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
    const line = await createFinanceBillingLineItem({
      finance_billing_records_id: Number(created.id),
      item_code: "FEE",
      amount: 100.5,
    })
    const lineId = Number(line.id)
    assert.equal(await lineItemRowCount(lineId), 1)
    await deleteFinanceBillingLineItemById(lineId)
    assert.equal(await lineItemRowCount(lineId), 0)
  })

  it("refuses to delete a line under a xero: parent (row stays)", async () => {
    await wipe()
    const db = getDb()
    const parentRows = await db.execute(sql`
      INSERT INTO finance_billing_records (
        invoice_key, billing_type, clients_id, client_name,
        mba_number, campaign_name, billing_month
      ) VALUES (
        ${XERO_INVOICE_KEY}, 'media', 1, 'Xero fence',
        ${MBA}, 'Xero', '2026-09'
      )
      RETURNING id
    `)
    const parentList = Array.isArray(parentRows)
      ? parentRows
      : ((parentRows as { rows?: Array<{ id?: number }> }).rows ?? [])
    const parentId = Number((parentList[0] as { id?: number } | undefined)?.id)
    assert.ok(Number.isFinite(parentId) && parentId > 0)
    const lineRows = await db.execute(sql`
      INSERT INTO finance_billing_line_items (
        finance_billing_records_id, item_code, amount
      ) VALUES (
        ${parentId}, 'XERO-LI', 10
      )
      RETURNING id
    `)
    const lineList = Array.isArray(lineRows)
      ? lineRows
      : ((lineRows as { rows?: Array<{ id?: number }> }).rows ?? [])
    const lineId = Number((lineList[0] as { id?: number } | undefined)?.id)
    assert.ok(Number.isFinite(lineId) && lineId > 0)
    await assert.rejects(
      () => deleteFinanceBillingLineItemById(lineId),
      (err: unknown) => {
        assert.ok(err instanceof FinanceBillingWriteError)
        assert.equal(err.code, "XERO_KEY_REFUSED")
        return true
      }
    )
    assert.equal(await lineItemRowCount(lineId), 1)
  })

  it("auto-stamp skips a manually-matched row and still stamps the rest of the batch", async () => {
    await wipe()
    const seed = {
      billing_type: "media" as const,
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
    }
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      ...seed,
      billing_month: "2026-09",
    })
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY_B, {
      ...seed,
      billing_month: "2026-10",
    })
    await setFinanceBillingRecordXeroMatch({
      invoiceKey: INVOICE_KEY,
      xeroInvoiceId: "guid-manual-A",
      matchedBy: "manual",
    })
    const result = await persistAutoStamps([
      {
        invoice_key: INVOICE_KEY,
        xero_invoice_id: "guid-auto-B",
        matched_by: "auto",
      },
      {
        invoice_key: INVOICE_KEY_B,
        xero_invoice_id: "guid-auto-C",
        matched_by: "auto",
      },
    ])
    assert.equal(result.ok, true)
    assert.equal(result.skipped, 1)
    assert.equal(result.stamped, 1)
    assert.equal(result.failed, 0)
    const listed = await fetchFinanceBillingRecordsFromPostgres()
    const manual = listed.find((r) => r.invoice_key === INVOICE_KEY)
    const auto = listed.find((r) => r.invoice_key === INVOICE_KEY_B)
    assert.equal(String(manual?.matched_xero_invoice_id), "guid-manual-A")
    assert.equal(String(manual?.matched_by), "manual")
    assert.equal(String(auto?.matched_xero_invoice_id), "guid-auto-C")
    assert.equal(String(auto?.matched_by), "auto")
  })

  it("a genuine missing auto-stamp row rolls the batch back", async () => {
    await wipe()
    await upsertFinanceBillingRecordByInvoiceKey(INVOICE_KEY, {
      billing_type: "media",
      clients_id: 1,
      client_name: "T0-1 writeFinance",
      mba_number: MBA,
      campaign_name: "T0-1",
      billing_month: "2026-09",
    })
    const result = await persistAutoStamps([
      {
        invoice_key: INVOICE_KEY,
        xero_invoice_id: "guid-ok",
        matched_by: "auto",
      },
      {
        invoice_key: `media:${MBA}:2099-01`,
        xero_invoice_id: "guid-missing",
        matched_by: "auto",
      },
    ])
    assert.equal(result.ok, false)
    assert.equal(result.stamped, 0)
    assert.equal(result.skipped, 0)
    assert.equal(result.failed, 2)
    assert.match(result.error ?? "", /not found/i)
    const listed = await fetchFinanceBillingRecordsFromPostgres()
    const row = listed.find((r) => r.invoice_key === INVOICE_KEY)
    assert.ok(row)
    assert.ok(
      row.matched_xero_invoice_id == null || row.matched_xero_invoice_id === ""
    )
  })
})
