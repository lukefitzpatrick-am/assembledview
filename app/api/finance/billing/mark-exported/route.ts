import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { hasResolvableAuditUserId } from "@/lib/auth/teamMemberAuditId"
import { getDb } from "@/db"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { parseInvoiceKeys } from "@/lib/finance/resolveApproveGrains"
import {
  FinanceBillingWriteError,
  billingBatchOk,
  classifyMarkExportedKeys,
  loadFinanceBillingKeyStamps,
  stampExportedKeysSkippingUnapproved,
} from "@/lib/data/writeFinance"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const roles = getUserRoles(session.user)
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasResolvableAuditUserId(currentUser.id)) {
      return NextResponse.json(
        { error: "no_user", message: "Could not resolve user for audit." },
        { status: 401 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON body." },
        { status: 400 }
      )
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "bad_request", message: "Expected an object body." },
        { status: 400 }
      )
    }
    const invoice_keys = parseInvoiceKeys((body as Record<string, unknown>).invoice_keys)
    if (!invoice_keys) {
      return NextResponse.json(
        { error: "bad_request", message: "invoice_keys must be a non-empty string array." },
        { status: 400 }
      )
    }

    const editedByName = currentUser.name ?? currentUser.email ?? String(currentUser.id)
    const stamps = await loadFinanceBillingKeyStamps(invoice_keys)
    const classified = classifyMarkExportedKeys(invoice_keys, stamps)

    let stamped: Array<{ invoiceKey: string; record: Record<string, unknown> }> = []
    if (classified.actionable.length > 0) {
      try {
        const db = getDb()
        const result = await db.transaction(async (tx) =>
          stampExportedKeysSkippingUnapproved(classified.actionable, currentUser.id, tx)
        )
        stamped = result.stamped
        for (const skip of result.skipped) {
          if (skip.reason === "not_approved") {
            classified.skipped.push({ invoice_key: skip.invoiceKey, error: "not_approved" })
          } else {
            classified.errors.push({ invoice_key: skip.invoiceKey, error: "not_found" })
          }
        }
      } catch (error: unknown) {
        if (error instanceof FinanceBillingWriteError && error.code === "XERO_KEY_REFUSED") {
          return NextResponse.json(
            { error: "xero_key_refused", message: error.message },
            { status: 400 }
          )
        }
        throw error
      }
    }

    const results: Array<{
      invoice_key: string
      persisted_record_id: number
      exported_at: unknown
      exported_by: unknown
      exported_by_name: string
    }> = []

    for (const item of stamped) {
      const persisted_record_id = Number(item.record.id)
      const exportedAt = item.record.exported_at
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: Number.isFinite(persisted_record_id)
            ? persisted_record_id
            : null,
          field_name: "exported_at",
          old_value: null,
          new_value: exportedAt != null ? String(exportedAt) : null,
        },
        {
          editedBy: currentUser.id,
          editedByName,
          recordType: "status_change",
        }
      )
      results.push({
        invoice_key: item.invoiceKey,
        persisted_record_id,
        exported_at: exportedAt,
        exported_by: item.record.exported_by,
        exported_by_name: editedByName,
      })
    }

    return NextResponse.json({
      ok: billingBatchOk(classified.errors),
      exported_by_name: editedByName,
      records: results,
      skipped: classified.skipped.map((s) => ({
        invoice_key: s.invoice_key,
        error: s.error,
      })),
      errors: classified.errors.map((e) => ({
        invoice_key: e.invoice_key,
        error: e.error,
        status: 404,
      })),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "mark_exported_failed", details: message }, { status: 500 })
  }
}
