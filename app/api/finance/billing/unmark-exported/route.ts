import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { getDb } from "@/db"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { parseInvoiceKeys } from "@/lib/finance/resolveApproveGrains"
import {
  FinanceBillingWriteError,
  clearFinanceBillingRecordExported,
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
    let cleared: Array<{
      invoice_key: string
      record: Record<string, unknown>
      priorExportedAt: string | null
    }>
    try {
      const db = getDb()
      cleared = await db.transaction(async (tx) => {
        const rows: Array<{
          invoice_key: string
          record: Record<string, unknown>
          priorExportedAt: string | null
        }> = []
        for (const invoice_key of invoice_keys) {
          const result = await clearFinanceBillingRecordExported(invoice_key, tx)
          rows.push({
            invoice_key,
            record: result.record,
            priorExportedAt: result.priorExportedAt,
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
      if (error instanceof FinanceBillingWriteError && error.code === "NOT_EXPORTED") {
        return NextResponse.json(
          { error: "not_exported", message: error.message },
          { status: 409 }
        )
      }
      if (error instanceof FinanceBillingWriteError && error.code === "NOT_FOUND") {
        return NextResponse.json(
          { error: "not_found", message: error.message },
          { status: 404 }
        )
      }
      throw error
    }

    const results: Array<{ invoice_key: string; persisted_record_id: number }> = []

    for (const item of cleared) {
      const persisted_record_id = Number(item.record.id)
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: Number.isFinite(persisted_record_id)
            ? persisted_record_id
            : null,
          field_name: "exported_at",
          old_value:
            item.priorExportedAt != null && String(item.priorExportedAt).length > 0
              ? String(item.priorExportedAt)
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

    return NextResponse.json({ ok: true, records: results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "unmark_exported_failed", details: message }, { status: 500 })
  }
}
