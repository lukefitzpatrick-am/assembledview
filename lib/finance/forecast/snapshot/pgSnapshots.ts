/**
 * Postgres-authoritative Finance Forecast snapshots (X5).
 * Immutable INSERT-only; XANO_FINANCE_FORECAST_SNAPSHOTS_* no longer required.
 */
import "server-only"

import { asc, desc, eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { toApiRow } from "@/lib/data/toApiRow"
import type {
  FinanceForecastSnapshotLineRecord,
  FinanceForecastSnapshotRecord,
  FinanceForecastSnapshotStagingPayload,
} from "@/lib/types/financeForecastSnapshot"

export function isSnapshotStorageConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

function mapHeader(row: Record<string, unknown>): FinanceForecastSnapshotRecord {
  const api = toApiRow(row)
  return {
    id: String(api.id ?? ""),
    snapshot_label: String(api.snapshot_label ?? ""),
    snapshot_type: String(api.snapshot_type ?? ""),
    financial_year: Number(api.financial_year),
    scenario: api.scenario as FinanceForecastSnapshotRecord["scenario"],
    taken_at: String(api.taken_at ?? ""),
    taken_by: api.taken_by != null ? String(api.taken_by) : null,
    notes: api.notes != null ? String(api.notes) : null,
    source_version_summary:
      api.source_version_summary != null ? String(api.source_version_summary) : null,
    filter_context_json:
      api.filter_context_json != null ? String(api.filter_context_json) : null,
    created_at: api.created_at != null ? String(api.created_at) : undefined,
  }
}

function mapLine(
  row: Record<string, unknown>,
  fallbackSnapshotId: string
): FinanceForecastSnapshotLineRecord {
  const api = toApiRow(row)
  return {
    id: String(api.id ?? ""),
    snapshot_id:
      api.snapshot_id != null ? String(api.snapshot_id) : fallbackSnapshotId,
    client_id: String(api.client_id ?? ""),
    client_name: String(api.client_name ?? ""),
    campaign_id: api.campaign_id != null ? String(api.campaign_id) : null,
    mba_number: api.mba_number != null ? String(api.mba_number) : null,
    media_plan_version_id:
      api.media_plan_version_id != null ? String(api.media_plan_version_id) : null,
    version_number:
      api.version_number != null && api.version_number !== ""
        ? Number(api.version_number)
        : null,
    group_key: api.group_key as FinanceForecastSnapshotLineRecord["group_key"],
    line_key: api.line_key as FinanceForecastSnapshotLineRecord["line_key"],
    month_key: api.month_key as FinanceForecastSnapshotLineRecord["month_key"],
    amount: Number(api.amount ?? 0),
    fy_total: Number(api.fy_total ?? 0),
    source_hash: api.source_hash != null ? String(api.source_hash) : null,
    source_debug_json:
      api.source_debug_json != null ? String(api.source_debug_json) : null,
  }
}

export async function fetchFinanceForecastSnapshotListFromPostgres(): Promise<
  FinanceForecastSnapshotRecord[]
> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.financeForecastSnapshots)
    .orderBy(desc(schema.financeForecastSnapshots.takenAt))
  return rows.map((row) => mapHeader(row as Record<string, unknown>))
}

export async function fetchFinanceForecastSnapshotLinesFromPostgres(
  snapshotId: string
): Promise<FinanceForecastSnapshotLineRecord[]> {
  const numericId = Number(snapshotId)
  if (!Number.isFinite(numericId) || numericId <= 0) return []
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.financeForecastSnapshotLines)
    .where(eq(schema.financeForecastSnapshotLines.snapshotId, numericId))
    .orderBy(asc(schema.financeForecastSnapshotLines.id))
  return rows.map((row) => mapLine(row as Record<string, unknown>, snapshotId))
}

export async function findFinanceForecastSnapshotHeaderFromPostgres(
  snapshotId: string,
  headers?: FinanceForecastSnapshotRecord[]
): Promise<FinanceForecastSnapshotRecord | null> {
  const list = headers ?? (await fetchFinanceForecastSnapshotListFromPostgres())
  return list.find((h) => String(h.id) === String(snapshotId)) ?? null
}

export async function persistFinanceForecastSnapshotToPostgres(
  payload: FinanceForecastSnapshotStagingPayload
): Promise<{ snapshot_id: string }> {
  const db = getDb()
  const header = payload.header

  const [inserted] = await db
    .insert(schema.financeForecastSnapshots)
    .values({
      snapshotLabel: header.snapshot_label,
      snapshotType: String(header.snapshot_type),
      financialYear: header.financial_year,
      scenario: header.scenario,
      takenAt: header.taken_at,
      takenBy: header.taken_by,
      notes: header.notes,
      sourceVersionSummary: header.source_version_summary,
      filterContextJson: header.filter_context_json ?? null,
    })
    .returning()

  if (!inserted?.id) {
    throw new Error("Postgres finance_forecast_snapshots insert returned no id")
  }

  const snapshotId = Number(inserted.id)
  if (payload.lines.length > 0) {
    // Chunk large line sets to stay under parameter limits.
    const CHUNK = 200
    for (let i = 0; i < payload.lines.length; i += CHUNK) {
      const slice = payload.lines.slice(i, i + CHUNK)
      await db.insert(schema.financeForecastSnapshotLines).values(
        slice.map((line) => ({
          snapshotId,
          clientId: line.client_id,
          clientName: line.client_name,
          campaignId: line.campaign_id,
          mbaNumber: line.mba_number,
          mediaPlanVersionId:
            line.media_plan_version_id != null
              ? String(line.media_plan_version_id)
              : null,
          versionNumber: line.version_number,
          groupKey: line.group_key,
          lineKey: line.line_key,
          monthKey: line.month_key,
          amount: String(line.amount),
          fyTotal: String(line.fy_total),
          sourceHash: line.source_hash,
          sourceDebugJson: line.source_debug_json,
        }))
      )
    }
  }

  return { snapshot_id: String(snapshotId) }
}

/** Author-only: count rows after apply / data-move. */
export async function countFinanceForecastSnapshotRows(): Promise<{
  headers: number
  lines: number
}> {
  const db = getDb()
  const headerRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.financeForecastSnapshots)
  const lineRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.financeForecastSnapshotLines)
  return {
    headers: Number(headerRows[0]?.n ?? 0),
    lines: Number(lineRows[0]?.n ?? 0),
  }
}
