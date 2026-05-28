import type { BillingScheduleEntry } from "@/lib/billing/buildBillingSchedule"

/**
 * Domain 5 Stage 2.2b — diff two billingSchedule / deliverySchedule JSON arrays
 * and return one entry per changed amount, plus per-line additions and removals.
 *
 * Pure function — no I/O. Used by audit-write hooks to produce finance_edits rows
 * after a schedule mutation succeeds.
 */

export type ScheduleDiffChange =
  | {
      kind: "amount_change"
      lineItemId: string
      monthYear: string
      mediaType: string | null
      old_value: string
      new_value: string
    }
  | {
      kind: "line_add"
      lineItemId: string
      monthYear: string
      mediaType: string | null
      new_value: string
    }
  | {
      kind: "line_remove"
      lineItemId: string
      monthYear: string
      mediaType: string | null
      old_value: string
    }

type ScheduleLine = {
  lineItemId: string
  amount: string
  monthYear: string
  mediaType: string | null
}

function flatten(schedule: BillingScheduleEntry[] | unknown): ScheduleLine[] {
  if (!Array.isArray(schedule)) return []
  const out: ScheduleLine[] = []
  for (const monthEntry of schedule) {
    if (!monthEntry || typeof monthEntry !== "object") continue
    const monthYear = String((monthEntry as Record<string, unknown>).monthYear ?? "")
    if (!monthYear) continue
    const mediaTypes = (monthEntry as Record<string, unknown>).mediaTypes
    if (!Array.isArray(mediaTypes)) continue
    for (const mt of mediaTypes) {
      if (!mt || typeof mt !== "object") continue
      const mediaTypeLabel = String((mt as Record<string, unknown>).mediaType ?? "") || null
      const lineItems = (mt as Record<string, unknown>).lineItems
      if (!Array.isArray(lineItems)) continue
      for (const li of lineItems) {
        if (!li || typeof li !== "object") continue
        const lineItemId = String((li as Record<string, unknown>).lineItemId ?? "")
        const amount = String((li as Record<string, unknown>).amount ?? "")
        if (!lineItemId) continue
        out.push({ lineItemId, amount, monthYear, mediaType: mediaTypeLabel })
      }
    }
  }
  return out
}

/**
 * Diff old vs new. Stable on lineItemId. Returns empty array when schedules
 * are identical or unparseable.
 */
export function diffBillingSchedules(
  oldSchedule: unknown,
  newSchedule: unknown
): ScheduleDiffChange[] {
  const oldLines = flatten(oldSchedule)
  const newLines = flatten(newSchedule)

  const oldById = new Map<string, ScheduleLine>()
  for (const l of oldLines) oldById.set(l.lineItemId, l)
  const newById = new Map<string, ScheduleLine>()
  for (const l of newLines) newById.set(l.lineItemId, l)

  const changes: ScheduleDiffChange[] = []

  for (const [id, newLine] of newById) {
    const oldLine = oldById.get(id)
    if (!oldLine) {
      changes.push({
        kind: "line_add",
        lineItemId: id,
        monthYear: newLine.monthYear,
        mediaType: newLine.mediaType,
        new_value: newLine.amount,
      })
      continue
    }
    if (oldLine.amount !== newLine.amount || oldLine.monthYear !== newLine.monthYear) {
      changes.push({
        kind: "amount_change",
        lineItemId: id,
        monthYear: newLine.monthYear,
        mediaType: newLine.mediaType,
        old_value: oldLine.amount,
        new_value: newLine.amount,
      })
    }
  }

  for (const [id, oldLine] of oldById) {
    if (!newById.has(id)) {
      changes.push({
        kind: "line_remove",
        lineItemId: id,
        monthYear: oldLine.monthYear,
        mediaType: oldLine.mediaType,
        old_value: oldLine.amount,
      })
    }
  }

  return changes
}
