import { parseBurstArray } from "./deriveBursts"

function parseDateSafe(value?: any): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIso(date: Date | null | undefined) {
  return date ? date.toISOString() : undefined
}

function ensureBurstsJson(item: any) {
  if (typeof item?.bursts_json === "string") return item.bursts_json
  if (Array.isArray(item?.bursts_json)) return JSON.stringify(item.bursts_json)
  if (Array.isArray(item?.bursts)) return JSON.stringify(item.bursts)
  return undefined
}

function deriveDatesFromBursts(bursts: any[]) {
  const starts: Date[] = []
  const ends: Date[] = []

  bursts.forEach((burst) => {
    const start = parseDateSafe(burst?.start_date ?? burst?.startDate ?? burst?.start)
    const end = parseDateSafe(burst?.end_date ?? burst?.endDate ?? burst?.end ?? start)
    if (start) starts.push(start)
    if (end) ends.push(end)
  })

  if (!starts.length || !ends.length) {
    return { start: undefined, end: undefined }
  }

  const minStart = starts.reduce((min, curr) => (curr < min ? curr : min), starts[0])
  const maxEnd = ends.reduce((max, curr) => (curr > max ? curr : max), ends[0])
  return { start: minStart, end: maxEnd }
}

/**
 * Normalise Xano line items for campaign consumption:
 * - bursts_json is always a JSON string (if bursts / bursts_json were arrays)
 * - start_date / end_date are derived from bursts when missing
 * - delivers items without mutating deliverable fields
 */
export function normalizeCampaignLineItems(
  lineItemsByType: Record<string, any[]>,
  fallbackStart?: string,
  fallbackEnd?: string
) {
  const output: Record<string, any[]> = {}

  Object.entries(lineItemsByType || {}).forEach(([type, items]) => {
    if (!Array.isArray(items)) {
      output[type] = []
      return
    }

    output[type] = items.map((item) => {
      const bursts = parseBurstArray(item?.bursts_json ?? item?.bursts)
      const derivedDates = deriveDatesFromBursts(bursts)

      const startDate =
        item?.start_date ??
        item?.startDate ??
        toIso(derivedDates.start) ??
        toIso(parseDateSafe(fallbackStart))

      const endDate =
        item?.end_date ??
        item?.endDate ??
        toIso(derivedDates.end) ??
        toIso(parseDateSafe(fallbackEnd))

      const burstsJson = ensureBurstsJson(item)
      const finalBurstsJson =
        burstsJson ??
        (bursts.length ? JSON.stringify(bursts) : undefined) ??
        (Array.isArray(item?.bursts) ? JSON.stringify(item?.bursts) : item?.bursts_json)

      return {
        ...item,
        bursts: bursts.length ? bursts : item?.bursts,
        bursts_json: finalBurstsJson,
        start_date: startDate ?? toIso(derivedDates.start),
        end_date: endDate ?? toIso(derivedDates.end),
      }
    })
  })

  return output
}
