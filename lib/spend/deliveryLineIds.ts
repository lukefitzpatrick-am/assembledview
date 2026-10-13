import { lineIsAssumedSpend } from "@/lib/pacing/direct/assumedSpendLine"
import { hasPositiveDelivery } from "@/lib/spend/assumeSpendRule"

function addId(ids: Set<string>, lineItemId: string | null | undefined): void {
  const key = String(lineItemId ?? "").trim().toLowerCase()
  if (key) ids.add(key)
}

/** Pacing, social, search, CM360, and programmatic rows already in memory. */
export function addLoadedDeliveryLineIds(
  ids: Set<string>,
  rows: readonly {
    lineItemId?: string | null
    impressions?: number | null
    clicks?: number | null
    spend?: number | null
  }[],
): void {
  for (const row of rows) {
    if (
      hasPositiveDelivery({
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
      })
    ) {
      addId(ids, row.lineItemId)
    }
  }
}

type DailyFact = {
  LINE_ITEM_ID?: unknown
  REPORTED_SPEND?: unknown
  ACTUAL_PLATFORM_SPEND?: unknown
  ACTUAL_DELIVERABLES?: unknown
  CAP_APPLIED?: unknown
}

function finite(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Fixed-cost and partner-file daily facts already loaded for these lines.
 * Rows stamped `assumed_spend` are the app's own assumption, not delivery.
 */
export function addDailyFactDeliveryLineIds(ids: Set<string>, facts: readonly DailyFact[]): void {
  const byLine = new Map<string, DailyFact[]>()
  for (const fact of facts) {
    const id = String(fact.LINE_ITEM_ID ?? "").trim().toLowerCase()
    if (!id) continue
    const list = byLine.get(id) ?? []
    list.push(fact)
    byLine.set(id, list)
  }
  for (const [id, days] of byLine) {
    if (lineIsAssumedSpend({ daily: days.map((day) => ({ capApplied: String(day.CAP_APPLIED ?? "") })) })) {
      continue
    }
    const present = days.some((day) =>
      hasPositiveDelivery({
        impressions: finite(day.ACTUAL_DELIVERABLES),
        spend: finite(day.REPORTED_SPEND) || finite(day.ACTUAL_PLATFORM_SPEND),
      }),
    )
    if (present) ids.add(id)
  }
}
