/**
 * Legacy Xano read/write for `revenue_forecast_lines`.
 * App routes use `pgTargetLines.ts` (Postgres-authoritative).
 * Kept for optional one-off migration (`npm run db:migrate-forecast-targets`).
 */

import { xanoAuthHeaderRecord, xanoPostHeaderRecord } from "@/lib/api/xano"
import type {
  FinanceForecastTargetLine,
  FinanceForecastTargetUpsertCell,
} from "@/lib/types/financeForecastTargets"
import {
  isFinanceForecastLineKey,
  isFinanceForecastMonthKey,
  normalizeTargetLine,
  targetLineNaturalKey,
} from "./targetLineHelpers"

export {
  isFinanceForecastLineKey,
  isFinanceForecastMonthKey,
  isTargetStorageConfigured,
  normalizeTargetLine,
  targetLineNaturalKey,
} from "./targetLineHelpers"

const DEFAULT_PATH = "revenue_forecast_lines"

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

export function isXanoTargetStorageConfigured(): boolean {
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
  if (!base) throw new Error("Xano target storage is not configured")

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
  if (!base) throw new Error("Xano target storage is not configured")

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

/** @deprecated App writes go through pgTargetLines — kept for migration tooling. */
export async function upsertRevenueForecastTargetLineOnXano(params: {
  cell: FinanceForecastTargetUpsertCell
  updatedBy?: string | null
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

// Silence unused-export lint on validators re-used by migration scripts.
void isFinanceForecastLineKey
void isFinanceForecastMonthKey
