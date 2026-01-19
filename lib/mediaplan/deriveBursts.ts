export type NormalisedBurst = {
  id: string
  startDate: string
  endDate: string
  spend?: number
  deliverables?: number
}

function parseDateSafe(value?: string | Date | number | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date: Date) {
  return date.toISOString()
}

function ensureDate(value?: string | Date | number | null, fallback?: Date | null) {
  return parseDateSafe(value) || fallback || null
}

function toNumber(value: any): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function parseBurstArray(value: unknown): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function normaliseBurst(
  raw: any,
  lineItemId: string | number,
  index: number,
  fallbackStart?: string | Date | null,
  fallbackEnd?: string | Date | null
): NormalisedBurst | null {
  const startCandidate = raw?.start_date ?? raw?.startDate ?? raw?.start ?? fallbackStart
  const endCandidate = raw?.end_date ?? raw?.endDate ?? raw?.end ?? fallbackEnd ?? startCandidate

  const startDateValue = ensureDate(startCandidate, parseDateSafe(fallbackStart))
  const endDateValue = ensureDate(endCandidate, parseDateSafe(fallbackEnd) || startDateValue)

  if (!startDateValue || !endDateValue) {
    return null
  }

  const start = startDateValue <= endDateValue ? startDateValue : endDateValue
  const end = endDateValue >= startDateValue ? endDateValue : startDateValue

  return {
    id: `${lineItemId}-b${index}`,
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    spend: toNumber(raw?.spend ?? raw?.budget ?? raw?.media_investment ?? raw?.investment),
    deliverables: toNumber(
      raw?.deliverables ?? raw?.deliverable ?? raw?.deliverablesAmount ?? raw?.impressions ?? raw?.views ?? raw?.spots
    ),
  }
}
