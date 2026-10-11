/**
 * Publish drops a line only when it has no buy type and no money on any burst.
 * Production stays exempt from the buy-type clause (C-91) and is empty when
 * every burst budget, buy amount, and calculated value is 0 or blank.
 * If every line in the plan is empty, nothing is stripped.
 */

import { parseMoneyInput, type MoneyInput } from "@/lib/format/money"

export type EmptyLineFields = {
  lineItemId?: string | null
  line_item_id?: string | null
  channel?: string | null
  mediaType?: string | null
  media_type?: string | null
  buyType?: string | null
  buy_type?: string | null
  bursts?: unknown
}

const PRODUCTION_CHANNEL = "production"

const emptyLineResumes = new WeakSet<object>()

/** An empty array the editor passes as initialLineItems after a strip. */
export function markEmptyLineResume(items: object): void {
  emptyLineResumes.add(items)
}

export function isEmptyLineResume(items: object): boolean {
  return emptyLineResumes.has(items)
}

export function emptyLinesRemovedNotice(count: number): string {
  return `Removed ${count} empty lines with no buy type, budget, or rate.`
}

function lineId(line: EmptyLineFields): string {
  const raw = line.lineItemId ?? line.line_item_id ?? ""
  return typeof raw === "string" ? raw.trim() : ""
}

function buyTypeBlank(line: EmptyLineFields): boolean {
  const raw = line.buyType ?? line.buy_type
  if (typeof raw !== "string") return true
  return raw.trim() === ""
}

function isProductionLine(line: EmptyLineFields, channel?: string): boolean {
  const named = channel ?? line.channel ?? line.mediaType ?? line.media_type ?? ""
  return String(named).trim().toLowerCase() === PRODUCTION_CHANNEL
}

function amountBlankOrZero(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === "string" && value.trim() === "") return true
  if (typeof value !== "string" && typeof value !== "number") return false
  const parsed = parseMoneyInput(value as MoneyInput)
  if (parsed == null) return true
  return parsed === 0
}

function burstIsEmpty(burst: unknown): boolean {
  if (!burst || typeof burst !== "object") return true
  const row = burst as Record<string, unknown>
  return (
    amountBlankOrZero(row.budget) &&
    amountBlankOrZero(row.buyAmount ?? row.buy_amount) &&
    amountBlankOrZero(row.calculatedValue ?? row.calculated_value)
  )
}

export function isEmptyLineItem(line: EmptyLineFields, channel?: string): boolean {
  const bursts = Array.isArray(line.bursts) ? line.bursts : []
  if (!bursts.every(burstIsEmpty)) return false
  if (isProductionLine(line, channel)) return true
  return buyTypeBlank(line)
}

export function stripEmptyLineItems<T extends EmptyLineFields>(
  lines: T[],
): { kept: T[]; removedIds: string[] } {
  const removedIds: string[] = []
  const kept: T[] = []
  for (const line of lines) {
    if (isEmptyLineItem(line)) {
      const id = lineId(line)
      if (id) removedIds.push(id)
      continue
    }
    kept.push(line)
  }
  if (kept.length === 0) return { kept: lines, removedIds: [] }
  return { kept, removedIds }
}

export function stripEmptyLinesOnPublish<T extends EmptyLineFields>(
  mode: "draft" | "new_version" | "publish",
  lines: T[],
): { lineItems: T[]; removedIds: string[] } {
  if (mode !== "publish") return { lineItems: lines, removedIds: [] }
  const stripped = stripEmptyLineItems(lines)
  return { lineItems: stripped.kept, removedIds: stripped.removedIds }
}

/**
 * Drop a removed id only while the line is still empty. A line filled during
 * the save stays, and an untouched channel keeps its array reference.
 */
export function linesAfterRemovedIds<T extends EmptyLineFields>(
  lines: readonly T[],
  removedIds: ReadonlySet<string>,
  channel?: string,
): { lines: T[]; removedCount: number } {
  if (removedIds.size === 0 || lines.length === 0) {
    return { lines: lines as T[], removedCount: 0 }
  }
  let removedCount = 0
  const next: T[] = []
  for (const line of lines) {
    const id = lineId(line)
    if (id && removedIds.has(id) && isEmptyLineItem(line, channel)) {
      removedCount += 1
      continue
    }
    next.push(line)
  }
  if (removedCount === 0) return { lines: lines as T[], removedCount: 0 }
  if (next.length === 0) markEmptyLineResume(next)
  return { lines: next, removedCount }
}

export function removedEmptyLineUpdates<T extends EmptyLineFields>(
  channels: ReadonlyArray<{ key: string; lines: readonly T[]; channel?: string }>,
  removedIds: readonly string[],
): { updates: Array<{ key: string; lines: T[] }>; removedCount: number } {
  const idSet = new Set(removedIds.map((id) => id.trim()).filter(Boolean))
  if (idSet.size === 0) return { updates: [], removedCount: 0 }
  const updates: Array<{ key: string; lines: T[] }> = []
  let removedCount = 0
  for (const channel of channels) {
    const applied = linesAfterRemovedIds(channel.lines, idSet, channel.channel)
    if (applied.lines === channel.lines) continue
    updates.push({ key: channel.key, lines: applied.lines })
    removedCount += applied.removedCount
  }
  return { updates, removedCount }
}
