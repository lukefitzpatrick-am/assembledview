import { NextRequest, NextResponse } from "next/server"

import { getDb } from "@/db"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { hasResolvableAuditUserId } from "@/lib/auth/teamMemberAuditId"
import { isFeatureOn } from "@/lib/features/server"
import { insertAbovePlanReason } from "@/lib/finance/abovePlanHold.server"
import { loadAccountsPack } from "@/lib/finance/loadAccountsPack"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const REASON_MAX = 2000
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** S14: the month's invoices held above plan, for the Clients billing review downloads. */
export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  if (!(await isFeatureOn("billing_above_plan_hold"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  const month = request.nextUrl.searchParams.get("month") ?? ""
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "bad_request", message: "month (YYYY-MM) is required." }, { status: 400 })
  }
  try {
    const loaded = await loadAccountsPack(month)
    if ("ok" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    return NextResponse.json({
      month,
      held: loaded.held.map((h) => ({ invoice_key: h.invoiceKey, above_plan_cents: h.abovePlanCents })),
    })
  } catch (error) {
    console.error("GET /api/finance/billing/above-plan-reason:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * S14 A: a finance admin's reason for an invoice held above plan at Send to
 * accounts. The amount it covers is the amount above plan now, worked out
 * here from the same pack, never taken from the browser. The browser sends
 * the amount the admin saw (`seen_cents`): if the server's is higher, nothing
 * is stored (409 `amount_changed`). Only a held record takes a reason, so a
 * sent invoice or a `xero:` row never gets one.
 */
export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  if (!(await isFeatureOn("billing_above_plan_hold"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  const currentUser = await getCurrentUser(request)
  if (!currentUser || !hasResolvableAuditUserId(currentUser.id)) {
    return NextResponse.json({ error: "no_user", message: "Could not resolve user for audit." }, { status: 401 })
  }

  let body: Record<string, unknown> | null = null
  try {
    const parsed: unknown = await request.json()
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
  } catch {
    body = null
  }
  const month = typeof body?.month === "string" && MONTH_RE.test(body.month) ? body.month : null
  const invoiceKey = typeof body?.invoice_key === "string" ? body.invoice_key.trim() : ""
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  const seenCents = body?.seen_cents
  if (!month || !invoiceKey || !Number.isSafeInteger(seenCents) || (seenCents as number) <= 0) {
    return NextResponse.json(
      { error: "bad_request", message: "month (YYYY-MM), invoice_key and seen_cents (whole cents above 0) are required." },
      { status: 400 },
    )
  }
  if (!reason || reason.length > REASON_MAX) {
    return NextResponse.json(
      { error: "bad_request", field: "reason", message: `Give a reason of 1 to ${REASON_MAX} characters.` },
      { status: 400 },
    )
  }

  try {
    const loaded = await loadAccountsPack(month)
    if ("ok" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    const hold = loaded.held.find((h) => h.invoiceKey === invoiceKey)
    if (!hold) {
      return NextResponse.json(
        { error: "not_held", message: "This invoice is not held above plan. Nothing was stored." },
        { status: 409 },
      )
    }
    if (hold.abovePlanCents > (seenCents as number)) {
      return NextResponse.json(
        {
          error: "amount_changed",
          above_plan_cents: hold.abovePlanCents,
          message: "The amount above plan has grown since you looked. Check it and give the reason again. Nothing was stored.",
        },
        { status: 409 },
      )
    }
    await insertAbovePlanReason(getDb(), {
      recordId: hold.persistedId,
      reason,
      coversCents: hold.abovePlanCents,
      by: currentUser.id,
      byName: currentUser.name ?? currentUser.email ?? String(currentUser.id),
    })
    return NextResponse.json({ ok: true, invoice_key: invoiceKey, covers_cents: hold.abovePlanCents })
  } catch (error) {
    console.error("POST /api/finance/billing/above-plan-reason:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
