import type { OpsCheckResult, OpsCheckStatus, OpsHealthReport } from "./types"

export function summariseStatuses(results: OpsCheckResult[]): Pick<
  OpsHealthReport,
  "redCount" | "amberCount" | "greenCount"
> {
  let redCount = 0
  let amberCount = 0
  let greenCount = 0
  for (const r of results) {
    if (r.status === "red") redCount++
    else if (r.status === "amber") amberCount++
    else greenCount++
  }
  return { redCount, amberCount, greenCount }
}

/**
 * Subject: `AV ops ✅ all green` / `AV ops ⚠ n amber` / `AV ops 🔴 n red — <first red name>`
 */
export function buildOpsHealthSubject(results: OpsCheckResult[]): string {
  const { redCount, amberCount } = summariseStatuses(results)
  if (redCount > 0) {
    const firstRed = results.find((r) => r.status === "red")?.name ?? "check"
    return `AV ops 🔴 ${redCount} red — ${firstRed}`
  }
  if (amberCount > 0) {
    return `AV ops ⚠ ${amberCount} amber`
  }
  return "AV ops ✅ all green"
}

export function worstStatus(statuses: OpsCheckStatus[]): OpsCheckStatus {
  if (statuses.includes("red")) return "red"
  if (statuses.includes("amber")) return "amber"
  return "green"
}

/** Days behind Melbourne calendar as-of (0 = fresh through yesterday or today). */
export function daysBehindMaxDate(maxDate: string | null, asOfDate: string): number | null {
  if (!maxDate) return null
  const max = Date.parse(`${maxDate.slice(0, 10)}T00:00:00Z`)
  const asOf = Date.parse(`${asOfDate}T00:00:00Z`)
  if (!Number.isFinite(max) || !Number.isFinite(asOf)) return null
  return Math.round((asOf - max) / 86_400_000)
}

/**
 * Warehouse freshness: red if > 2 days behind as-of, amber if exactly 2, green if ≤ 1.
 * Missing max date → red.
 */
export function freshnessStatus(daysBehind: number | null): OpsCheckStatus {
  if (daysBehind === null) return "red"
  if (daysBehind > 2) return "red"
  if (daysBehind === 2) return "amber"
  return "green"
}

/**
 * Row-volume anomaly: amber if yesterday < 50% of trailing mean, red if 0 where mean > 0.
 */
export function rowVolumeStatus(yesterdayCount: number, trailingMean: number): OpsCheckStatus {
  if (trailingMean > 0 && yesterdayCount === 0) return "red"
  if (trailingMean > 0 && yesterdayCount < trailingMean * 0.5) return "amber"
  return "green"
}
