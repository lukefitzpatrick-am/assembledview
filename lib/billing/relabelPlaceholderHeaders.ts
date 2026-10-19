import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"

/**
 * Index container or dashboard lines by the id a billing row stores.
 * Editor rows use `lineItemId`. Dashboard rows use `line_item_id`.
 */
export function billingLinesById(
  groups: Array<readonly unknown[] | null | undefined>,
): Record<string, unknown> {
  const byId: Record<string, unknown> = {}
  for (const group of groups) {
    if (!Array.isArray(group)) continue
    for (const item of group) {
      if (!item || typeof item !== "object") continue
      const row = item as Record<string, unknown>
      const raw = row.lineItemId ?? row.line_item_id ?? row.id
      if (raw == null) continue
      const id = String(raw).trim()
      if (!id) continue
      byId[id] = item
    }
  }
  return byId
}

function lineForHeaders(line: unknown): unknown {
  if (!line || typeof line !== "object") return line
  const row = line as Record<string, unknown>
  const attrs = row.attrs
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return line
  return { ...(attrs as Record<string, unknown>), ...row }
}

/**
 * Replace placeholder spend-row headers with `getScheduleHeaders`.
 * A placeholder is header1 equal to the media key and header2 equal to the line id.
 * Returns a new schedule. Amounts and every other row stay as they are.
 */
export function relabelPlaceholderHeaders(
  schedule: BillingMonth[],
  lineItemsById: Record<string, unknown>,
): BillingMonth[] {
  return schedule.map((month) => {
    const buckets = month.lineItems
    if (!buckets) return month

    let monthChanged = false
    const nextBuckets: NonNullable<BillingMonth["lineItems"]> = { ...buckets }

    for (const mediaKey of Object.keys(buckets) as Array<keyof NonNullable<BillingMonth["lineItems"]>>) {
      const rows = buckets[mediaKey]
      if (!Array.isArray(rows) || rows.length === 0) continue

      let rowsChanged = false
      const nextRows = rows.map((row) => {
        const id = String(row.id ?? "")
        if (row.header1 !== mediaKey || row.header2 !== id) return row
        const line = lineItemsById[id]
        if (line == null) return row
        const headers = getScheduleHeaders(mediaKey, lineForHeaders(line))
        rowsChanged = true
        const next: BillingLineItem = {
          ...row,
          header1: headers.header1,
          header2: headers.header2,
        }
        return next
      })

      if (rowsChanged) {
        monthChanged = true
        nextBuckets[mediaKey] = nextRows
      }
    }

    if (!monthChanged) return month
    return { ...month, lineItems: nextBuckets }
  })
}
