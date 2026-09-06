/**
 * Independent line audit — second reading of the sheet, persisted on the
 * staged review. Never receives publisher profile rules.
 */

import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"
import type {
  IngestProposal,
  ProposedLineItem,
} from "@/lib/mediaplans/ingest/proposeLineItems"
import {
  chunkSheetBySection,
  formatTextGrid,
  type SheetSectionChunk,
} from "@/lib/mediaplans/ingest/sheetTextGrid"

export const LINE_AUDIT_TOOL_NAME = "emit_line_audit"

export const PROFILE_RULE_LEAKS = [
  "column_map",
  "money_rules",
  "legend_map",
  "publisher_profiles",
  "sheet_rules",
  "field_defaults",
] as const

export type LineAuditIdentity = {
  panel: string | null
  name: string | null
  market: string | null
  section: string | null
}

export type LineAuditStatusRun = {
  status: string
  from_col: string
  to_col: string
}

export type LineAuditMoney = {
  cell: string | null
  amount: number | null
  basis_guess: string | null
}

export type LineAuditDateRange = {
  from: string | null
  to: string | null
}

export type LineAuditRow = {
  row: number
  identity: LineAuditIdentity
  status_runs: LineAuditStatusRun[]
  money: LineAuditMoney
  dates_implied: LineAuditDateRange[]
  format_header: string | null
  notes: string[]
}

export type LineAuditResolutionChoice = "parser" | "audit" | "typed"

export type LineAuditResolution = {
  choice: LineAuditResolutionChoice
  typed?: string | null
  by: string
  at: string
}

export type LineAuditDiscrepancyField =
  | "identity"
  | "money"
  | "dates"
  | "format"
  | "buy_type"
  | "invariant"

export type LineAuditDiscrepancy = {
  source_row_ref: string
  row: number
  field: LineAuditDiscrepancyField
  rule?: string | null
  parser: unknown
  audit: unknown
  cells: string[]
}

export type LineAuditStatus = "complete" | "skipped" | "partial" | "failed"

export type LineAudit = {
  model: string
  status: LineAuditStatus
  skip_reason?: string | null
  chunks: number
  rows: LineAuditRow[]
  usage?: {
    input_tokens: number
    output_tokens: number
  } | null
  discrepancies?: LineAuditDiscrepancy[]
  green_count?: number
  resolutions?: Record<string, LineAuditResolution>
}

export type LineAuditChunkRequest = {
  sheet_name: string
  header_band: number[]
  section_row: number
  data_rows: number[]
  grid: string
  proposal_rows: CompactProposalRow[]
}

export type CompactProposalRow = {
  row: number
  source_row_ref: string
  identity: LineAuditIdentity
  money_amount: number
  dates: LineAuditDateRange[]
  format_header: string | null
}

export type LineAuditClient = {
  model: string
  auditChunk: (request: LineAuditChunkRequest) => Promise<LineAuditRow[]>
}

export const LINE_AUDIT_SYSTEM_PROMPT = [
  "You read a publisher media-schedule sheet as a text grid of A1 addresses.",
  "For each buy row, report identity (panel, name, market, section),",
  "status runs with column letters, the money cell (address + amount + basis guess),",
  "implied flight dates, the format header that applies to that row, and notes.",
  "Use the cell addresses you actually read. Do not apply agency mapping rules.",
  "Return rows via the emit_line_audit tool only.",
].join(" ")

export function sourceRowNumber(ref: string | null | undefined): number | null {
  if (!ref) return null
  const m = /!r(\d+)\s*$/i.exec(ref)
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) ? n : null
}

export function sourceRowRefFor(sheetName: string, row: number): string {
  return `${sheetName}!r${row}`
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).replace(/\s+/g, " ").trim()
  return s.length > 0 ? s : null
}

export function identityFromProposedLine(item: ProposedLineItem): LineAuditIdentity {
  const g = item.grouping
  const d = item.panels[0]?.descriptors ?? {}
  return {
    panel: strOrNull(g.site_number) ?? strOrNull(d.site_number),
    name: strOrNull(g.panel_name) ?? strOrNull(d.panel_name),
    market: strOrNull(g.market) ?? strOrNull(d.market),
    section:
      strOrNull(g.publisher_format_name) ??
      strOrNull(g.format) ??
      strOrNull(d.publisher_format_name) ??
      strOrNull(d.format),
  }
}

export function moneyAmountFromProposedLine(item: ProposedLineItem): number {
  const burstSum = item.bursts.reduce((s, b) => s + (b.media_amount ?? 0), 0)
  if (Number.isFinite(burstSum) && burstSum !== 0) {
    return Math.round(burstSum * 100) / 100
  }
  if (item.bought_rate != null && Number.isFinite(item.bought_rate)) {
    return Math.round(item.bought_rate * 100) / 100
  }
  return Math.round(burstSum * 100) / 100
}

export function datesFromProposedLine(item: ProposedLineItem): LineAuditDateRange[] {
  const seen = new Set<string>()
  const out: LineAuditDateRange[] = []
  for (const b of item.bursts) {
    const from = strOrNull(b.start_date)
    const to = strOrNull(b.end_date)
    const key = `${from ?? ""}|${to ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ from, to })
  }
  if (out.length === 0) {
    for (const f of item.panels[0]?.flights ?? []) {
      const from = strOrNull(f.period_start)
      const to = strOrNull(f.period_end)
      const key = `${from ?? ""}|${to ?? ""}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ from, to })
    }
  }
  return out
}

export function formatHeaderFromProposedLine(item: ProposedLineItem): string | null {
  return identityFromProposedLine(item).section
}

export function compactProposalRow(item: ProposedLineItem): CompactProposalRow | null {
  const ref = item.panels[0]?.source_row_ref ?? null
  const row = sourceRowNumber(ref)
  if (row == null || !ref) return null
  return {
    row,
    source_row_ref: ref,
    identity: identityFromProposedLine(item),
    money_amount: moneyAmountFromProposedLine(item),
    dates: datesFromProposedLine(item),
    format_header: formatHeaderFromProposedLine(item),
  }
}

export function compactProposalRowsForChunk(
  proposal: IngestProposal,
  dataRows: number[],
): CompactProposalRow[] {
  const want = new Set(dataRows)
  const out: CompactProposalRow[] = []
  for (const item of proposal.line_items) {
    const compact = compactProposalRow(item)
    if (!compact || !want.has(compact.row)) continue
    out.push(compact)
  }
  return out
}

export function buildLineAuditChunkRequest(args: {
  shape: DetectedSheetShape
  proposal: IngestProposal
  chunk: SheetSectionChunk
}): LineAuditChunkRequest {
  return {
    sheet_name: args.shape.sheet_name,
    header_band: args.chunk.header_band,
    section_row: args.chunk.section_row,
    data_rows: args.chunk.data_rows,
    grid: formatTextGrid(args.chunk.cells),
    proposal_rows: compactProposalRowsForChunk(
      args.proposal,
      args.chunk.data_rows,
    ),
  }
}

export function assertNoProfileRules(text: string): void {
  const lower = text.toLowerCase()
  for (const leak of PROFILE_RULE_LEAKS) {
    if (lower.includes(leak)) {
      throw new Error(`line audit prompt leaked profile rule token: ${leak}`)
    }
  }
}

export function serializeChunkForModel(request: LineAuditChunkRequest): string {
  const body = JSON.stringify({
    sheet_name: request.sheet_name,
    header_band: request.header_band,
    section_row: request.section_row,
    data_rows: request.data_rows,
    grid: request.grid,
    proposal_rows: request.proposal_rows,
  })
  assertNoProfileRules(body)
  assertNoProfileRules(LINE_AUDIT_SYSTEM_PROMPT)
  return body
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[$,]/g, ""))
    if (Number.isFinite(n)) return n
  }
  return null
}

function parseIdentity(raw: unknown): LineAuditIdentity {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  return {
    panel: strOrNull(o.panel),
    name: strOrNull(o.name),
    market: strOrNull(o.market),
    section: strOrNull(o.section),
  }
}

function parseStatusRuns(raw: unknown): LineAuditStatusRun[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const o = item as Record<string, unknown>
    const status = strOrNull(o.status)
    const from_col = strOrNull(o.from_col)
    const to_col = strOrNull(o.to_col)
    if (!status || !from_col || !to_col) return []
    return [{ status, from_col, to_col }]
  })
}

function parseMoney(raw: unknown): LineAuditMoney {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  return {
    cell: strOrNull(o.cell),
    amount: asFiniteNumber(o.amount),
    basis_guess: strOrNull(o.basis_guess),
  }
}

function parseDates(raw: unknown): LineAuditDateRange[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const o = item as Record<string, unknown>
    return [
      {
        from: strOrNull(o.from),
        to: strOrNull(o.to),
      },
    ]
  })
}

function parseNotes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((n) => {
    const s = strOrNull(n)
    return s ? [s] : []
  })
}

export function parseLineAuditRows(raw: unknown): LineAuditRow[] {
  const list = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === "object" &&
        Array.isArray((raw as { rows?: unknown }).rows)
      ? (raw as { rows: unknown[] }).rows
      : []
  const out: LineAuditRow[] = []
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    const row = asFiniteNumber(o.row)
    if (row == null || !Number.isInteger(row)) continue
    out.push({
      row,
      identity: parseIdentity(o.identity),
      status_runs: parseStatusRuns(o.status_runs),
      money: parseMoney(o.money),
      dates_implied: parseDates(o.dates_implied),
      format_header: strOrNull(o.format_header),
      notes: parseNotes(o.notes),
    })
  }
  return out
}

/** Build an audit row that agrees with the parser (tests / mock client). */
export function auditRowFromProposedLine(item: ProposedLineItem): LineAuditRow | null {
  const compact = compactProposalRow(item)
  if (!compact) return null
  return {
    row: compact.row,
    identity: compact.identity,
    status_runs: [],
    money: {
      cell: null,
      amount: compact.money_amount,
      basis_guess: "proposal",
    },
    dates_implied: compact.dates,
    format_header: compact.format_header,
    notes: [],
  }
}

export function auditRowsFromProposal(proposal: IngestProposal): LineAuditRow[] {
  return proposal.line_items.flatMap((item) => {
    const row = auditRowFromProposedLine(item)
    return row ? [row] : []
  })
}

const AUDIT_CONCURRENCY = 3

async function mapPool<T, R>(
  items: T[],
  n: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return out
}

export async function runLineAudit(args: {
  shape: DetectedSheetShape
  proposal: IngestProposal
  client: LineAuditClient
}): Promise<LineAudit> {
  const chunks = chunkSheetBySection(args.shape)
  const requests = chunks.map((chunk) =>
    buildLineAuditChunkRequest({
      shape: args.shape,
      proposal: args.proposal,
      chunk,
    }),
  )
  const parts = await mapPool(requests, AUDIT_CONCURRENCY, (req) =>
    args.client.auditChunk(req),
  )
  const byRow = new Map<number, LineAuditRow>()
  for (const rows of parts) {
    for (const row of rows) byRow.set(row.row, row)
  }
  return {
    model: args.client.model,
    status: "complete",
    chunks: chunks.length,
    rows: [...byRow.values()].sort((a, b) => a.row - b.row),
  }
}

export function skippedLineAudit(reason: string): LineAudit {
  return {
    model: "none",
    status: "skipped",
    skip_reason: reason,
    chunks: 0,
    rows: [],
  }
}
