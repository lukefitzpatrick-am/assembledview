/**
 * Read/write `revenue_forecast_lines` in Xano (mutable Finance Forecast targets).
 *
 * Configure `XANO_FINANCE_FORECAST_TARGETS_BASE_URL` (preferred) or fall back to
 * `XANO_CLIENTS_BASE_URL`. Path override: `XANO_FINANCE_FORECAST_TARGETS_PATH`.
 */

import { xanoAuthHeaderRecord, xanoPostHeaderRecord } from "@/lib/api/xano"
import {
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_LINE_KEYS,
  type FinanceForecastLineKey,
  type FinanceForecastMonthKey,
} from "@/lib/types/financeForecast"
import type {
  FinanceForecastTargetLine,
  FinanceForecastTargetUpsertCell,
} from "@/lib/types/financeForecastTargets"

const DEFAULT_PATH = "revenue_forecast_lines"

const LINE_KEY_SET = new Set<string>(Object.values(FINANCE_FORECAST_LINE_KEYS))
const MONTH_KEY_SET = new Set<string>(FINANCE_FORECAST_FISCAL_MONTH_ORDER)

function targetsBaseUrl(): string | null {
  const dedicated = process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL?.trim()
  if (dedicated) return dedicated.replace(/\/$/, "")
  const clients = process.env.XANO_CLIENTS_BASE_URL?.trim()
  if (clients) return clients.replace(/\/$/, "")
  return null
}

function targetsPath(): string {
  return (
    process.env.XANO_FINANCE_FORECAST_TARGETS_PATH?.trim().replace(/^\//, "") ||
    DEFAULT_PATH
  )
}

export function isTargetStorageConfigured(): boolean {
  return Boolean(targetsBaseUrl())
}

function unwrapArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>
    if (Array.isArray(p.data)) return p.data
    if (Array.isArray(p.items)) return p.items
    if (Array.isArray(p.lines)) return p.lines
    if (Array.isArray(p.result)) return p.result
  }
  return []
}

export function isFinanceForecastLineKey(v: unknown): v is FinanceForecastLineKey {
  return typeof v === "string" && LINE_KEY_SET.has(v)
}

export function isFinanceForecastMonthKey(v: unknown): v is FinanceForecastMonthKey {
  return typeof v === "string" && MONTH_KEY_SET.has(v)
}

export function targetLineNaturalKey(line: {
  client_id: string
  financial_year_start_year: number
  line_key: string
  month_key: string
}): string {
  return `${line.client_id}::${line.financial_year_start_year}::${line.line_key}::${line.month_key}`
}

export function normalizeTargetLine(raw: Record<string, unknown>): FinanceForecastTargetLine | null {
  const client_id = raw.client_id != null ? String(raw.client_id) : ""
  const fyRaw = raw.financial_year_start_year ?? raw.financial_year ?? raw.fy
  const financial_year_start_year =
    typeof fyRaw === "number" ? fyRaw : typeof fyRaw === "string" ? Number.parseInt(fyRaw, 10) : NaN
  const line_key = raw.line_key
  const month_key = raw.month_key
  const amount = Number(raw.amount ?? 0)

  if (!client_id || !Number.isFinite(financial_year_start_year)) return null
  if (!isFinanceForecastLineKey(line_key) || !isFinanceForecastMonthKey(month_key)) return null
  if (!Number.isFinite(amount)) return null

  return {
    id: raw.id != null ? String(raw.id) : targetLineNaturalKey({
      client_id,
      financial_year_start_year,
      line_key,
      month_key,
    }),
    client_id,
    client_name:
      raw.client_name == null
        ? null
        : typeof raw.client_name === "string"
          ? raw.client_name
          : String(raw.client_name),
    financial_year_start_year,
    line_key,
    month_key,
    amount,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    updated_by: raw.updated_by != null ? String(raw.updated_by) : null,
  }
}

export async function fetchRevenueForecastTargetLinesFromXano(params: {
  financial_year_start_year: number
  client_id?: string | null
}): Promise<FinanceForecastTargetLine[]> {
  const base = targetsBaseUrl()
  if (!base) return []

  const q = new URLSearchParams()
  q.set("financial_year_start_year", String(params.financial_year_start_year))
  if (params.client_id?.trim()) q.set("client_id", params.client_id.trim())

  const url = `${base}/${targetsPath()}?${q.toString()}`
  const res = await fetch(url, {
    method: "GET",
    headers: xanoAuthHeaderRecord(),
    cache: "no-store",
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`Xano target list failed (${res.status}): ${t || res.statusText}`)
  }
  const json = (await res.json()) as unknown
  const rows = unwrapArray(json) as Record<string, unknown>[]
  return rows
    .map((r) => normalizeTargetLine(r))
    .filter((r): r is FinanceForecastTargetLine => r != null)
}

async function postTargetLine(
  cell: FinanceForecastTargetUpsertCell,
  updatedBy: string | null
): Promise<FinanceForecastTargetLine> {
  const base = targetsBaseUrl()
  if (!base) throw new Error("Target storage is not configured")

  const body = {
    client_id: cell.client_id,
    financial_year_start_year: cell.financial_year_start_year,
    line_key: cell.line_key,
    month_key: cell.month_key,
    amount: cell.amount,
    ...(cell.client_name != null ? { client_name: cell.client_name } : {}),
    ...(updatedBy ? { updated_by: updatedBy } : {}),
  }

  const res = await fetch(`${base}/${targetsPath()}`, {
    method: "POST",
    headers: xanoPostHeaderRecord(),
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`Xano target create failed (${res.status}): ${t || res.statusText}`)
  }
  const raw = (await res.json()) as Record<string, unknown>
  const normalized = normalizeTargetLine(raw)
  if (!normalized) {
    return {
      id: raw.id != null ? String(raw.id) : targetLineNaturalKey(cell),
      client_id: cell.client_id,
      client_name: cell.client_name ?? null,
      financial_year_start_year: cell.financial_year_start_year,
      line_key: cell.line_key,
      month_key: cell.month_key,
      amount: cell.amount,
      updated_by: updatedBy,
    }
  }
  return normalized
}

async function patchTargetLine(
  id: string,
  cell: FinanceForecastTargetUpsertCell,
  updatedBy: string | null
): Promise<FinanceForecastTargetLine> {
  const base = targetsBaseUrl()
  if (!base) throw new Error("Target storage is not configured")

  const body = {
    amount: cell.amount,
    ...(cell.client_name != null ? { client_name: cell.client_name } : {}),
    ...(updatedBy ? { updated_by: updatedBy } : {}),
  }

  const res = await fetch(`${base}/${targetsPath()}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: xanoPostHeaderRecord(),
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`Xano target update failed (${res.status}): ${t || res.statusText}`)
  }
  let raw: Record<string, unknown> = {}
  try {
    raw = (await res.json()) as Record<string, unknown>
  } catch {
    raw = {}
  }
  const normalized = normalizeTargetLine({ ...raw, id, ...cell, amount: cell.amount })
  if (normalized) return normalized
  return {
    id,
    client_id: cell.client_id,
    client_name: cell.client_name ?? null,
    financial_year_start_year: cell.financial_year_start_year,
    line_key: cell.line_key,
    month_key: cell.month_key,
    amount: cell.amount,
    updated_by: updatedBy,
  }
}

/**
 * Upsert one target cell on natural key
 * `(client_id, financial_year_start_year, line_key, month_key)`.
 * Returns `{ line, previousAmount }` for audit.
 */
export async function upsertRevenueForecastTargetLine(params: {
  cell: FinanceForecastTargetUpsertCell
  updatedBy?: string | null
  /** Optional preloaded FY (+client) rows to avoid an extra list round-trip. */
  existingLines?: FinanceForecastTargetLine[]
}): Promise<{ line: FinanceForecastTargetLine; previousAmount: number | null }> {
  const { cell, updatedBy = null } = params
  const existing =
    params.existingLines ??
    (await fetchRevenueForecastTargetLinesFromXano({
      financial_year_start_year: cell.financial_year_start_year,
      client_id: cell.client_id,
    }))

  const key = targetLineNaturalKey(cell)
  const match = existing.find((row) => targetLineNaturalKey(row) === key)

  if (match) {
    const line = await patchTargetLine(match.id, cell, updatedBy)
    return { line, previousAmount: match.amount }
  }

  const line = await postTargetLine(cell, updatedBy)
  return { line, previousAmount: null }
}

/** Batch upsert — one list fetch per distinct (fy, client_id), then per-cell POST/PATCH. */
export async function upsertRevenueForecastTargetLinesBatch(params: {
  cells: FinanceForecastTargetUpsertCell[]
  updatedBy?: string | null
}): Promise<{
  lines: FinanceForecastTargetLine[]
  previousByKey: Map<string, number | null>
}> {
  const { cells, updatedBy = null } = params
  if (cells.length === 0) {
    return { lines: [], previousByKey: new Map() }
  }

  const cache = new Map<string, FinanceForecastTargetLine[]>()
  async function linesFor(cell: FinanceForecastTargetUpsertCell) {
    const cacheKey = `${cell.financial_year_start_year}::${cell.client_id}`
    let rows = cache.get(cacheKey)
    if (!rows) {
      rows = await fetchRevenueForecastTargetLinesFromXano({
        financial_year_start_year: cell.financial_year_start_year,
        client_id: cell.client_id,
      })
      cache.set(cacheKey, rows)
    }
    return rows
  }

  const lines: FinanceForecastTargetLine[] = []
  const previousByKey = new Map<string, number | null>()

  for (const cell of cells) {
    const existing = await linesFor(cell)
    const { line, previousAmount } = await upsertRevenueForecastTargetLine({
      cell,
      updatedBy,
      existingLines: existing,
    })
    const key = targetLineNaturalKey(cell)
    previousByKey.set(key, previousAmount)
    lines.push(line)

    // Keep cache fresh for subsequent cells in the same FY/client.
    const cacheKey = `${cell.financial_year_start_year}::${cell.client_id}`
    const cached = cache.get(cacheKey) ?? []
    const idx = cached.findIndex((r) => targetLineNaturalKey(r) === key)
    if (idx >= 0) cached[idx] = line
    else cached.push(line)
    cache.set(cacheKey, cached)
  }

  return { lines, previousByKey }
}
