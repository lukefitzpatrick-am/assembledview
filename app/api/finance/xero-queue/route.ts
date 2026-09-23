import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { readFinanceBillingRecords } from "@/lib/data/readFinance"
import {
  enrichPendingFromXero,
  loadMbaOptionsForQueue,
} from "@/lib/finance/sections/xero/enrichPendingFromXero"
import {
  assignClientAndLearnLink,
  countFy26ArClientCoverage,
} from "@/lib/xero/contactLinks"
import {
  assignMbaAndResolveException,
  EXCEPTIONS_ISSUE_DATE_MIN,
  listOpenXeroExceptions,
  PAGE_SIZE_CAP,
  resolveXeroException,
  XeroQueueError,
} from "@/lib/finance/xeroQueue"

export const maxDuration = 60

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

function queueErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof XeroQueueError)) return null
  const status =
    error.code === "mba_not_found" || error.code === "mba_required"
      ? 400
      : error.code === "exception_not_open"
        ? 409
        : 404
  return NextResponse.json({ error: error.code, message: error.message }, { status })
}

export async function GET(request: NextRequest) {
  try {
    const gate = await adminGate(request)
    if ("error" in gate && gate.error) return gate.error

    const [billingRows, exceptions, fy26Coverage] = await Promise.all([
      readFinanceBillingRecords(),
      listOpenXeroExceptions().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[finance-xero-queue] xero_sync_exceptions fetch failed", message)
        return []
      }),
      countFy26ArClientCoverage().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[finance-xero-queue] fy26 coverage failed", message)
        return null
      }),
    ])

    const pendingRaw = capRows(
      billingRows.filter((row) => {
        const r = asRecord(row)
        return r != null && r.has_pending_edits === true
      })
    )

    const [pending, mbaOptions] = await Promise.all([
      enrichPendingFromXero(pendingRaw),
      loadMbaOptionsForQueue(),
    ])

    return NextResponse.json({
      pending,
      exceptions,
      mbaOptions,
      meta: {
        pending_count: pending.length,
        exceptions_count: exceptions.length,
        page_size_cap: PAGE_SIZE_CAP,
        issue_date_min: EXCEPTIONS_ISSUE_DATE_MIN,
        fy26_client_coverage: fy26Coverage,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "xero_queue_failed", details: message }, { status: 500 })
  }
}

/**
 * POST mutations:
 * - `{ action: "resolve" | "resolve_exception" | "dismiss", id }`
 * - `{ action: "assign_client", id, clients_id, client_name }`
 * - `{ action: "assign_mba", id, mba_number }` — id is an open exception, or a
 *   billing record whose invoice_key is `xero:{invoice}`. A billing id whose
 *   invoice has no open exception still stamps the invoice and returns
 *   `resolved_exception: false`. An unknown invoice is 404.
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

    const resolvedBy = currentUser.email ?? currentUser.name ?? String(currentUser.id)
    const auditCtx = {
      editedBy: currentUser.id,
      editedByName: currentUser.name ?? currentUser.email ?? String(currentUser.id),
      recordType: "status_change" as const,
    }

    if (action === "resolve" || action === "resolve_exception" || action === "dismiss") {
      const resolution = action === "dismiss" ? "dismissed" : "resolved"
      const closed = await resolveXeroException({ id, resolvedBy, resolution })
      return NextResponse.json({ ok: true, id: closed.id, resolved: true, resolution })
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
      await assignClientAndLearnLink({
        billingRecordId: id,
        clientsId: clients_id,
        clientName: client_name,
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
      const result = await assignMbaAndResolveException({
        id,
        mbaNumber: raw.mba_number,
        resolvedBy,
      })
      return NextResponse.json({
        ok: true,
        id: result.exceptionId ?? id,
        mba_number: result.mbaNumber,
        mba_match_id: result.masterId,
        resolved_exception: result.resolved_exception,
      })
    }

    return NextResponse.json(
      { error: "bad_request", message: "Unknown action." },
      { status: 400 }
    )
  } catch (error: unknown) {
    const mapped = queueErrorResponse(error)
    if (mapped) return mapped
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "xero_queue_mutate_failed", details: message }, { status: 500 })
  }
}
