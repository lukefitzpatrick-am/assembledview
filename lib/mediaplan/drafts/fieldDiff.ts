import { formatDateShort } from "../../format/date.js"
import { formatMoney, parseMoneyInput } from "../../format/money.js"
import type { PlanDraftStateV1 } from "./types.js"

export type DraftFieldKind = "money" | "date" | "text"

export type DraftFieldChange = {
  lineItemId: string
  fieldPath: string
  oldValue: unknown
  newValue: unknown
  wasFormatted: string
  kind: DraftFieldKind
}

export type DraftRemovedLine = {
  lineItemId: string
  label: string
}

export type DraftDiffSummary = {
  fieldChanges: DraftFieldChange[]
  addedLineIds: string[]
  removedLines: DraftRemovedLine[]
  changeCount: number
}

export type DraftLoadKind = "auto" | "stale" | "none" | "pending"

const LINE_SKIP = new Set([
  "_reactKey",
  "id",
  "bursts",
  "totalMedia",
  "totalDeliverables",
  "totalFee",
  "totalCalculatedValue",
])

const BURST_SKIP = new Set([
  "_reactKey",
  "id",
  "calculatedValue",
  "fee",
  "media",
])

const MONEY_KEYS = new Set([
  "budget",
  "buyAmount",
  "unitRate",
  "netMedia",
  "feePct",
  "totalMedia",
  "totalFee",
])

const DATE_KEYS = new Set(["startDate", "endDate", "date"])

export function classifyDraftLoad(args: {
  hasDraft: boolean
  draftBaseVersionId: number | null | undefined
  tipVersionId: number | null | undefined
}): DraftLoadKind {
  if (!args.hasDraft) return "none"
  const draftId = args.draftBaseVersionId ?? null
  const tipId = args.tipVersionId ?? null
  if (draftId == null && tipId == null) return "auto"
  if (draftId == null || tipId == null) return "pending"
  if (draftId === tipId) return "auto"
  return "stale"
}

export function getLineItemId(row: unknown): string {
  if (!row || typeof row !== "object") return ""
  const r = row as { line_item_id?: unknown; lineItemId?: unknown }
  return String(r.line_item_id ?? r.lineItemId ?? "").trim()
}

export function lineItemLabel(row: unknown): string {
  if (!row || typeof row !== "object") return ""
  const r = row as Record<string, unknown>
  const raw =
    r.platform ??
    r.publisher ??
    r.publisher_name ??
    r.publisherName ??
    r.network ??
    r.station ??
    r.site
  return String(raw ?? "").trim()
}

export function inferDraftFieldKind(fieldPath: string): DraftFieldKind {
  const key = fieldPath.split(".").pop() ?? fieldPath
  if (MONEY_KEYS.has(key) || /budget|buyamount|fee/i.test(key)) return "money"
  if (DATE_KEYS.has(key) || /date$/i.test(key)) return "date"
  return "text"
}

export function getValueAtPath(row: unknown, fieldPath: string): unknown {
  if (!row || typeof row !== "object") return undefined
  const parts = fieldPath.split(".").filter(Boolean)
  let cur: unknown = row
  for (const part of parts) {
    if (cur == null) return undefined
    if (Array.isArray(cur)) {
      const idx = Number(part)
      cur = Number.isInteger(idx) ? cur[idx] : undefined
      continue
    }
    if (typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function calendarDay(value: unknown): string | null {
  if (value == null || value === "") return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return localYmd(value)
  }
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return localYmd(d)
  return s
}

export function valuesEqualForDraftDiff(
  a: unknown,
  b: unknown,
  kind: DraftFieldKind = "text",
): boolean {
  if (kind === "money") {
    const na = parseMoneyInput(a as string | number | null | undefined)
    const nb = parseMoneyInput(b as string | number | null | undefined)
    if (na == null && nb == null) {
      return String(a ?? "").trim() === String(b ?? "").trim()
    }
    return na === nb
  }
  if (kind === "date") {
    return calendarDay(a) === calendarDay(b)
  }
  if (a === b) return true
  if (a == null && (b == null || b === "")) return true
  if (b == null && (a == null || a === "")) return true
  return String(a ?? "").trim() === String(b ?? "").trim()
}

export function formatDraftFieldWas(value: unknown, kind: DraftFieldKind): string {
  if (kind === "money") {
    const n = parseMoneyInput(value as string | number | null | undefined)
    if (n == null) return String(value ?? "")
    return formatMoney(n, { locale: "en-AU", currency: "AUD" })
  }
  if (kind === "date") {
    const day = calendarDay(value)
    if (!day) return String(value ?? "")
    return formatDateShort(day)
  }
  if (value == null) return ""
  return String(value)
}

function indexLines(
  channels: Record<string, unknown[]>,
): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const rows of Object.values(channels ?? {})) {
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      const id = getLineItemId(row)
      if (id) map.set(id, row)
    }
  }
  return map
}

function collectFieldPaths(row: unknown, prefix = ""): string[] {
  if (!row || typeof row !== "object") return []
  const paths: string[] = []
  const rec = row as Record<string, unknown>
  for (const [key, val] of Object.entries(rec)) {
    if (LINE_SKIP.has(key) && key !== "bursts") continue
    const path = prefix ? `${prefix}.${key}` : key
    if (key === "bursts" && Array.isArray(val)) {
      val.forEach((burst, i) => {
        if (!burst || typeof burst !== "object") return
        for (const [bk, bv] of Object.entries(burst as Record<string, unknown>)) {
          if (BURST_SKIP.has(bk)) continue
          if (bv !== null && typeof bv === "object" && !Array.isArray(bv) && !(bv instanceof Date)) {
            continue
          }
          paths.push(`bursts.${i}.${bk}`)
        }
      })
      continue
    }
    if (LINE_SKIP.has(key)) continue
    if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
      continue
    }
    paths.push(path)
  }
  return paths
}

export function isDraftFieldChanged(
  base: PlanDraftStateV1 | null | undefined,
  lineItemId: string,
  fieldPath: string,
  currentValue: unknown,
): boolean {
  if (!base || !lineItemId || !fieldPath) return false
  const row = indexLines(base.channels).get(lineItemId)
  if (!row) return false
  const kind = inferDraftFieldKind(fieldPath)
  return !valuesEqualForDraftDiff(getValueAtPath(row, fieldPath), currentValue, kind)
}

export function isDraftLineNew(
  base: PlanDraftStateV1 | null | undefined,
  lineItemId: string,
): boolean {
  if (!base || !lineItemId) return false
  return !indexLines(base.channels).has(lineItemId)
}

export function diffDraftAgainstBase(
  base: PlanDraftStateV1,
  current: PlanDraftStateV1,
): DraftDiffSummary {
  const baseLines = indexLines(base.channels)
  const currentLines = indexLines(current.channels)
  const fieldChanges: DraftFieldChange[] = []
  const addedLineIds: string[] = []
  const removedLines: DraftRemovedLine[] = []

  for (const [id, row] of currentLines) {
    if (!baseLines.has(id)) {
      addedLineIds.push(id)
      continue
    }
    const baseRow = baseLines.get(id)
    const paths = new Set([
      ...collectFieldPaths(baseRow),
      ...collectFieldPaths(row),
    ])
    for (const fieldPath of paths) {
      const kind = inferDraftFieldKind(fieldPath)
      const oldValue = getValueAtPath(baseRow, fieldPath)
      const newValue = getValueAtPath(row, fieldPath)
      if (valuesEqualForDraftDiff(oldValue, newValue, kind)) continue
      fieldChanges.push({
        lineItemId: id,
        fieldPath,
        oldValue,
        newValue,
        wasFormatted: formatDraftFieldWas(oldValue, kind),
        kind,
      })
    }
  }

  for (const [id, row] of baseLines) {
    if (currentLines.has(id)) continue
    const label = lineItemLabel(row)
    removedLines.push({
      lineItemId: id,
      label,
    })
  }

  addedLineIds.sort()
  removedLines.sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
  fieldChanges.sort((a, b) =>
    a.lineItemId === b.lineItemId
      ? a.fieldPath.localeCompare(b.fieldPath)
      : a.lineItemId.localeCompare(b.lineItemId),
  )

  return {
    fieldChanges,
    addedLineIds,
    removedLines,
    changeCount: fieldChanges.length + addedLineIds.length + removedLines.length,
  }
}

export function formatDraftRelativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const sec = Math.max(0, Math.round((now - t) / 1000))
  if (sec < 60) return "just now"
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 86400 * 2) return "yesterday"
  return `${Math.floor(sec / 86400)}d ago`
}

export function removedLineCaption(line: DraftRemovedLine): string {
  const label = line.label ? ` — ${line.label}` : ""
  return `Removed: ${line.lineItemId}${label}`
}
