import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { xanoUrl, parseXanoListPayload } from "@/lib/api/xano"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import {
  FINANCE_BILLING_RECORDS_PATH,
  xanoFinanceGet,
  xanoFinancePatch,
} from "@/lib/finance/xanoFinanceApi"

export const maxDuration = 60

const PAGE_SIZE_CAP = 500
const EXCEPTIONS_ISSUE_DATE_MIN = "2025-07-01"

function adminGate(request: NextRequest) {
  return auth0.getSession(request).then((session) => {
    if (!session?.user) {
      return { error: NextResponse.json({ error: "unauthorised" }, { status: 401 }) as NextResponse }
    }
    const roles = getUserRoles(session.user)
    if (!roles.includes("admin")) {
      return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) as NextResponse }
    }
    return { session }
  })
}

function capRows<T>(rows: T[]): T[] {
  return rows.slice(0, PAGE_SIZE_CAP)
}

function asRecord(row: unknown): Record<string, unknown> | null {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null
}

export async function GET(request: NextRequest) {
  try {
    const gate = await adminGate(request)
    if ("error" in gate && gate.error) return gate.error

    const [billingRaw, exceptionsRaw] = await Promise.all([
      xanoFinanceGet(FINANCE_BILLING_RECORDS_PATH),
      axios
        .get(xanoUrl("xero_sync_exceptions", "XANO_CLIENTS_BASE_URL"), { timeout: 15_000 })
        .then((r) => r.data)
        .catch((err) => {
          console.error("[finance-xero-queue] xero_sync_exceptions fetch failed", err?.message)
          return []
        }),
    ])

    const billingRows = parseXanoListPayload(billingRaw)
    const pending = capRows(
      billingRows.filter((row) => {
        const r = asRecord(row)
        return r != null && r.has_pending_edits === true
      })
    )

    const exceptionRows = parseXanoListPayload(exceptionsRaw)
    const exceptions = capRows(
      exceptionRows.filter((row) => {
        const r = asRecord(row)
        if (!r) return false
        if (r.resolved === true) return false
        const issueDate = String(r.issue_date ?? "").slice(0, 10)
        if (!issueDate) return false
        return issueDate >= EXCEPTIONS_ISSUE_DATE_MIN
      })
    )

    return NextResponse.json({
      pending,
      exceptions,
      meta: {
        pending_count: pending.length,
        exceptions_count: exceptions.length,
        page_size_cap: PAGE_SIZE_CAP,
        issue_date_min: EXCEPTIONS_ISSUE_DATE_MIN,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "xero_queue_failed", details: message }, { status: 500 })
  }
}

/**
 * POST mutations:
 * - `{ action: "resolve_exception", id: number }`
 * - `{ action: "assign_client", id: number, clients_id: number, client_name: string }`
 * - `{ action: "assign_mba", id: number, mba_number: string }`
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await adminGate(request)
    if ("error" in gate && gate.error) return gate.error

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
      return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 })
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "bad_request", message: "Expected an object body." }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const action = typeof raw.action === "string" ? raw.action : ""
    const id = typeof raw.id === "number" ? raw.id : Number(raw.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "bad_request", message: "id is required." }, { status: 400 })
    }

    const auditCtx = {
      editedBy: currentUser.id,
      editedByName: currentUser.name ?? currentUser.email ?? String(currentUser.id),
      recordType: "status_change" as const,
    }

    if (action === "resolve_exception") {
      await axios.patch(
        xanoUrl(`xero_sync_exceptions/${id}`, "XANO_CLIENTS_BASE_URL"),
        { resolved: true },
        { timeout: 15_000 }
      )
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: null,
          field_name: `xero_exception_resolved:${id}`,
          old_value: "false",
          new_value: "true",
        },
        auditCtx
      )
      return NextResponse.json({ ok: true, id, resolved: true })
    }

    if (action === "assign_client") {
      const clients_id =
        typeof raw.clients_id === "number" ? raw.clients_id : Number(raw.clients_id)
      if (!Number.isFinite(clients_id) || clients_id <= 0) {
        return NextResponse.json(
          { error: "bad_request", message: "clients_id is required." },
          { status: 400 }
        )
      }
      if (typeof raw.client_name !== "string" || !raw.client_name.trim()) {
        return NextResponse.json(
          { error: "bad_request", message: "client_name is required." },
          { status: 400 }
        )
      }
      const client_name = raw.client_name.trim()
      await xanoFinancePatch(`${FINANCE_BILLING_RECORDS_PATH}/${id}`, {
        clients_id,
        client_name,
      })
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: id,
          field_name: "clients_id",
          old_value: null,
          new_value: String(clients_id),
        },
        auditCtx
      )
      return NextResponse.json({ ok: true, id, clients_id, client_name })
    }

    if (action === "assign_mba") {
      if (typeof raw.mba_number !== "string" || !raw.mba_number.trim()) {
        return NextResponse.json(
          { error: "bad_request", message: "mba_number is required." },
          { status: 400 }
        )
      }
      const mba_number = raw.mba_number.trim()

      const mastersRes = await axios.get(
        xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
        { timeout: 15_000 }
      )
      const masters = parseXanoListPayload(mastersRes.data)
      const found = masters.some((m) => {
        const row = asRecord(m)
        return row != null && String(row.mba_number ?? "").trim() === mba_number
      })
      if (!found) {
        return NextResponse.json(
          { error: "mba_not_found", message: `No media plan master for MBA ${mba_number}.` },
          { status: 400 }
        )
      }

      await xanoFinancePatch(`${FINANCE_BILLING_RECORDS_PATH}/${id}`, {
        mba_number,
        has_pending_edits: false,
      })
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: id,
          field_name: "mba_number",
          old_value: null,
          new_value: mba_number,
        },
        auditCtx
      )
      return NextResponse.json({ ok: true, id, mba_number, has_pending_edits: false })
    }

    return NextResponse.json(
      { error: "bad_request", message: "Unknown action." },
      { status: 400 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "xero_queue_mutate_failed", details: message }, { status: 500 })
  }
}
