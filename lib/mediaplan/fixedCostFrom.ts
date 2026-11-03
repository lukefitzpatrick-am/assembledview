/**
 * Fixed cost from a date (B23, decisions FC2, FC5, FC7, FC8).
 *
 * `line_items.fixed_cost_from` is one Melbourne civil date per line, read only
 * when `fixed_cost_media` is true. Null means the whole flight (today). Days
 * before the date report the line's actual delivery; from the date the line
 * reports fixed-cost spend. Switching fixed cost off clears it.
 *
 * Pure: the editors, the save payload, the save route and the readers share it.
 */
import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"

export const FIXED_COST_FROM_INVALID = "FIXED_COST_FROM_INVALID" as const

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function realCalendarDay(ymd: string): boolean {
  const match = DATE_ONLY.exec(ymd)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

/**
 * A stored or typed date as `YYYY-MM-DD`, or null.
 * - `YYYY-MM-DD` that is a real calendar day: kept.
 * - A Date or an instant string: its Melbourne civil day.
 * - Blank, null, anything else: null.
 */
export function normaliseFixedCostFrom(raw: unknown): string | null {
  if (raw == null) return null
  if (raw instanceof Date) {
    const ymd = formatBurstDateLocal(raw)
    return realCalendarDay(ymd) ? ymd : null
  }
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (DATE_ONLY.test(trimmed)) return realCalendarDay(trimmed) ? trimmed : null
  const ymd = formatBurstDateLocal(trimmed)
  return ymd && realCalendarDay(ymd) ? ymd : null
}

/** True when a non-blank value was given but it is not a date. */
export function isUnreadableFixedCostFrom(raw: unknown): boolean {
  if (raw == null) return false
  if (typeof raw === "string" && raw.trim() === "") return false
  return normaliseFixedCostFrom(raw) == null
}

/** The value to persist: null unless the line is fixed cost media (FC8). */
export function fixedCostFromForSave(fixedCostMedia: unknown, raw: unknown): string | null {
  if (fixedCostMedia !== true) return null
  return normaliseFixedCostFrom(raw)
}

/** Read side: the date that applies, or null (whole flight, or not fixed cost). */
export function effectiveFixedCostFrom(
  line: Record<string, unknown> | null | undefined,
  switchOn: boolean,
): string | null {
  if (!switchOn || !line) return null
  const fixed = line.fixed_cost_media === true || line.fixedCostMedia === true
  if (!fixed) return null
  return normaliseFixedCostFrom(line.fixed_cost_from ?? line.fixedCostFrom)
}

export type LineFlight = { start: string; end: string }

function burstList(raw: unknown): Record<string, unknown>[] {
  let value = raw
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object")
}

function burstDay(value: unknown): string | null {
  if (value instanceof Date) return normaliseFixedCostFrom(value)
  if (typeof value === "string") return normaliseFixedCostFrom(value)
  return null
}

/** First burst start to last burst end, as Melbourne days. Null when no burst has both. */
export function lineFlightFromBursts(bursts: unknown): LineFlight | null {
  let start: string | null = null
  let end: string | null = null
  for (const burst of burstList(bursts)) {
    const s = burstDay(burst.startDate ?? burst.start_date)
    const e = burstDay(burst.endDate ?? burst.end_date)
    if (!s || !e) continue
    if (start == null || s < start) start = s
    if (end == null || e > end) end = e
  }
  return start && end ? { start, end } : null
}

/** "15 Oct 2026" for messages. */
export function formatFixedCostFromLabel(ymd: string): string {
  const match = DATE_ONLY.exec(ymd)
  if (!match) return ymd
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`
}

/**
 * Null when the date is fine. Otherwise the reason, in the editor's words.
 * The date can be in the past (FC7) but must sit inside the line's flight.
 * No flight yet (no dated bursts): nothing to check.
 */
export function fixedCostFromIssue(raw: unknown, bursts: unknown): string | null {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return null
  const ymd = normaliseFixedCostFrom(raw)
  if (!ymd) return "Fixed cost from isn't a valid date."
  const flight = lineFlightFromBursts(bursts)
  if (!flight) return null
  if (ymd < flight.start || ymd > flight.end) {
    return `Fixed cost from must be inside the line's flight (${formatFixedCostFromLabel(flight.start)} to ${formatFixedCostFromLabel(flight.end)}).`
  }
  return null
}

type GateLine = {
  lineItemId: string
  fixedCostMedia?: boolean | null
  fixedCostFrom?: string | null
  bursts?: unknown
}

export type FixedCostFromGateResult =
  | { reject: false }
  | {
      reject: true
      body: {
        error: string
        code: typeof FIXED_COST_FROM_INVALID
        lineItemIds: string[]
      }
    }

/**
 * Save gate (switch on, publish and new_version): every fixed-cost line's date
 * must be a real date inside its flight. Lines that are not fixed cost carry
 * no date (the route clears it), so they are not checked.
 */
export function fixedCostFromGateResult(
  mode: string,
  lines: readonly GateLine[],
  switchOn: boolean,
): FixedCostFromGateResult {
  if (!switchOn) return { reject: false }
  if (mode !== "publish" && mode !== "new_version") return { reject: false }
  const ids: string[] = []
  const reasons: string[] = []
  for (const line of lines) {
    if (line.fixedCostMedia !== true) continue
    const issue = fixedCostFromIssue(line.fixedCostFrom, line.bursts)
    if (!issue) continue
    ids.push(line.lineItemId)
    reasons.push(`${line.lineItemId}: ${issue}`)
  }
  if (ids.length === 0) return { reject: false }
  return {
    reject: true,
    body: {
      error: `Fix the fixed cost from date before saving. ${reasons.join(" ")}`,
      code: FIXED_COST_FROM_INVALID,
      lineItemIds: ids,
    },
  }
}

type SaveLine = { fixedCostMedia?: boolean | null; fixedCostFrom?: string | null }

/**
 * Every save mode: a line keeps `fixedCostFrom` only when it is fixed cost
 * media and the value is a real date (FC8). Otherwise the key is removed, so
 * a plan with no dates saves exactly as before.
 */
export function normaliseSaveLinesFixedCostFrom<T extends SaveLine>(lines: readonly T[]): T[] {
  return lines.map((line) => {
    const date = fixedCostFromForSave(line.fixedCostMedia, line.fixedCostFrom)
    if (date) return line.fixedCostFrom === date ? line : { ...line, fixedCostFrom: date }
    if (!("fixedCostFrom" in line)) return line
    const { fixedCostFrom: _drop, ...rest } = line
    return rest as T
  })
}
