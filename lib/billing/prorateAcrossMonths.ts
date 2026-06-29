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

  return shares
}
