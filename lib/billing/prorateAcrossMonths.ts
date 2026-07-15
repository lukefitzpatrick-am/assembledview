const MS_PER_DAY = 1000 * 60 * 60 * 24

const MONTH_INDEX: Record<string, number> = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
}

function toLocalMidnight(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function monthBoundsFromKey(monthKey: string): { start: Date; end: Date } | null {
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(monthKey.trim())
  if (!match) return null

  const month = MONTH_INDEX[match[1]!]
  const year = Number(match[2])
  if (month == null || !Number.isFinite(year)) return null

  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0),
  }
}

/**
 * Round day-weighted shares to cents so they sum exactly to `targetAmount`
 * (largest-remainder method). Preserves sign of the target.
 */
export function reconcileSharesToCents(
  rawShares: Record<string, number>,
  targetAmount: number
): Record<string, number> {
  if (!Number.isFinite(targetAmount)) return {}

  const targetCents = Math.round(targetAmount * 100)
  const entries = Object.entries(rawShares).filter(
    ([, v]) => Number.isFinite(v) && Math.abs(v) > 1e-12
  )
  if (entries.length === 0) return {}

  // Work in absolute cents for remainder distribution; re-apply sign at the end
  // when target is negative (all raw shares should share that sign).
  const sign = targetCents < 0 ? -1 : 1
  const absTarget = Math.abs(targetCents)

  type Part = { key: string; floor: number; frac: number }
  const parts: Part[] = entries.map(([key, raw]) => {
    const exact = Math.abs(raw) * 100
    const floor = Math.floor(exact + 1e-9)
    return { key, floor, frac: exact - floor }
  })

  let floorSum = parts.reduce((s, p) => s + p.floor, 0)
  // Guard float noise where floors already overshoot by a cent
  if (floorSum > absTarget) {
    let over = floorSum - absTarget
    const byFracAsc = [...parts].sort((a, b) => a.frac - b.frac || a.key.localeCompare(b.key))
    for (const p of byFracAsc) {
      if (over <= 0) break
      if (p.floor <= 0) continue
      p.floor -= 1
      over -= 1
      floorSum -= 1
    }
  }

  let remainder = absTarget - floorSum
  const byFracDesc = [...parts].sort((a, b) => b.frac - a.frac || a.key.localeCompare(b.key))
  for (let i = 0; i < byFracDesc.length && remainder > 0; i++) {
    byFracDesc[i]!.floor += 1
    remainder -= 1
  }

  const out: Record<string, number> = {}
  for (const p of parts) {
    out[p.key] = (sign * p.floor) / 100
  }
  return out
}

export function prorateAcrossMonths(params: {
  amount: number
  burstStart: Date | string
  burstEnd: Date | string
  monthKeys: string[]
}): Record<string, number> {
  const start = toLocalMidnight(params.burstStart)
  const end = toLocalMidnight(params.burstEnd)
  if (!start || !end || start > end) return {}

  const daysTotal = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1
  if (daysTotal <= 0) return {}

  const shares: Record<string, number> = {}
  for (const monthKey of params.monthKeys) {
    const bounds = monthBoundsFromKey(monthKey)
    if (!bounds) continue

    const sliceStartMs = Math.max(start.getTime(), bounds.start.getTime())
    const sliceEndMs = Math.min(end.getTime(), bounds.end.getTime())
    const daysInMonth = Math.round((sliceEndMs - sliceStartMs) / MS_PER_DAY) + 1
    if (daysInMonth > 0) {
      shares[monthKey] = params.amount * (daysInMonth / daysTotal)
    }
  }

  return reconcileSharesToCents(shares, params.amount)
}
