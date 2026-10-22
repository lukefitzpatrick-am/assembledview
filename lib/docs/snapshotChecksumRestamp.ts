/**
 * Helpers for scripts/backfill/restamp-snapshot-checksum.ts.
 * SB1 deleted __service__production schedule_months rows that duplicated
 * per-line production on bare production ids (PENFOLD020PROD1).
 */
import type { ChecksumScheduleRow } from "@/lib/docs/snapshotChecksum"

const BARE_PRODUCTION_ID = /^[A-Za-z]+[0-9]+PROD[0-9]+$/
const SERVICE_PRODUCTION = "__service__production"

/** SB1 rows put back: one service row per basis/month that has bare production and none. */
export function restoreServiceProductionRows(rows: ChecksumScheduleRow[]): ChecksumScheduleRow[] {
  const sums = new Map<string, { basis: string; month: string; cents: number; nonZero: boolean }>()
  const hasService = new Set<string>()
  for (const r of rows) {
    const key = `${r.basis}|${r.month}`
    if (r.lineItemId === SERVICE_PRODUCTION) hasService.add(key)
    if (r.component !== "media" || !BARE_PRODUCTION_ID.test(r.lineItemId)) continue
    const acc = sums.get(key) ?? { basis: r.basis, month: r.month, cents: 0, nonZero: false }
    acc.cents += r.amountCents
    if (r.amountCents !== 0) acc.nonZero = true
    sums.set(key, acc)
  }
  const restored = [...rows]
  for (const [key, acc] of sums) {
    if (!acc.nonZero || hasService.has(key)) continue
    restored.push({
      lineItemId: SERVICE_PRODUCTION,
      component: "media",
      basis: acc.basis,
      month: acc.month,
      amountCents: acc.cents,
      source: "computed",
    })
  }
  return restored
}

