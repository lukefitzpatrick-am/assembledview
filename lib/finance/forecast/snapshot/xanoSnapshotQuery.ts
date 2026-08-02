/**
 * Snapshot list/lines — Postgres-authoritative (X5).
 * Legacy Xano helpers kept for author-only data-move scripts.
 */

import { xanoAuthHeaderRecord } from "@/lib/api/xano"
import type {
  FinanceForecastSnapshotLineRecord,
  FinanceForecastSnapshotRecord,
} from "@/lib/types/financeForecastSnapshot"
import {
  fetchFinanceForecastSnapshotLinesFromPostgres,
  fetchFinanceForecastSnapshotListFromPostgres,
  findFinanceForecastSnapshotHeaderFromPostgres,
  isSnapshotStorageConfigured as isPgSnapshotStorageConfigured,
} from "@/lib/finance/forecast/snapshot/pgSnapshots"

export function isSnapshotStorageConfigured(): boolean {
  return isPgSnapshotStorageConfigured()
}

export async function fetchFinanceForecastSnapshotListFromXano(): Promise<
  FinanceForecastSnapshotRecord[]
> {
  // Name retained for route compatibility; reads Postgres.
  return fetchFinanceForecastSnapshotListFromPostgres()
}

export async function fetchFinanceForecastSnapshotLinesFromXano(
  snapshotId: string
): Promise<FinanceForecastSnapshotLineRecord[]> {
  return fetchFinanceForecastSnapshotLinesFromPostgres(snapshotId)
}

export async function findFinanceForecastSnapshotHeader(
  snapshotId: string,
  headers?: FinanceForecastSnapshotRecord[]
): Promise<FinanceForecastSnapshotRecord | null> {
  return findFinanceForecastSnapshotHeaderFromPostgres(snapshotId, headers)
}

// --- Author-only Xano crawl (data-move) ---

const LIST_PATH =
  process.env.XANO_FINANCE_FORECAST_SNAPSHOTS_LIST_PATH ?? "finance_forecast_snapshots_list"
const LINES_PATH =
  process.env.XANO_FINANCE_FORECAST_SNAPSHOTS_LINES_PATH ?? "finance_forecast_snapshot_lines"

function unwrapArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>
    if (Array.isArray(p.data)) return p.data
    if (Array.isArray(p.items)) return p.items
    if (Array.isArray(p.snapshots)) return p.snapshots
    if (Array.isArray(p.lines)) return p.lines
  }
  return []
}

function normalizeLine(
  raw: Record<string, unknown>,
  fallbackSnapshotId: string
): FinanceForecastSnapshotLineRecord {
  const id = raw.id != null ? String(raw.id) : `line-${Math.random().toString(36).slice(2)}`
  const snapshot_id = raw.snapshot_id != null ? String(raw.snapshot_id) : fallbackSnapshotId
  return {
    id,
    snapshot_id,
    client_id: String(raw.client_id ?? ""),
    client_name: String(raw.client_name ?? ""),
    campaign_id: raw.campaign_id != null ? String(raw.campaign_id) : null,
    mba_number: raw.mba_number != null ? String(raw.mba_number) : null,
    media_plan_version_id:
      raw.media_plan_version_id as FinanceForecastSnapshotLineRecord["media_plan_version_id"],
    version_number:
      raw.version_number != null && raw.version_number !== ""
        ? Number(raw.version_number)
        : null,
    group_key: raw.group_key as FinanceForecastSnapshotLineRecord["group_key"],
    line_key: raw.line_key as FinanceForecastSnapshotLineRecord["line_key"],
    month_key: raw.month_key as FinanceForecastSnapshotLineRecord["month_key"],
    amount: Number(raw.amount ?? 0),
    fy_total: Number(raw.fy_total ?? 0),
    source_hash: raw.source_hash != null ? String(raw.source_hash) : null,
    source_debug_json:
      raw.source_debug_json != null && typeof raw.source_debug_json === "string"
        ? raw.source_debug_json
        : raw.source_debug_json != null
          ? JSON.stringify(raw.source_debug_json)
          : null,
  }
}

/** Author-only: crawl Xano snapshot headers when migrating. */
export async function fetchFinanceForecastSnapshotListFromXanoLegacy(): Promise<
  FinanceForecastSnapshotRecord[]
> {
  const base = process.env.XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL?.replace(/\/$/, "")
  if (!base) return []
  const url = `${base}/${LIST_PATH}`
  const res = await fetch(url, {
    method: "GET",
    headers: xanoAuthHeaderRecord(),
    cache: "no-store",
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`Xano snapshot list failed (${res.status}): ${t || res.statusText}`)
  }
  return unwrapArray(await res.json()) as FinanceForecastSnapshotRecord[]
}

/** Author-only: crawl Xano snapshot lines when migrating. */
export async function fetchFinanceForecastSnapshotLinesFromXanoLegacy(
  snapshotId: string
): Promise<FinanceForecastSnapshotLineRecord[]> {
  const base = process.env.XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL?.replace(/\/$/, "")
  if (!base) return []
  const q = new URLSearchParams()
  q.set("snapshot_id", snapshotId)
  const url = `${base}/${LINES_PATH}?${q.toString()}`
  const res = await fetch(url, {
    method: "GET",
    headers: xanoAuthHeaderRecord(),
    cache: "no-store",
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`Xano snapshot lines failed (${res.status}): ${t || res.statusText}`)
  }
  const rows = unwrapArray(await res.json()) as Record<string, unknown>[]
  return rows.map((r) => normalizeLine(r, snapshotId))
}
