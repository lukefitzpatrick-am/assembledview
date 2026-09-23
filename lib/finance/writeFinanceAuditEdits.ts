import "server-only"

import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"

import { getDb, schema, type Db } from "@/db"
import type { ScheduleDiffChange } from "@/lib/finance/scheduleDiff"

/**
 * Insert `finance_edits` rows in Postgres.
 *
 * Pass the caller's Drizzle transaction when the lifecycle write already has
 * one so the audit row commits or rolls back with it. With no executor, the
 * insert is its own statement. A standalone failure is logged and counted as
 * not written — the schedule patch has already committed by then. A failure
 * inside a caller transaction propagates so Postgres aborts that transaction.
 */

export type FinanceAuditExecutor =
  | Db
  | PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>

export type AuditContext = {
  editedBy: number
  editedByName: string
  recordType:
    | "schedule_patch"
    | "status_change"
    | "accrual_reconcile"
    | "version_create_diff"
    | "forecast_target"
}

export type AuditEditPayload = {
  finance_billing_records_id: number | null
  finance_billing_line_items_id: number | null
  edit_type: "field_change" | "amount_change" | "status_change" | "line_add" | "line_remove"
  field_name: string
  old_value: string | null
  new_value: string | null
  edit_status: "published"
  edited_by: number
  edited_by_name: string
  published_at: number
  record_type: string
}

function toInsertRow(payload: AuditEditPayload) {
  return {
    financeBillingRecordsId: payload.finance_billing_records_id,
    financeBillingLineItemsId: payload.finance_billing_line_items_id,
    editType: payload.edit_type,
    fieldName: payload.field_name,
    oldValue: payload.old_value,
    newValue: payload.new_value,
    editStatus: payload.edit_status,
    editedBy: payload.edited_by,
    editedByName: payload.edited_by_name,
    publishedAt: new Date(payload.published_at).toISOString(),
    recordType: payload.record_type,
  }
}

async function insertEdits(
  payloads: AuditEditPayload[],
  executor?: FinanceAuditExecutor
): Promise<number> {
  if (payloads.length === 0) return 0
  const db = executor ?? getDb()
  const values = payloads.map(toInsertRow)
  if (executor) {
    await db.insert(schema.financeEdits).values(values)
    return payloads.length
  }
  try {
    await db.insert(schema.financeEdits).values(values)
    return payloads.length
  } catch (error) {
    console.error("[finance-audit] INSERT finance_edits failed", {
      message: error instanceof Error ? error.message : String(error),
      field_name: payloads[0]?.field_name,
      record_type: payloads[0]?.record_type,
      rows: payloads.length,
    })
    return 0
  }
}

export async function writeScheduleDiffEdits(
  changes: ScheduleDiffChange[],
  context: AuditContext,
  executor?: FinanceAuditExecutor
): Promise<{ attempted: number; succeeded: number }> {
  if (changes.length === 0) return { attempted: 0, succeeded: 0 }

  const now = Date.now()
  const payloads: AuditEditPayload[] = changes.map((change) => ({
    finance_billing_records_id: null,
    finance_billing_line_items_id: null,
    edit_type:
      change.kind === "amount_change"
        ? "amount_change"
        : change.kind === "line_add"
          ? "line_add"
          : "line_remove",
    field_name: `${change.monthYear}::${change.lineItemId}`,
    old_value: "old_value" in change ? change.old_value : null,
    new_value: "new_value" in change ? change.new_value : null,
    edit_status: "published",
    edited_by: context.editedBy,
    edited_by_name: context.editedByName,
    published_at: now,
    record_type: context.recordType,
  }))
  const succeeded = await insertEdits(payloads, executor)
  return { attempted: changes.length, succeeded }
}

/**
 * Single status-field audit row (approve, unapprove, mark-exported, notes,
 * and the other lifecycle callers).
 */
export async function writeStatusChangeEdit(
  params: {
    finance_billing_records_id: number | null
    finance_billing_line_items_id?: number | null
    field_name: string
    old_value: string | null
    new_value: string | null
  },
  context: AuditContext,
  executor?: FinanceAuditExecutor
): Promise<boolean> {
  const payload: AuditEditPayload = {
    finance_billing_records_id: params.finance_billing_records_id,
    finance_billing_line_items_id: params.finance_billing_line_items_id ?? null,
    edit_type: "status_change",
    field_name: params.field_name,
    old_value: params.old_value,
    new_value: params.new_value,
    edit_status: "published",
    edited_by: context.editedBy,
    edited_by_name: context.editedByName,
    published_at: Date.now(),
    record_type: context.recordType,
  }
  const wrote = await insertEdits([payload], executor)
  return wrote === 1
}
