/**
 * AV-D12 — publishing needs a start and end on every burst.
 *
 * Runs after plansSaveBodySchema and beside the buy type gate, before
 * savePlanVersion. Draft and new_version still save. Production bursts
 * carry startDate and endDate (formatProductionBurstForPersist), so they
 * follow the same rule. Approval "excluded" is not an included line.
 */

import type { BuilderIssue } from "@/lib/mediaplan/builderIssues"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"

export const MISSING_BURST_DATES = "MISSING_BURST_DATES" as const

const LEAD = "Add start and end dates to every burst before publishing."
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const START_KEYS = ["startDate", "start_date"] as const
const END_KEYS = ["endDate", "end_date"] as const

type GateLine = {
  lineItemId: string
  approval?: "approved" | "excluded" | null
  bursts?: unknown
}

function isIncluded(line: GateLine): boolean {
  return line.approval !== "excluded"
}

function burstList(bursts: unknown): unknown[] {
  if (Array.isArray(bursts)) return bursts
  if (bursts && typeof bursts === "object") return [bursts]
  if (typeof bursts !== "string" || !bursts.trim()) return []
  try {
    const parsed = JSON.parse(bursts) as unknown
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === "object") return [parsed]
  } catch {
    return [null]
  }
  return [null]
}

function rawField(burst: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(burst, key)) return burst[key]
  }
  return undefined
}

function realCalendarDay(value: string): boolean {
  const match = DATE_ONLY.exec(value.trim())
  if (!match) return true
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function civilDate(value: unknown): Date | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed || !realCalendarDay(trimmed)) return null
    return coerceBurstDateLocal(trimmed)
  }
  if (value instanceof Date) return coerceBurstDateLocal(value)
  return null
}

function burstDatesOk(burst: unknown): boolean {
  if (!burst || typeof burst !== "object") return false
  const row = burst as Record<string, unknown>
  const start = civilDate(rawField(row, START_KEYS))
  const end = civilDate(rawField(row, END_KEYS))
  if (!start || !end) return false
  return start.getTime() <= end.getTime()
}

export function shouldRejectMissingBurstDatesOnSave(
  mode: "draft" | "new_version" | "publish"
): boolean {
  return mode === "publish"
}

export function missingBurstDateLineIds(lineItems: GateLine[]): string[] {
  const ids: string[] = []
  for (const line of lineItems) {
    if (!isIncluded(line)) continue
    const bursts = burstList(line.bursts)
    if (bursts.length === 0) continue
    if (bursts.some((burst) => !burstDatesOk(burst))) ids.push(line.lineItemId)
  }
  return ids
}

export function formatMissingBurstDatesMessage(lineItemIds: string[]): string {
  if (lineItemIds.length === 0) return LEAD
  const shown = lineItemIds.slice(0, 5)
  const rest = lineItemIds.length - shown.length
  const names = rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ")
  return `${LEAD} ${names}`
}

export function missingBurstDatesResponse(lineItemIds: string[]): {
  error: string
  code: typeof MISSING_BURST_DATES
  lineItemIds: string[]
} {
  return {
    error: formatMissingBurstDatesMessage(lineItemIds),
    code: MISSING_BURST_DATES,
    lineItemIds,
  }
}

export function missingBurstDatesBuilderIssues(lineItemIds: string[]): BuilderIssue[] {
  return lineItemIds.map((id) => ({
    id: `missing-burst-dates:${id}`,
    severity: "error",
    title: `Add start and end dates (${id})`,
    detail: LEAD,
    stepLabel: "Media",
    fieldLabel: "Burst dates",
  }))
}

export function missingBurstDatesGateResult(
  mode: "draft" | "new_version" | "publish",
  lineItems: GateLine[]
):
  | { reject: false }
  | {
      reject: true
      lineItemIds: string[]
      body: {
        error: string
        code: typeof MISSING_BURST_DATES
        lineItemIds: string[]
      }
    } {
  if (!shouldRejectMissingBurstDatesOnSave(mode)) return { reject: false }
  const lineItemIds = missingBurstDateLineIds(lineItems)
  if (lineItemIds.length === 0) return { reject: false }
  return {
    reject: true,
    lineItemIds,
    body: missingBurstDatesResponse(lineItemIds),
  }
}
