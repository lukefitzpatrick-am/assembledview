import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import {
  FinanceBillingWriteError,
  clearFinanceBillingRecordApproval,
} from "@/lib/data/writeFinance"

export const maxDuration = 60

function parseInvoiceKeys(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const keys: string[] = []
  for (const item of raw) {
    if (typeof item !== "string") continue
    const key = item.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys.length > 0 ? keys : null
}

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
    const results: Array<{ invoice_key: string; persisted_record_id: number }> = []

    for (const invoice_key of invoice_keys) {
      let row: Record<string, unknown>
      try {
        row = await clearFinanceBillingRecordApproval(invoice_key)
      } catch (error: unknown) {
        if (error instanceof FinanceBillingWriteError && error.code === "ALREADY_EXPORTED") {
          return NextResponse.json(
            {
              error: "already_exported",
              message:
                "This invoice has been exported. Amend the schedule and re-approve instead of unapproving.",
              invoice_key,
            },
            { status: 409 }
          )
        }
        if (error instanceof FinanceBillingWriteError && error.code === "XERO_KEY_REFUSED") {
          return NextResponse.json(
            { error: "xero_key_refused", message: error.message, invoice_key },
            { status: 400 }
          )
        }
        if (error instanceof FinanceBillingWriteError && error.code === "NOT_FOUND") {
          return NextResponse.json(
            { error: "not_found", message: error.message, invoice_key },
            { status: 404 }
          )
        }
        throw error
      }
      const persisted_record_id = Number(row.id)
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: Number.isFinite(persisted_record_id)
            ? persisted_record_id
            : null,
          field_name: "approved_at",
          old_value: String(row.approved_at ?? "cleared"),
          new_value: null,
        },
        {
          editedBy: currentUser.id,
          editedByName,
          recordType: "status_change",
        }
      )
      results.push({ invoice_key, persisted_record_id })
    }

    return NextResponse.json({ ok: true, records: results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "unapprove_failed", details: message }, { status: 500 })
  }
}
