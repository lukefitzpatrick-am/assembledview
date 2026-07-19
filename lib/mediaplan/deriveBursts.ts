import { coerceBurstDateLocal, formatBurstDateLocal } from "./burstDate"
import { resolveProductionBurstBudget } from "./resolveProductionBurstBudget"

export type NormalisedBurst = {
  id: string
  startDate: string
  endDate: string
  spend?: number
  deliverables?: number
}

function toIsoDate(date: Date) {
  return formatBurstDateLocal(date)
}

function ensureDate(value?: string | Date | number | null, fallback?: Date | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return coerceBurstDateLocal(new Date(value)) || fallback || null
  }
  if (value instanceof Date || typeof value === "string") {
    return coerceBurstDateLocal(value) || fallback || null
  }
  return fallback || null
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
      const trimmed = value.trim()
      if (!trimmed) return []
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === "object") return [parsed]
      return []
    } catch {
      return []
    }
  }
  if (typeof value === "object") return [value]
  return []
}

/**
 * Resolve burst rows from a line item whether stored in `bursts` or `bursts_json`,
 * and whether each field is a JSON string or a native array/object.
 * Matches {@link extractAndFormatBursts} input precedence (bursts array first).
 */
export function resolveLineItemBursts(lineItem: any): any[] {
  if (Array.isArray(lineItem?.bursts)) {
    return lineItem.bursts
  }
  if (lineItem?.bursts && typeof lineItem.bursts === "object") {
    return [lineItem.bursts]
  }
  if (typeof lineItem?.bursts === "string") {
    const fromBursts = parseBurstArray(lineItem.bursts)
    if (fromBursts.length > 0) return fromBursts
  }

  if (lineItem?.bursts_json) {
    if (Array.isArray(lineItem.bursts_json)) return lineItem.bursts_json
    if (typeof lineItem.bursts_json === "string") {
      return parseBurstArray(lineItem.bursts_json)
    }
    if (typeof lineItem.bursts_json === "object") {
      return [lineItem.bursts_json]
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

  const startDateValue = ensureDate(startCandidate, ensureDate(fallbackStart ?? null))
  const endDateValue = ensureDate(endCandidate, ensureDate(fallbackEnd ?? null) || startDateValue)

  if (!startDateValue || !endDateValue) {
    return null
  }

  const start = startDateValue <= endDateValue ? startDateValue : endDateValue
  const end = endDateValue >= startDateValue ? endDateValue : startDateValue

  const { effectiveBudget, deliverables: productionDeliverables } = resolveProductionBurstBudget(raw)

  return {
    id: `${lineItemId}-b${index}`,
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    spend:
      effectiveBudget ||
      toNumber(raw?.spend ?? raw?.budget ?? raw?.media_investment ?? raw?.investment),
    deliverables:
      productionDeliverables ||
      toNumber(
        raw?.deliverables ??
          raw?.deliverable ??
          raw?.deliverablesAmount ??
          raw?.impressions ??
          raw?.views ??
          raw?.spots
      ),
  }
}
