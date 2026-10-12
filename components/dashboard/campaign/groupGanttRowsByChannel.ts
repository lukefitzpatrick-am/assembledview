import type { GanttRow } from "@/components/charts/system"
import { fromCents, sumCents, toCentsOrNull } from "@/lib/money"

export type GanttChannelGroup = {
  channelKey: string
  label: string
  lineCount: number
  /** Earliest child burst start week. */
  start: number
  /** Latest child burst end week (exclusive). */
  end: number
  plannedMedia?: number
  rows: GanttRow[]
}

const DEFAULT_COLLAPSE_AT = 20

/**
 * Groups reshape rows by `channelKey` in first-seen order (plan order).
 * `collapsed` is true when the line count is at or above `collapseAt`.
 */
export function groupGanttRowsByChannel(
  rows: readonly GanttRow[],
  options?: { collapseAt?: number },
): { groups: GanttChannelGroup[]; collapsed: boolean } {
  const collapseAt = options?.collapseAt ?? DEFAULT_COLLAPSE_AT
  const order: string[] = []
  const byKey = new Map<string, GanttRow[]>()

  for (const row of rows) {
    const key = row.channelKey ?? ""
    const existing = byKey.get(key)
    if (existing) {
      existing.push(row)
    } else {
      byKey.set(key, [row])
      order.push(key)
    }
  }

  const groups = order.map((channelKey) => {
    const groupRows = byKey.get(channelKey) ?? []
    let start = Number.POSITIVE_INFINITY
    let end = Number.NEGATIVE_INFINITY
    const cents: number[] = []
    for (const row of groupRows) {
      for (const burst of row.bursts) {
        if (burst.startWeek < start) start = burst.startWeek
        if (burst.endWeek > end) end = burst.endWeek
      }
      if (typeof row.plannedMedia === "number" && Number.isFinite(row.plannedMedia)) {
        const parsed = toCentsOrNull(row.plannedMedia)
        if (parsed != null) cents.push(parsed)
      }
    }
    const label = groupRows.find((row) => row.sub && row.sub.trim())?.sub ?? channelKey
    const group: GanttChannelGroup = {
      channelKey,
      label,
      lineCount: groupRows.length,
      start: Number.isFinite(start) ? start : 0,
      end: Number.isFinite(end) ? end : 0,
      rows: groupRows,
    }
    if (cents.length > 0) group.plannedMedia = fromCents(sumCents(cents))
    return group
  })

  return { groups, collapsed: rows.length >= collapseAt }
}
