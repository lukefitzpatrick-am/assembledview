import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { hasResolvableAuditUserId } from "@/lib/auth/teamMemberAuditId"
import { getDb } from "@/db"
import { billedSnapshotAmountEchoOk } from "@/lib/finance/billedSnapshotEcho"
import { hashBilledLineSet, toBilledLineSnapshots } from "@/lib/finance/billedDrift"
import type { BillingApproveGrain } from "@/lib/finance/billingApproveGrain"
import { loadComposedBillingRecordsForMonth } from "@/lib/finance/loadComposedBillingMonth"
import {
  notFoundErrors,
  parseApproveRequestBody,
  persistedApproveErrors,
  resolveApproveGrains,
} from "@/lib/finance/resolveApproveGrains"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import {
  FinanceBillingWriteError,
  classifyApprovePersistedKeys,
  loadFinanceBillingKeyStamps,
  materialiseAndApproveFinanceBillingRecord,
  reapproveAuditOldValue,
} from "@/lib/data/writeFinance"
import { dollarsToCents } from "@/lib/xero/money"

export const maxDuration = 60

function snapshotFromGrain(grain: BillingApproveGrain): {
  approvedAmountCents: number
  approvedLinesHash: string
} {
  return {
    approvedAmountCents: dollarsToCents(grain.total),
    approvedLinesHash: hashBilledLineSet(toBilledLineSnapshots(grain.line_items)),
  }
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
    const parsed = parseApproveRequestBody(body as Record<string, unknown>)
    if (!parsed.ok) {
      return NextResponse.json({ error: "bad_request", message: parsed.message }, { status: 400 })
    }
    const { invoice_keys, billing_month, reapprove } = parsed

    const loaded = await loadComposedBillingRecordsForMonth({
      monthStr: billing_month,
      includeNonBooked: true,
    })
    if (!loaded.ok) {
      return NextResponse.json(
        { error: loaded.error, ...(loaded.field ? { field: loaded.field } : {}) },
        { status: loaded.status }
      )
    }

    const { grains: resolvedGrains, notFound } = resolveApproveGrains(invoice_keys, loaded.records)
    const errors = notFoundErrors(notFound)
    const stamps = await loadFinanceBillingKeyStamps(resolvedGrains.map((g) => g.invoice_key))
    const classified = classifyApprovePersistedKeys(
      resolvedGrains.map((g) => g.invoice_key),
      stamps,
      reapprove
    )
    const actionable = new Set(classified.actionable)
    const grains = resolvedGrains.filter((g) => actionable.has(g.invoice_key))
    errors.push(
      ...persistedApproveErrors(
        classified.errors.flatMap((e) =>
          e.error === "already_approved" || e.error === "already_exported"
            ? [{ invoice_key: e.invoice_key, error: e.error }]
            : []
        )
      )
    )
    const approvedByName = currentUser.name ?? currentUser.email ?? String(currentUser.id)

    let stamped: Record<string, unknown>[] = []
    if (grains.length > 0) {
      try {
        const db = getDb()
        stamped = await db.transaction(async (tx) => {
          const rows: Record<string, unknown>[] = []
          for (const grain of grains) {
            const { approvedAmountCents, approvedLinesHash } = snapshotFromGrain(grain)
            const result = await materialiseAndApproveFinanceBillingRecord(
              {
                invoiceKey: grain.invoice_key,
                seed: {
                  billing_type: grain.billing_type,
                  clients_id: grain.clients_id,
                  client_name: grain.client_name,
                  mba_number: grain.mba_number,
                  campaign_name: grain.campaign_name,
                  billing_month: grain.billing_month,
                  initial_total: grain.total,
                },
                approvedBy: currentUser.id,
                approvedByName,
                approvedAmountCents,
                approvedLinesHash,
                reapprove,
              },
              tx
            )
            const row = result.record
            if (!billedSnapshotAmountEchoOk(row.approved_amount, grain.total)) {
              throw new Error("Approved amount echo did not match at cents precision.")
            }
            rows.push({
              ...row,
              priorApprovedAt: result.priorApprovedAt,
              priorApprovedAmountCents: result.priorApprovedAmountCents,
            })
          }
          return rows
        })
      } catch (error: unknown) {
        if (error instanceof FinanceBillingWriteError && error.code === "ALREADY_APPROVED") {
          return NextResponse.json(
            { error: "already_approved", message: error.message },
            { status: 409 }
          )
        }
        if (error instanceof FinanceBillingWriteError && error.code === "ALREADY_EXPORTED") {
          return NextResponse.json(
            { error: "already_exported", message: error.message },
            { status: 409 }
          )
        }
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
      approved_at: unknown
      approved_by: unknown
      approved_by_name: unknown
      approved_amount: unknown
      approved_lines_hash: unknown
    }> = []

    for (let i = 0; i < grains.length; i++) {
      const grain = grains[i]!
      const row = stamped[i]!
      const persisted_record_id = Number(row.id)
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: Number.isFinite(persisted_record_id)
            ? persisted_record_id
            : null,
          field_name: "approved_at",
          old_value: reapprove
            ? reapproveAuditOldValue({
                priorApprovedAt:
                  typeof row.priorApprovedAt === "string" ? row.priorApprovedAt : null,
                priorApprovedAmountCents:
                  typeof row.priorApprovedAmountCents === "number"
                    ? row.priorApprovedAmountCents
                    : row.priorApprovedAmountCents == null
                      ? null
                      : Number(row.priorApprovedAmountCents),
              })
            : null,
          new_value: String(row.approved_at ?? ""),
        },
        {
          editedBy: currentUser.id,
          editedByName: approvedByName,
          recordType: "status_change",
        }
      )
      results.push({
        invoice_key: grain.invoice_key,
        persisted_record_id,
        approved_at: row.approved_at,
        approved_by: row.approved_by,
        approved_by_name: row.approved_by_name,
        approved_amount: row.approved_amount,
        approved_lines_hash: row.approved_lines_hash,
      })
    }

    return NextResponse.json({ ok: true, records: results, errors })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "approve_failed", details: message }, { status: 500 })
  }
}
