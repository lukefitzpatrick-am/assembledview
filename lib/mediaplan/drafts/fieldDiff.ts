import { formatDateShort } from "../../format/date.js"
import { formatMoney, parseMoneyInput } from "../../format/money.js"
import {
  CAMPAIGN_DRAFT_LINE_ID,
  DRAFT_CHANNEL_ORDER,
  draftChannelLabel,
} from "./fieldLabels.js"
import type { PlanDraftStateV1 } from "./types.js"

export type DraftFieldKind = "money" | "date" | "text"

export type DraftFieldChange = {
  lineItemId: string
  fieldPath: string
  oldValue: unknown
  newValue: unknown
  wasFormatted: string
  kind: DraftFieldKind
  /** Snapshot channel bag key; empty string for campaign-level formValues. */
  channel: string
  /** Publisher/platform label for line grouping; empty on campaign rows. */
  lineLabel: string
}

export type DraftRemovedLine = {
  lineItemId: string
  label: string
  channel: string
}

export type DraftAddedLine = {
  lineItemId: string
  label: string
  channel: string
}

export type DraftDiffSummary = {
  fieldChanges: DraftFieldChange[]
  campaignChanges: DraftFieldChange[]
  addedLineIds: string[]
  addedLines: DraftAddedLine[]
  removedLines: DraftRemovedLine[]
  changeCount: number
}

export const EMPTY_DRAFT_DIFF_SUMMARY: DraftDiffSummary = {
  fieldChanges: [],
  campaignChanges: [],
  addedLineIds: [],
  addedLines: [],
  removedLines: [],
  changeCount: 0,
}

export type DraftDiffLineGroup = {
  lineItemId: string
  label: string
  changes: DraftFieldChange[]
}

export type DraftDiffChannelGroup = {
  channel: string
  channelLabel: string
  lines: DraftDiffLineGroup[]
  fieldCount: number
  moneyDelta: number | null
}

export type DraftDiffGrouped = {
  campaign: DraftFieldChange[]
  campaignMoneyDelta: number | null
  channels: DraftDiffChannelGroup[]
  addedLines: DraftAddedLine[]
  removedLines: DraftRemovedLine[]
}

export type DraftDiffBreakdownRow = {
  key: string
  label: string
  count: number
  moneyDeltaLabel: string | null
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

const FORM_SKIP = new Set(["lineItems"])

type IndexedLine = { row: unknown; channel: string }

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
  if (key === "mp_fixedfee") return "text"
  if (MONEY_KEYS.has(key) || /budget|buyamount|fee/i.test(key)) return "money"
  if (DATE_KEYS.has(key) || /date/i.test(key)) return "date"
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
): Map<string, IndexedLine> {
  const map = new Map<string, IndexedLine>()
  for (const [channel, rows] of Object.entries(channels ?? {})) {
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      const id = getLineItemId(row)
      if (id) map.set(id, { row, channel })
    }
  }
  return map
}

function collectFormPaths(formValues: Record<string, unknown> | undefined): string[] {
  if (!formValues || typeof formValues !== "object") return []
  const paths: string[] = []
  for (const [key, val] of Object.entries(formValues)) {
    if (FORM_SKIP.has(key)) continue
    if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
      continue
    }
    paths.push(key)
  }
  return paths
}

function makeChange(args: {
  lineItemId: string
  fieldPath: string
  oldValue: unknown
  newValue: unknown
  kind: DraftFieldKind
  channel: string
  lineLabel?: string
}): DraftFieldChange {
  return {
    lineItemId: args.lineItemId,
    fieldPath: args.fieldPath,
    oldValue: args.oldValue,
    newValue: args.newValue,
    wasFormatted: formatDraftFieldWas(args.oldValue, args.kind),
    kind: args.kind,
    channel: args.channel,
    lineLabel: args.lineLabel ?? "",
  }
}

function moneyDelta(changes: DraftFieldChange[]): number | null {
  let sum = 0
  let any = false
  for (const c of changes) {
    if (c.kind !== "money") continue
    const oldN = parseMoneyInput(c.oldValue as string | number | null | undefined)
    const newN = parseMoneyInput(c.newValue as string | number | null | undefined)
    if (oldN == null || newN == null) continue
    sum += newN - oldN
    any = true
  }
  return any ? sum : null
}

export function formatDraftMoneyDelta(delta: number | null | undefined): string | null {
  if (delta == null || delta === 0 || !Number.isFinite(delta)) return null
  const whole = Number.isInteger(delta)
  const abs = formatMoney(Math.abs(delta), { decimals: whole ? 0 : 2 })
  return delta > 0 ? `+${abs}` : `-${abs}`
}

function channelSortIndex(channel: string): number {
  const i = (DRAFT_CHANNEL_ORDER as readonly string[]).indexOf(channel)
  return i === -1 ? DRAFT_CHANNEL_ORDER.length : i
}

export function groupDraftDiff(summary: DraftDiffSummary): DraftDiffGrouped {
  const byChannel = new Map<string, Map<string, DraftDiffLineGroup>>()
  for (const change of summary.fieldChanges) {
    const ch = change.channel || "unknown"
    let lines = byChannel.get(ch)
    if (!lines) {
      lines = new Map()
      byChannel.set(ch, lines)
    }
    const id = change.lineItemId
    let line = lines.get(id)
    if (!line) {
      line = { lineItemId: id, label: change.lineLabel || "", changes: [] }
      lines.set(id, line)
    } else if (!line.label && change.lineLabel) {
      line.label = change.lineLabel
    }
    line.changes.push(change)
  }

  const channels: DraftDiffChannelGroup[] = [...byChannel.entries()]
    .sort((a, b) => {
      const di = channelSortIndex(a[0]) - channelSortIndex(b[0])
      return di !== 0 ? di : a[0].localeCompare(b[0])
    })
    .map(([channel, lines]) => {
      const lineList = [...lines.values()].map((line) => ({
        ...line,
        changes: line.changes.toSorted((a, b) => a.fieldPath.localeCompare(b.fieldPath)),
      }))
      lineList.sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
      const allChanges = lineList.flatMap((l) => l.changes)
      return {
        channel,
        channelLabel: draftChannelLabel(channel),
        lines: lineList,
        fieldCount: allChanges.length,
        moneyDelta: moneyDelta(allChanges),
      }
    })

  const campaign = summary.campaignChanges ?? []
  return {
    campaign,
    campaignMoneyDelta: moneyDelta(campaign),
    channels,
    addedLines: summary.addedLines ?? [],
    removedLines: summary.removedLines,
  }
}

export function draftDiffBreakdown(summary: DraftDiffSummary): DraftDiffBreakdownRow[] {
  const grouped = groupDraftDiff(summary)
  const rows: DraftDiffBreakdownRow[] = []
  if (grouped.campaign.length > 0) {
    rows.push({
      key: "campaign",
      label: "Campaign",
      count: grouped.campaign.length,
      moneyDeltaLabel: formatDraftMoneyDelta(grouped.campaignMoneyDelta),
    })
  }
  for (const ch of grouped.channels) {
    rows.push({
      key: ch.channel,
      label: ch.channelLabel,
      count: ch.fieldCount,
      moneyDeltaLabel: formatDraftMoneyDelta(ch.moneyDelta),
    })
  }
  if (grouped.addedLines.length > 0) {
    rows.push({
      key: "added",
      label:
        grouped.addedLines.length === 1
          ? "1 line added"
          : `${grouped.addedLines.length} lines added`,
      count: grouped.addedLines.length,
      moneyDeltaLabel: null,
    })
  }
  if (grouped.removedLines.length > 0) {
    rows.push({
      key: "removed",
      label:
        grouped.removedLines.length === 1
          ? "1 line removed"
          : `${grouped.removedLines.length} lines removed`,
      count: grouped.removedLines.length,
      moneyDeltaLabel: null,
    })
  }
  return rows
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
  const hit = indexLines(base.channels).get(lineItemId)
  if (!hit) return false
  const kind = inferDraftFieldKind(fieldPath)
  return !valuesEqualForDraftDiff(getValueAtPath(hit.row, fieldPath), currentValue, kind)
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
  const campaignChanges: DraftFieldChange[] = []
  const addedLineIds: string[] = []
  const addedLines: DraftAddedLine[] = []
  const removedLines: DraftRemovedLine[] = []

  const formPaths = new Set([
    ...collectFormPaths(base.formValues),
    ...collectFormPaths(current.formValues),
  ])
  for (const fieldPath of formPaths) {
    const kind = inferDraftFieldKind(fieldPath)
    const oldValue = base.formValues?.[fieldPath]
    const newValue = current.formValues?.[fieldPath]
    if (valuesEqualForDraftDiff(oldValue, newValue, kind)) continue
    campaignChanges.push(
      makeChange({
        lineItemId: CAMPAIGN_DRAFT_LINE_ID,
        fieldPath,
        oldValue,
        newValue,
        kind,
        channel: "",
      }),
    )
  }
  campaignChanges.sort((a, b) => a.fieldPath.localeCompare(b.fieldPath))

  for (const [id, cur] of currentLines) {
    if (!baseLines.has(id)) {
      addedLineIds.push(id)
      addedLines.push({
        lineItemId: id,
        label: lineItemLabel(cur.row),
        channel: cur.channel,
      })
      continue
    }
    const baseHit = baseLines.get(id)
    const paths = new Set([
      ...collectFieldPaths(baseHit?.row),
      ...collectFieldPaths(cur.row),
    ])
    const label = lineItemLabel(cur.row) || lineItemLabel(baseHit?.row)
    for (const fieldPath of paths) {
      const kind = inferDraftFieldKind(fieldPath)
      const oldValue = getValueAtPath(baseHit?.row, fieldPath)
      const newValue = getValueAtPath(cur.row, fieldPath)
      if (valuesEqualForDraftDiff(oldValue, newValue, kind)) continue
      fieldChanges.push(
        makeChange({
          lineItemId: id,
          fieldPath,
          oldValue,
          newValue,
          kind,
          channel: cur.channel,
          lineLabel: label,
        }),
      )
    }
  }

  for (const [id, hit] of baseLines) {
    if (currentLines.has(id)) continue
    removedLines.push({
      lineItemId: id,
      label: lineItemLabel(hit.row),
      channel: hit.channel,
    })
  }

  addedLineIds.sort()
  addedLines.sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
  removedLines.sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
  fieldChanges.sort((a, b) =>
    a.lineItemId === b.lineItemId
      ? a.fieldPath.localeCompare(b.fieldPath)
      : a.lineItemId.localeCompare(b.lineItemId),
  )

  return {
    fieldChanges,
    campaignChanges,
    addedLineIds,
    addedLines,
    removedLines,
    changeCount:
      campaignChanges.length +
      fieldChanges.length +
      addedLineIds.length +
      removedLines.length,
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
  const name = line.label.trim() || "Untitled line"
  return `Removed: ${name}`
}

export function addedLineCaption(line: DraftAddedLine): string {
  const name = line.label.trim() || "Untitled line"
  return `Added: ${name}`
}
