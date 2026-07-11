import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import type { ScheduleDiffChange } from "@/lib/finance/scheduleDiff"

/**
 * Domain 5 Stage 2.2b — POST finance_edits rows for schedule mutations.
 *
 * Failures are logged and swallowed (Stage 1 Decision 6 — schedule writes
 * are not rolled back on audit failure). Returns the number of rows
 * successfully written for observability.
 */

export type AuditContext = {
  editedBy: number
  editedByName: string
  recordType: "schedule_patch" | "status_change" | "accrual_reconcile" | "version_create_diff"
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

async function postOne(payload: AuditEditPayload): Promise<boolean> {
  try {
    const url = xanoUrl("finance_edits", "XANO_CLIENTS_BASE_URL")
    await axios.post(url, payload)
    return true
  } catch (error) {
    console.error("[finance-audit] POST finance_edits failed", {
      message: error instanceof Error ? error.message : String(error),
      field_name: payload.field_name,
      record_type: payload.record_type,
    })
    return false
  }
}

export async function writeScheduleDiffEdits(
  changes: ScheduleDiffChange[],
  context: AuditContext
): Promise<{ attempted: number; succeeded: number }> {
  if (changes.length === 0) return { attempted: 0, succeeded: 0 }

  const now = Date.now()
  let succeeded = 0

  for (const change of changes) {
    const payload: AuditEditPayload = {
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
    }
    const ok = await postOne(payload)
    if (ok) succeeded++
  }

  return { attempted: changes.length, succeeded }
}

/**
 * Single status-field audit row (used by Stage 3+ when marking billed,
 * setting notes, etc.). Included here for completeness; the helper is
 * exported but no callers exist yet in Stage 2.2b.
 */
export async function writeStatusChangeEdit(
  params: {
    finance_billing_records_id: number | null
    finance_billing_line_items_id?: number | null
    field_name: string
    old_value: string | null
    new_value: string | null
  },
  context: AuditContext
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
  return postOne(payload)
}
