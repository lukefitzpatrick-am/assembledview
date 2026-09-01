import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { billedSnapshotAmountEchoOk } from "@/lib/finance/billedSnapshotEcho"
import { hashBilledLineSet, toBilledLineSnapshots } from "@/lib/finance/billedDrift"
import {
  isBillingApproveGrainType,
  type BillingApproveGrain,
} from "@/lib/finance/billingApproveGrain"
import { composeInvoiceKey } from "@/lib/finance/overlayFinanceStatus"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import {
  FinanceBillingWriteError,
  materialiseAndApproveFinanceBillingRecord,
} from "@/lib/data/writeFinance"
import { dollarsToCents } from "@/lib/xero/money"

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

function parseGrain(raw: unknown): BillingApproveGrain | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (typeof o.invoice_key !== "string" || o.invoice_key.trim().length === 0) return null
  if (!isBillingApproveGrainType(o.billing_type)) return null
  const clients_id = typeof o.clients_id === "number" ? o.clients_id : Number(o.clients_id)
  if (!Number.isFinite(clients_id)) return null
  if (typeof o.client_name !== "string" || o.client_name.trim().length === 0) return null
  if (typeof o.billing_month !== "string" || o.billing_month.trim().length === 0) return null
  const total = typeof o.total === "number" ? o.total : Number(o.total)
  if (!Number.isFinite(total)) return null
  const mba_number =
    o.mba_number == null ? null : typeof o.mba_number === "string" ? o.mba_number : String(o.mba_number)
  const campaign_name =
    o.campaign_name == null
      ? null
      : typeof o.campaign_name === "string"
        ? o.campaign_name
        : String(o.campaign_name)
  const line_items = Array.isArray(o.line_items)
    ? o.line_items.flatMap((li) => {
        if (!li || typeof li !== "object") return []
        const row = li as Record<string, unknown>
        const amount = typeof row.amount === "number" ? row.amount : Number(row.amount)
        return [
          {
            item_code: typeof row.item_code === "string" ? row.item_code : "",
            amount: Number.isFinite(amount) ? amount : 0,
            schedule_line_item_id:
              row.schedule_line_item_id == null ? null : String(row.schedule_line_item_id),
          },
        ]
      })
    : []
  return {
    invoice_key: o.invoice_key.trim(),
    billing_type: o.billing_type,
    clients_id,
    client_name: o.client_name,
    mba_number,
    campaign_name,
    billing_month: o.billing_month,
    total,
    line_items,
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
    const invoice_keys = parseInvoiceKeys(raw.invoice_keys)
    if (!invoice_keys) {
      return NextResponse.json(
        { error: "bad_request", message: "invoice_keys must be a non-empty string array." },
        { status: 400 }
      )
    }
    const reapprove = raw.reapprove === true
    const grainList = Array.isArray(raw.grains) ? raw.grains : []
    const grainByKey = new Map<string, BillingApproveGrain>()
    for (const item of grainList) {
      const grain = parseGrain(item)
      if (grain) grainByKey.set(grain.invoice_key, grain)
    }

    const approvedByName = currentUser.name ?? currentUser.email ?? String(currentUser.id)
    const results: Array<{
      invoice_key: string
      persisted_record_id: number
      approved_at: unknown
      approved_by: unknown
      approved_by_name: unknown
      approved_amount: unknown
      approved_lines_hash: unknown
    }> = []

    for (const invoice_key of invoice_keys) {
      const grain = grainByKey.get(invoice_key)
      if (!grain) {
        return NextResponse.json(
          {
            error: "bad_request",
            message: `grains must include snapshot fields for ${invoice_key}.`,
          },
          { status: 400 }
        )
      }
      const composed = composeInvoiceKey(
        grain.billing_type,
        grain.clients_id,
        grain.mba_number,
        grain.campaign_name,
        grain.billing_month
      )
      if (!composed || composed !== invoice_key) {
        return NextResponse.json(
          {
            error: "bad_request",
            message: `invoice_key ${invoice_key} does not match the grain.`,
          },
          { status: 400 }
        )
      }

      const snapshots = toBilledLineSnapshots(grain.line_items)
      const approvedLinesHash = hashBilledLineSet(snapshots)
      const approvedAmountCents = dollarsToCents(grain.total)

      let row: Record<string, unknown>
      try {
        row = await materialiseAndApproveFinanceBillingRecord({
          invoiceKey: invoice_key,
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
        })
      } catch (error: unknown) {
        if (error instanceof FinanceBillingWriteError && error.code === "ALREADY_APPROVED") {
          return NextResponse.json(
            { error: "already_approved", message: error.message, invoice_key },
            { status: 409 }
          )
        }
        if (error instanceof FinanceBillingWriteError && error.code === "XERO_KEY_REFUSED") {
          return NextResponse.json(
            { error: "xero_key_refused", message: error.message, invoice_key },
            { status: 400 }
          )
        }
        throw error
      }

      if (!billedSnapshotAmountEchoOk(row.approved_amount, grain.total)) {
        return NextResponse.json(
          {
            error: "snapshot_echo_mismatch",
            message: "Approved amount echo did not match at cents precision.",
            invoice_key,
          },
          { status: 502 }
        )
      }

      const persisted_record_id = Number(row.id)
      await writeStatusChangeEdit(
        {
          finance_billing_records_id: Number.isFinite(persisted_record_id)
            ? persisted_record_id
            : null,
          field_name: "approved_at",
          old_value: reapprove ? "reapprove" : null,
          new_value: String(row.approved_at ?? ""),
        },
        {
          editedBy: currentUser.id,
          editedByName: approvedByName,
          recordType: "status_change",
        }
      )

      results.push({
        invoice_key,
        persisted_record_id,
        approved_at: row.approved_at,
        approved_by: row.approved_by,
        approved_by_name: row.approved_by_name,
        approved_amount: row.approved_amount,
        approved_lines_hash: row.approved_lines_hash,
      })
    }

    return NextResponse.json({ ok: true, records: results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "approve_failed", details: message }, { status: 500 })
  }
}
