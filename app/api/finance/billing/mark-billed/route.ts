import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { hashBilledLineSet, toBilledLineSnapshots } from "@/lib/finance/billedDrift"
import { ensureFinanceBillingRecord } from "@/lib/finance/materialiseFinanceBillingRecord"
import { composeInvoiceKey } from "@/lib/finance/overlayFinanceStatus"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { FINANCE_BILLING_RECORDS_PATH, xanoFinancePatch } from "@/lib/finance/xanoFinanceApi"

export const maxDuration = 60

const VALID_BILLING_TYPES = ["media", "sow", "retainer"] as const
type MarkBilledBillingType = (typeof VALID_BILLING_TYPES)[number]

function isMarkBilledBillingType(v: unknown): v is MarkBilledBillingType {
  return typeof v === "string" && (VALID_BILLING_TYPES as readonly string[]).includes(v)
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

    const raw = body as Record<string, unknown>

    if (!isMarkBilledBillingType(raw.billing_type)) {
      return NextResponse.json(
        { error: "bad_request", message: "billing_type must be media, sow, or retainer." },
        { status: 400 }
      )
    }
    const billing_type = raw.billing_type

    const clients_id = typeof raw.clients_id === "number" ? raw.clients_id : Number(raw.clients_id)
    if (!Number.isFinite(clients_id)) {
      return NextResponse.json(
        { error: "bad_request", message: "clients_id is required and must be a number." },
        { status: 400 }
      )
    }

    if (typeof raw.client_name !== "string" || raw.client_name.trim().length === 0) {
      return NextResponse.json(
        { error: "bad_request", message: "client_name is required." },
        { status: 400 }
      )
    }
    const client_name = raw.client_name

    const mba_number =
      raw.mba_number === null || raw.mba_number === undefined
        ? null
        : typeof raw.mba_number === "string"
          ? raw.mba_number
          : String(raw.mba_number)

    const campaign_name =
      raw.campaign_name === null || raw.campaign_name === undefined
        ? null
        : typeof raw.campaign_name === "string"
          ? raw.campaign_name
          : String(raw.campaign_name)

    if (typeof raw.billing_month !== "string" || raw.billing_month.trim().length === 0) {
      return NextResponse.json(
        { error: "bad_request", message: "billing_month is required (e.g. 2026-05)." },
        { status: 400 }
      )
    }
    const billing_month = raw.billing_month

    if (typeof raw.billed !== "boolean") {
      return NextResponse.json(
        { error: "bad_request", message: "billed is required and must be a boolean." },
        { status: 400 }
      )
    }
    const billed = raw.billed

    const total = typeof raw.total === "number" ? raw.total : undefined

    const lineSnapshots = Array.isArray(raw.line_items)
      ? toBilledLineSnapshots(
          raw.line_items as Array<{
            item_code?: string | null
            amount?: number | null
            schedule_line_item_id?: string | null
          }>
        )
      : []

    const invoice_key = composeInvoiceKey(
      billing_type,
      clients_id,
      mba_number,
      campaign_name,
      billing_month
    )
    if (!invoice_key) {
      return NextResponse.json(
        {
          error: "not_materialisable",
          message: "This invoice grain cannot be keyed (missing MBA or month).",
        },
        { status: 400 }
      )
    }

    const recordId = await ensureFinanceBillingRecord({
      billing_type,
      clients_id,
      client_name,
      mba_number,
      campaign_name,
      billing_month,
      initial_total: typeof total === "number" ? total : undefined,
    })
    if (recordId == null) {
      return NextResponse.json({ error: "materialise_failed" }, { status: 502 })
    }

    const now = Date.now()
    const billed_amount =
      billed && typeof total === "number" && Number.isFinite(total) ? total : null
    const billed_lines_hash =
      billed && lineSnapshots.length > 0 ? hashBilledLineSet(lineSnapshots) : null

    const patch = billed
      ? {
          billed: true,
          billed_at: now,
          billed_by: currentUser.id,
          billed_amount,
          billed_lines_hash,
        }
      : {
          billed: false,
          billed_at: null,
          billed_by: null,
          billed_amount: null,
          billed_lines_hash: null,
        }

    await xanoFinancePatch(`${FINANCE_BILLING_RECORDS_PATH}/${recordId}`, patch)

    await writeStatusChangeEdit(
      {
        finance_billing_records_id: recordId,
        field_name: `billed:${invoice_key}`,
        old_value: String(!billed),
        new_value: String(billed),
      },
      {
        editedBy: currentUser.id,
        editedByName: currentUser.name ?? currentUser.email ?? String(currentUser.id),
        recordType: "status_change",
      }
    )

    return NextResponse.json({
      persisted_record_id: recordId,
      invoice_key,
      billed,
      billed_at: patch.billed_at,
      billed_by: patch.billed_by,
      billed_amount: patch.billed_amount,
      billed_lines_hash: patch.billed_lines_hash,
      billed_drift: false,
      billed_drift_delta: billed ? 0 : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "mark_billed_failed", details: message }, { status: 500 })
  }
}
