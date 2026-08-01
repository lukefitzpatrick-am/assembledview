import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import {
  getFinancePeriodsMode,
  isFinancePeriodsEnabled,
} from "@/lib/finance/periods/flag"
import {
  ensurePeriodPg,
  getPeriodPg,
  listPeriodsPg,
  listRunItemsPg,
  listNotificationsPg,
  updateRunItemPg,
  insertNotificationPg,
  updatePeriodStatusPg,
  upsertRunItemsPg,
} from "@/lib/finance/periods/postgresStore"
import { applyReviewAction, effectiveAmountCents } from "@/lib/finance/periods/reviewItem"
import { buildAdminAmendAudit, buildVarianceCandidate } from "@/lib/finance/periods/variance"
import { archiveFinanceSheet } from "@/lib/finance/periods/archiveSheet"
import { isBillingMonthLocked } from "@/lib/finance/periods/lockBillingMonth"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { addPeriodMonths } from "@/lib/finance/periods/monthKey"
import { mediaInvoiceReference } from "@/lib/finance/periods/naturalKeys"

export const dynamic = "force-dynamic"

function editorName(gate: unknown): string {
  const g = gate as { session?: { user?: { email?: string; name?: string } } }
  return g.session?.user?.email || g.session?.user?.name || "editor"
}

/** List periods + optional items for selected month. */
export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  if (!isFinancePeriodsEnabled()) {
    return NextResponse.json({
      mode: getFinancePeriodsMode(),
      periods: [],
      items: [],
      notifications: [],
      unread: 0,
    })
  }

  const url = new URL(request.url)
  const periodMonth = url.searchParams.get("periodMonth")
  const periods = await listPeriodsPg()
  let items: Awaited<ReturnType<typeof listRunItemsPg>> = []
  if (periodMonth) {
    const p = await getPeriodPg(periodMonth)
    if (p) items = await listRunItemsPg(p.id)
  }
  const notifications = await listNotificationsPg("finance", 30)
  return NextResponse.json({
    mode: getFinancePeriodsMode(),
    periods,
    items,
    notifications,
    unread: notifications.filter((n) => !n.readAt).length,
  })
}

/** Review actions + admin amend. */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response
  if (!isFinancePeriodsEnabled()) {
    return NextResponse.json({ error: "FINANCE_PERIODS off" }, { status: 409 })
  }

  const body = (await request.json()) as {
    action:
      | "approve"
      | "adjust"
      | "hold"
      | "exclude"
      | "admin_amend"
      | "queue_variance"
      | "ensure_period"
    periodMonth: string
    itemId?: number
    adjustmentCents?: number
    afterAmountCents?: number
    proposedAmountCents?: number
    reason?: string
  }

  const period = await ensurePeriodPg(body.periodMonth)
  const locked = isBillingMonthLocked(body.periodMonth, { period })
  const editor = editorName(gate)

  if (body.action === "ensure_period") {
    return NextResponse.json({ ok: true, period })
  }

  if (body.itemId == null) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 })
  }

  const items = await listRunItemsPg(period.id)
  const item = items.find((i) => i.id === body.itemId)
  if (!item) return NextResponse.json({ error: "item not found" }, { status: 404 })

  if (body.action === "admin_amend") {
    const adminGate = await requireRole(request, ["admin"])
    if ("response" in adminGate) return adminGate.response
    if (!locked) {
      return NextResponse.json({ error: "Period is not locked" }, { status: 409 })
    }
    const reason = String(body.reason ?? "").trim()
    if (!reason) {
      return NextResponse.json({ error: "Mandatory reason required" }, { status: 400 })
    }
    const audit = buildAdminAmendAudit({
      item,
      afterAmountCents: Number(body.afterAmountCents),
      reason,
      currentSheetVersion: period.sheetVersion,
    })
    const next = {
      ...item,
      amountCents: audit.afterCents,
      status: "adjusted" as const,
      adjustmentCents: 0,
      adjustmentReason: reason,
    }
    await updateRunItemPg(next)
    await updatePeriodStatusPg(period.id, {
      amendedAfterLock: true,
      sheetVersion: audit.nextSheetVersion,
    })
    const all = await listRunItemsPg(period.id)
    const archived = await archiveFinanceSheet({
      items: all.map((i) => (i.id === next.id ? next : i)),
      periodMonth: period.periodMonth,
      sheetVersion: audit.nextSheetVersion,
    })
    await updatePeriodStatusPg(period.id, { sheetBlobPathname: archived.pathname })
    await writeStatusChangeEdit(
      {
        finance_billing_records_id: null,
        field_name: `period_amend:${period.periodMonth}:${item.id}`,
        old_value: String(audit.beforeCents),
        new_value: `${audit.afterCents}:${reason}`,
      },
      { editedBy: 0, editedByName: editor, recordType: "status_change" }
    )
    await insertNotificationPg({
      audience: "finance-lead",
      kind: "finance_period_amended_after_lock",
      payload: {
        periodMonth: period.periodMonth,
        itemId: item.id,
        beforeCents: audit.beforeCents,
        afterCents: audit.afterCents,
        reason,
        sheet: archived.pathname,
      },
    })
    return NextResponse.json({ ok: true, item: next, audit, sheet: archived.pathname })
  }

  if (body.action === "queue_variance") {
    if (!locked) {
      return NextResponse.json({ error: "Period is not locked" }, { status: 409 })
    }
    const reason = String(body.reason ?? "").trim()
    if (!reason) {
      return NextResponse.json({ error: "Reason required" }, { status: 400 })
    }
    const nextKey = addPeriodMonths(period.periodMonth, 1)
    const nextPeriod = await ensurePeriodPg(nextKey)
    const inv =
      item.source === "media" && item.mbaNumber
        ? mediaInvoiceReference(item.mbaNumber, nextKey)
        : item.invoiceReference
    const cand = buildVarianceCandidate({
      lockedItem: item,
      proposedAmountCents: Number(body.proposedAmountCents ?? body.afterAmountCents ?? 0),
      reason,
      nextPeriodInvoiceReference: inv,
    })
    const upserted = await upsertRunItemsPg(nextPeriod.id, [cand])
    const varianceItem = upserted.items.find((i) => i.naturalKey === cand.naturalKey)
    await writeStatusChangeEdit(
      {
        finance_billing_records_id: null,
        field_name: `period_variance:${period.periodMonth}:${item.id}`,
        old_value: String(effectiveAmountCents(item)),
        new_value: `${cand.amountCents}:${reason}`,
      },
      { editedBy: 0, editedByName: editor, recordType: "status_change" }
    )
    await insertNotificationPg({
      audience: "finance",
      kind: "finance_variance_queued",
      payload: {
        fromPeriod: period.periodMonth,
        toPeriod: nextKey,
        fromItemId: item.id,
        varianceItemId: varianceItem?.id ?? null,
        deltaCents: cand.amountCents,
        reason,
      },
    })
    return NextResponse.json({ ok: true, nextPeriod: nextKey, item: varianceItem })
  }

  if (locked && getFinancePeriodsMode() === "on") {
    return NextResponse.json(
      {
        error: "Period locked — queue a variance in the next open period (or admin amend).",
        locked: true,
      },
      { status: 409 }
    )
  }

  let next
  try {
    if (body.action === "approve") {
      next = applyReviewAction(item, { type: "approve" })
    } else if (body.action === "adjust") {
      next = applyReviewAction(item, {
        type: "adjust",
        adjustmentCents: body.adjustmentCents ?? 0,
        reason: body.reason ?? "",
      })
    } else if (body.action === "hold") {
      next = applyReviewAction(item, { type: "hold", reason: body.reason ?? "" })
    } else if (body.action === "exclude") {
      next = applyReviewAction(item, { type: "exclude", reason: body.reason ?? "" })
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    )
  }
  await updateRunItemPg(next)
  await writeStatusChangeEdit(
    {
      finance_billing_records_id: null,
      field_name: `run_item:${period.periodMonth}:${item.id}:${body.action}`,
      old_value: item.status,
      new_value: next.status,
    },
    { editedBy: 0, editedByName: editor, recordType: "status_change" }
  )
  return NextResponse.json({ ok: true, item: next })
}
