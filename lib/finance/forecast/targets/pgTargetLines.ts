/**
 * Read/write `revenue_forecast_lines` in Postgres (Finance Forecast targets).
 * Postgres-authoritative — not truncate-reloaded by db:etl.
 */

import { and, eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import type {
  FinanceForecastTargetLine,
  FinanceForecastTargetUpsertCell,
} from "@/lib/types/financeForecastTargets"
import {
  normalizeTargetLine,
  targetLineNaturalKey,
} from "./targetLineHelpers"

function rowToApi(row: typeof schema.revenueForecastLines.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    client_id: row.clientsId != null ? String(row.clientsId) : "",
    financial_year_start_year:
      row.fy != null ? Number.parseInt(String(row.fy), 10) : NaN,
    line_key: row.lineKey,
    month_key: row.month,
    amount: row.amount != null ? Number(row.amount) : 0,
    updated_at: row.updatedAt ?? null,
    updated_by: row.updatedBy ?? null,
    client_name: null,
  }
}

function parseClientsId(clientId: string): number | null {
  const n = Number.parseInt(String(clientId).trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function fetchRevenueForecastTargetLinesFromPostgres(params: {
  financial_year_start_year: number
  client_id?: string | null
}): Promise<FinanceForecastTargetLine[]> {
  const db = getDb()
  const fy = String(params.financial_year_start_year)
  const clientId = params.client_id?.trim() ? parseClientsId(params.client_id) : null

  const conditions = [eq(schema.revenueForecastLines.fy, fy)]
  if (clientId != null) {
    conditions.push(eq(schema.revenueForecastLines.clientsId, clientId))
  }

  const rows = await db
    .select()
    .from(schema.revenueForecastLines)
    .where(and(...conditions))

  return rows
    .map((r) => normalizeTargetLine(rowToApi(r)))
    .filter((r): r is FinanceForecastTargetLine => r != null)
}

/**
 * Upsert one target cell on natural key
 * `(clients_id, fy, line_key, month)`.
 */
export async function upsertRevenueForecastTargetLine(params: {
  cell: FinanceForecastTargetUpsertCell
  updatedBy?: string | null
  existingLines?: FinanceForecastTargetLine[]
}): Promise<{ line: FinanceForecastTargetLine; previousAmount: number | null }> {
  const { cell, updatedBy = null } = params
  const clientsId = parseClientsId(cell.client_id)
  if (clientsId == null) {
    throw new Error(`Invalid client_id for target upsert: ${cell.client_id}`)
  }

  const fy = String(cell.financial_year_start_year)
  const existing =
    params.existingLines ??
    (await fetchRevenueForecastTargetLinesFromPostgres({
      financial_year_start_year: cell.financial_year_start_year,
      client_id: cell.client_id,
    }))

  const key = targetLineNaturalKey(cell)
  const match = existing.find((row) => targetLineNaturalKey(row) === key)
  const previousAmount = match ? match.amount : null

  const db = getDb()
  const now = new Date().toISOString()

  const inserted = await db
    .insert(schema.revenueForecastLines)
    .values({
      clientsId,
      fy,
      lineKey: cell.line_key,
      month: cell.month_key,
      amount: String(cell.amount),
      updatedBy: updatedBy,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.revenueForecastLines.clientsId,
        schema.revenueForecastLines.fy,
        schema.revenueForecastLines.lineKey,
        schema.revenueForecastLines.month,
      ],
      set: {
        amount: String(cell.amount),
        updatedBy: updatedBy,
        updatedAt: now,
      },
    })
    .returning()

  const row = inserted[0]
  if (!row) {
    // Fallback read if RETURNING unsupported in some drivers
    const again = await fetchRevenueForecastTargetLinesFromPostgres({
      financial_year_start_year: cell.financial_year_start_year,
      client_id: cell.client_id,
    })
    const line = again.find((r) => targetLineNaturalKey(r) === key)
    if (!line) throw new Error("Target upsert succeeded but row not found")
    return { line, previousAmount }
  }

  const line = normalizeTargetLine(rowToApi(row))
  if (!line) throw new Error("Target upsert returned unnormalizable row")
  return { line, previousAmount }
}

/** Batch upsert — one list fetch per distinct (fy, client_id), then per-cell upsert. */
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
      rows = await fetchRevenueForecastTargetLinesFromPostgres({
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

    const cacheKey = `${cell.financial_year_start_year}::${cell.client_id}`
    const cached = cache.get(cacheKey) ?? []
    const idx = cached.findIndex((r) => targetLineNaturalKey(r) === key)
    if (idx >= 0) cached[idx] = line
    else cached.push(line)
    cache.set(cacheKey, cached)
  }

  return { lines, previousByKey }
}

/** Catalog seed helper — upsert FINANCE_FORECAST_LINE_KEYS into revenue_line_catalog. */
export async function seedRevenueLineCatalogFromCodeConstants(
  entries: Array<{
    lineKey: string
    label: string
    sortOrder: number
  }>
): Promise<{ upserted: number; total: number }> {
  const db = getDb()
  for (const e of entries) {
    await db.execute(sql`
      INSERT INTO revenue_line_catalog (line_key, label, sort_order, active)
      VALUES (${e.lineKey}, ${e.label}, ${e.sortOrder}, true)
      ON CONFLICT (line_key) DO UPDATE SET
        label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order,
        active = true
    `)
  }
  return { upserted: entries.length, total: entries.length }
}
