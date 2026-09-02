import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { getDb } from "@/db"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { parseInvoiceKeys } from "@/lib/finance/resolveApproveGrains"
import {
  FinanceBillingWriteError,
  billingBatchOk,
  classifyUnapproveKeys,
  clearFinanceBillingRecordApproval,
  loadFinanceBillingKeyStamps,
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
    if (!currentUser) {
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
    const { actionable, errors } = classifyUnapproveKeys(invoice_keys, stamps)

    let cleared: Array<{ invoice_key: string; record: Record<string, unknown>; priorApprovedAt: string | null }> =
      []
    if (actionable.length > 0) {
      try {
        const db = getDb()
        cleared = await db.transaction(async (tx) => {
          const rows: Array<{
            invoice_key: string
            record: Record<string, unknown>
            priorApprovedAt: string | null
          }> = []
          for (const invoice_key of actionable) {
            const result = await clearFinanceBillingRecordApproval(invoice_key, tx)
            rows.push({
              invoice_key,
              record: result.record,
              priorApprovedAt: result.priorApprovedAt,
            })
          }
          return rows
        })
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

    const results: Array<{ invoice_key: string; persisted_record_id: number }> = []

    for (const item of cleared) {
      const persisted_record_id = Number(item.record.id)
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: Number.isFinite(persisted_record_id)
            ? persisted_record_id
            : null,
          field_name: "approved_at",
          old_value:
            item.priorApprovedAt != null && String(item.priorApprovedAt).length > 0
              ? String(item.priorApprovedAt)
              : "cleared",
          new_value: null,
        },
        {
          editedBy: currentUser.id,
          editedByName,
          recordType: "status_change",
        }
      )
      results.push({ invoice_key: item.invoice_key, persisted_record_id })
    }

    return NextResponse.json({
      ok: billingBatchOk(errors),
      records: results,
      errors: errors.map((e) => ({
        invoice_key: e.invoice_key,
        error: e.error,
        status: e.error === "not_found" ? 404 : 409,
      })),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "unapprove_failed", details: message }, { status: 500 })
  }
}
