import {
  applyScheduleLineAmountEdit,
  applyScheduleMonthCostEdit,
  feeItemCodeToCostField,
} from "@/lib/billing/applyScheduleLineAmountEdit"
import { billingMonthIsoToScheduleLabel } from "@/lib/billing/billingMonthIsoToScheduleLabel"
import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import { compareBillingDivergence } from "@/lib/billing/compareBillingDivergence"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import type { BillingMonth } from "@/lib/billing/types"
import type { BillingLineItem } from "@/lib/types/financeBilling"

export type InlineScheduleEditContext = {
  versionId: number
  versionNumber: number
  mbaNumber: string
  billingMonthIso: string
}

export type InlineScheduleEditResult = {
  amount: number
  stampedManual: boolean
  showedDivergenceToast: boolean
}

async function loadScheduleMonths(
  ctx: InlineScheduleEditContext
): Promise<BillingMonth[]> {
  const res = await fetch(
    `/api/mediaplans/mba/${encodeURIComponent(ctx.mbaNumber)}?billingScheduleFull=1&version=${ctx.versionNumber}`
  )
  if (!res.ok) {
    let message = `Load failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) message = String(body.error)
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  const data = (await res.json()) as { billingSchedule?: unknown }
  const months = parsePersistedBillingScheduleToMonths(data.billingSchedule)
  if (!months || months.length === 0) {
    throw new Error("No billing schedule found for this version.")
  }
  return months
}

async function patchSchedule(versionId: number, months: BillingMonth[]): Promise<void> {
  const res = await fetch(`/api/mediaplans/versions/${versionId}/billing-schedule`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ billingSchedule: buildBillingScheduleJSON(months) }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Save failed" }))) as { error?: string }
    throw new Error(err.error || "Save failed")
  }
}

/**
 * Commit a single receivable line amount edit via the Alter Billing write path.
 */
export async function commitInlineScheduleAmountEdit(params: {
  ctx: InlineScheduleEditContext
  line: BillingLineItem
  amount: number
}): Promise<InlineScheduleEditResult> {
  const scheduleMonthYear = billingMonthIsoToScheduleLabel(params.ctx.billingMonthIso)
  if (!scheduleMonthYear) {
    throw new Error("Invalid billing month.")
  }

  const original = await loadScheduleMonths(params.ctx)
  let updated: BillingMonth[] | null = null
  let stampedManual = false

  const scheduleLineId = (params.line.schedule_line_item_id ?? "").trim()
  if (scheduleLineId && params.line.line_type === "media") {
    updated = applyScheduleLineAmountEdit(original, {
      lineItemId: scheduleLineId,
      monthYear: scheduleMonthYear,
      amount: params.amount,
      stampManual: true,
    })
    stampedManual = true
  } else if (params.line.line_type === "service") {
    const field = feeItemCodeToCostField(params.line.item_code)
    if (!field) {
      throw new Error("This fee line cannot be edited inline.")
    }
    updated = applyScheduleMonthCostEdit(original, {
      monthYear: scheduleMonthYear,
      field,
      amount: params.amount,
    })
  } else {
    throw new Error("This line cannot be edited inline (missing schedule line id).")
  }

  if (!updated) {
    throw new Error("Could not locate this line in the billing schedule.")
  }

  await patchSchedule(params.ctx.versionId, updated)

  const divergence = compareBillingDivergence(updated, original)
  return {
    amount: params.amount,
    stampedManual,
    showedDivergenceToast: divergence.isDivergent,
  }
}
