import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { ensureFinanceBillingRecord } from "@/lib/finance/materialiseFinanceBillingRecord"
import { composeInvoiceKey } from "@/lib/finance/overlayFinanceStatus"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { FINANCE_BILLING_RECORDS_PATH, xanoFinanceGet, xanoFinancePatch } from "@/lib/finance/xanoFinanceApi"

export const maxDuration = 60

const NOTES_MAX_LEN = 2000
const VALID_BILLING_TYPES = ["media", "sow", "retainer"] as const
type NotesBillingType = (typeof VALID_BILLING_TYPES)[number]

function isNotesBillingType(v: unknown): v is NotesBillingType {
  return typeof v === "string" && (VALID_BILLING_TYPES as readonly string[]).includes(v)
}

function normalizeNotes(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  return raw.trim().slice(0, NOTES_MAX_LEN)
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

    if (!isNotesBillingType(raw.billing_type)) {
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

    const notes = normalizeNotes(raw.notes)
    if (notes === null) {
      return NextResponse.json(
        { error: "bad_request", message: "notes must be a string (empty clears)." },
        { status: 400 }
      )
    }

    const total = typeof raw.total === "number" ? raw.total : undefined

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

    let oldNotes = ""
    try {
      const existing = await xanoFinanceGet(`${FINANCE_BILLING_RECORDS_PATH}/${recordId}`)
      if (existing && typeof existing === "object" && typeof (existing as { notes?: unknown }).notes === "string") {
        oldNotes = ((existing as { notes: string }).notes ?? "").trim()
      }
    } catch {
      // Audit still proceeds with empty old value if read fails.
    }

    await xanoFinancePatch(`${FINANCE_BILLING_RECORDS_PATH}/${recordId}`, { notes })

    await writeStatusChangeEdit(
      {
        finance_billing_records_id: recordId,
        field_name: "notes",
        old_value: oldNotes || null,
        new_value: notes || null,
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
      notes,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "notes_failed", details: message }, { status: 500 })
  }
}
