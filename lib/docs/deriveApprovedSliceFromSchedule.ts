/**
 * HF6 — rebuild an ApprovedSlice from persisted schedule_months when
 * media_plan_versions.approved_slice was never frozen.
 *
 * Read-time only. Never persist the result: approved_slice is the frozen
 * record of a real approval (see lib/finance/approvedSlice.ts).
 */

import type { ApprovedSlice, ApprovedSliceLine } from "@/lib/finance/approvedSlice"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import {
  mediaTypeFromScheduleLineId,
  type ScheduleMonthRowInput,
} from "@/lib/finance/scheduleMonthsSource"

function monthKey(month: string): string {
  const raw = String(month ?? "").trim()
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7)
  return raw
}

type LineAcc = {
  months: Set<string>
  mediaCents: number
  feeCents: number
  adservingCents: number
  productionCents: number
}

export function deriveApprovedSliceFromScheduleRows(
  rows: ScheduleMonthRowInput[],
  opts?: { unapprovedLineIds?: ReadonlySet<string> }
): ApprovedSlice | null {
  const unapprovedCanon = new Set<string>()
  for (const raw of opts?.unapprovedLineIds ?? []) {
    const canon = toBillingOverrideLineItemId(raw)
    if (canon) unapprovedCanon.add(canon)
  }

  const byLine = new Map<string, LineAcc>()

  for (const r of rows) {
    if (r.basis !== "billing") continue
    const lineItemId = String(r.lineItemId ?? "")
    if (lineItemId.startsWith("__service__")) continue
    const canon = toBillingOverrideLineItemId(lineItemId)
    if (canon && unapprovedCanon.has(canon)) continue

    let acc = byLine.get(lineItemId)
    if (!acc) {
      acc = {
        months: new Set(),
        mediaCents: 0,
        feeCents: 0,
        adservingCents: 0,
        productionCents: 0,
      }
      byLine.set(lineItemId, acc)
    }

    const mk = monthKey(r.month)
    if (mk) acc.months.add(mk)

    const amt = Number(r.amountCents) || 0
    if (r.component === "fee") {
      acc.feeCents += amt
    } else if (r.component === "adserving") {
      acc.adservingCents += amt
    } else if (r.component === "media") {
      if (mediaTypeFromScheduleLineId(lineItemId) === "production") {
        acc.productionCents += amt
      } else {
        acc.mediaCents += amt
      }
    }
  }

  if (byLine.size === 0) return null

  const lines: ApprovedSliceLine[] = [...byLine.entries()]
    .map(([lineItemId, acc]) => ({
      lineItemId,
      months: [...acc.months].sort(),
      mediaCents: acc.mediaCents,
      feeCents: acc.feeCents,
      adservingCents: acc.adservingCents,
      productionCents: acc.productionCents,
    }))
    .sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))

  const totalCents = lines.reduce(
    (s, l) =>
      s + l.mediaCents + l.feeCents + l.adservingCents + l.productionCents,
    0
  )

  return { totalCents, lines }
}
