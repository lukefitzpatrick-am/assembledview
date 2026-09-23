/**
 * finance_edits audits insert Postgres, in the caller's transaction when one
 * is passed. Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"

import { eq, sql } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import { mapFinanceEditFromPostgres } from "@/lib/data/readFinance"
import {
  clearFinanceBillingRecordApproval,
  materialiseAndApproveFinanceBillingRecord,
} from "@/lib/data/writeFinance"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())
if (!hasDb) {
  await closeDb()
}

const MBA = `TFE${Date.now().toString(36)}`
const INVOICE_KEY = `media:${MBA}:2026-09`
const ROLLBACK_KEY = `media:${MBA}:2026-10`
const ACTOR = 88001
const ACTOR_NAME = "Audit Actor"
const ROLLBACK_ACTOR = 88002

const seed = {
  billing_type: "media",
  clients_id: 1,
  client_name: "finance edits audit",
  mba_number: MBA,
  campaign_name: "finance edits audit",
  billing_month: "2026-09",
  initial_total: 100.5,
}

async function wipe(): Promise<void> {
  if (!hasDb) return
  const db = getDb()
  await db.execute(sql`
    DELETE FROM finance_edits
    WHERE finance_billing_records_id IN (
      SELECT id FROM finance_billing_records
      WHERE invoice_key IN (${INVOICE_KEY}, ${ROLLBACK_KEY})
    )
    OR edited_by IN (${ACTOR}, ${ROLLBACK_ACTOR})
    OR field_name = ${`audit-standalone:${MBA}`}
  `)
  await db.execute(sql`
    DELETE FROM finance_billing_records
    WHERE invoice_key IN (${INVOICE_KEY}, ${ROLLBACK_KEY})
  `)
}

function countOf(result: unknown): number {
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<{ n?: number }> }).rows ?? [])
  return Number((list[0] as { n?: number } | undefined)?.n ?? 0)
}

async function editsForRecord(recordId: number) {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.financeEdits)
    .where(eq(schema.financeEdits.financeBillingRecordsId, recordId))
    .orderBy(schema.financeEdits.id)
  return rows.map((row) => mapFinanceEditFromPostgres(row as unknown as Record<string, unknown>))
}

describe("writeFinanceAuditEdits", { skip: hasDb ? false : "DATABASE_URL unset" }, () => {
  after(async () => {
    await wipe()
    await closeDb()
  })

  it("approve writes one finance_edits row; unapprove writes a second", async () => {
    await wipe()
    const db = getDb()

    const approved = await db.transaction(async (tx) => {
      const result = await materialiseAndApproveFinanceBillingRecord(
        {
          invoiceKey: INVOICE_KEY,
          seed,
          approvedBy: ACTOR,
          approvedByName: ACTOR_NAME,
          approvedAmountCents: 10050,
          approvedLinesHash: "audit-hash",
        },
        tx
      )
      const recordId = Number(result.record.id)
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: recordId,
          field_name: "approved_at",
          old_value: null,
          new_value: String(result.record.approved_at ?? ""),
        },
        {
          editedBy: ACTOR,
          editedByName: ACTOR_NAME,
          recordType: "status_change",
        },
        tx
      )
      return result
    })

    const recordId = Number(approved.record.id)
    const approvedAt = String(approved.record.approved_at ?? "")
    assert.ok(approvedAt.length > 0)

    const afterApprove = await editsForRecord(recordId)
    assert.equal(afterApprove.length, 1)
    const approveRow = afterApprove[0]!
    assert.equal(Number(approveRow.edited_by), ACTOR)
    assert.equal(approveRow.edited_by_name, ACTOR_NAME)
    assert.equal(approveRow.field_name, "approved_at")
    assert.equal(approveRow.old_value, null)
    assert.equal(approveRow.new_value, approvedAt)
    assert.equal(approveRow.edit_type, "status_change")
    assert.equal(approveRow.edit_status, "published")
    assert.equal(approveRow.record_type, "status_change")
    assert.equal(typeof approveRow.published_at, "string")
    assert.match(String(approveRow.published_at), /^\d{4}-\d{2}-\d{2}/)

    const cleared = await db.transaction(async (tx) => {
      const result = await clearFinanceBillingRecordApproval(INVOICE_KEY, tx)
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: recordId,
          field_name: "approved_at",
          old_value: result.priorApprovedAt != null ? String(result.priorApprovedAt) : "cleared",
          new_value: null,
        },
        {
          editedBy: ACTOR,
          editedByName: ACTOR_NAME,
          recordType: "status_change",
        },
        tx
      )
      return result
    })

    const afterUnapprove = await editsForRecord(recordId)
    assert.equal(afterUnapprove.length, 2)
    const unapproveRow = afterUnapprove[1]!
    assert.equal(Number(unapproveRow.edited_by), ACTOR)
    assert.equal(unapproveRow.edited_by_name, ACTOR_NAME)
    assert.equal(unapproveRow.field_name, "approved_at")
    assert.equal(unapproveRow.old_value, String(cleared.priorApprovedAt))
    assert.equal(unapproveRow.new_value, null)
    assert.equal(unapproveRow.record_type, "status_change")
  })

  it("a failed audit inside the lifecycle transaction leaves no finance_edits row", async () => {
    await wipe()
    const db = getDb()
    await assert.rejects(
      () =>
        db.transaction(async (tx) => {
          const result = await materialiseAndApproveFinanceBillingRecord(
            {
              invoiceKey: ROLLBACK_KEY,
              seed: { ...seed, billing_month: "2026-10" },
              approvedBy: ROLLBACK_ACTOR,
              approvedByName: ACTOR_NAME,
              approvedAmountCents: 10050,
              approvedLinesHash: "audit-hash",
            },
            tx
          )
          await writeStatusChangeEdit(
            {
              finance_billing_records_id: Number(result.record.id),
              field_name: "approved_at",
              old_value: null,
              new_value: String(result.record.approved_at ?? ""),
            },
            {
              editedBy: ROLLBACK_ACTOR,
              editedByName: ACTOR_NAME,
              recordType: "status_change",
            },
            tx
          )
          throw new Error("rollback")
        }),
      (err: unknown) => err instanceof Error && err.message === "rollback"
    )

    const records = await db.execute(sql`
      SELECT count(*)::int AS n FROM finance_billing_records
      WHERE invoice_key = ${ROLLBACK_KEY}
    `)
    assert.equal(countOf(records), 0)
    const edits = await db.execute(sql`
      SELECT count(*)::int AS n FROM finance_edits WHERE edited_by = ${ROLLBACK_ACTOR}
    `)
    assert.equal(countOf(edits), 0)
  })
})
