import type { FinanceForecastDataset } from "@/lib/types/financeForecast"
import type {
  FinanceForecastSnapshotInsert,
  FinanceForecastSnapshotLineInsert,
  FinanceForecastSnapshotStagingPayload,
} from "@/lib/types/financeForecastSnapshot"
import { FINANCE_FORECAST_FISCAL_MONTH_ORDER } from "@/lib/types/financeForecast"

import { hashFinanceForecastLineForSnapshot } from "./serializeForSnapshotHash"

export type SnapshotApiMetaLike = {
  raw_version_count?: number
  filtered_version_count?: number
  client_scope?: string
  include_row_debug?: boolean
}

export type SnapshotSourceAuditFields = {
  calculation_started_at?: string
  calculation_completed_at?: string
  dataset_hash?: string
}

export type BuildSnapshotPayloadParams = {
  snapshot_label: string
  snapshot_type: FinanceForecastSnapshotInsert["snapshot_type"]
  dataset: FinanceForecastDataset
  taken_by: string | null
  taken_at?: Date
  notes?: string | null
  /** From forecast API `meta` — stored in `source_version_summary`. */
  api_meta?: SnapshotApiMetaLike | null
  /** Calc timing + dataset fingerprint — merged into `source_version_summary`. */
  source_audit?: SnapshotSourceAuditFields | null
  /** UI filters — stored in `filter_context_json`. */
  filter_context?: Record<string, unknown> | null
}

export function buildSourceVersionSummaryJson(
  meta: SnapshotApiMetaLike | null | undefined,
  audit?: SnapshotSourceAuditFields | null
): string | null {
  try {
    const obj: Record<string, unknown> = {
      raw_version_count: meta?.raw_version_count ?? null,
      filtered_version_count: meta?.filtered_version_count ?? null,
      client_scope: meta?.client_scope ?? null,
      include_row_debug: meta?.include_row_debug ?? null,
      calculation_started_at: audit?.calculation_started_at ?? null,
      calculation_completed_at: audit?.calculation_completed_at ?? null,
      dataset_hash: audit?.dataset_hash ?? null,
    }
    if (Object.values(obj).every((v) => v === null || v === undefined)) return null
    return JSON.stringify(obj)
  } catch {
    return null
  }
}

export function buildSnapshotHeader(params: BuildSnapshotPayloadParams): FinanceForecastSnapshotInsert {
  const takenAt = (params.taken_at ?? new Date()).toISOString()
  const fy = params.dataset.meta.financial_year_start_year
  const scenario = params.dataset.meta.scenario

  return {
    snapshot_label: params.snapshot_label.trim(),
    snapshot_type: params.snapshot_type,
    financial_year: fy,
    scenario,
    taken_at: takenAt,
    taken_by: params.taken_by,
    notes: params.notes?.trim() ? params.notes.trim() : null,
    source_version_summary: buildSourceVersionSummaryJson(params.api_meta ?? null, params.source_audit ?? null),
    filter_context_json: params.filter_context ? JSON.stringify(params.filter_context) : null,
  }
}

/**
 * Normalise live forecast lines to immutable snapshot line rows (12 rows per logical line).
 * Omit `snapshot_id` — Xano assigns header id first, then lines reference it.
 */
export function buildSnapshotLinesFromDataset(
  dataset: FinanceForecastDataset,
  options?: { include_debug_json?: boolean }
): Array<Omit<FinanceForecastSnapshotLineInsert, "snapshot_id">> {
  const includeDebug = options?.include_debug_json ?? true
  const out: Array<Omit<FinanceForecastSnapshotLineInsert, "snapshot_id">> = []

  for (const block of dataset.client_blocks) {
    for (const group of block.groups) {
      for (const line of group.lines) {
        const lineHash = hashFinanceForecastLineForSnapshot(line)
        const debugJson =
          includeDebug && line.debug != null ? JSON.stringify(line.debug) : null

        for (const month_key of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
          const amount = line.monthly[month_key] ?? 0
          out.push({
            client_id: String(block.client_id),
            client_name: block.client_name,
            campaign_id: line.campaign_id != null ? String(line.campaign_id) : null,
            mba_number: line.mba_number ?? null,
            media_plan_version_id: line.media_plan_version_id,
            version_number: line.version_number,
            group_key: line.group_key,
            line_key: line.line_key,
            month_key,
            amount,
            fy_total: line.fy_total,
            source_hash: lineHash,
            source_debug_json: debugJson,
          })
        }
      }
    }
  }

  return out
}

export function buildSnapshotStagingPayload(params: BuildSnapshotPayloadParams): FinanceForecastSnapshotStagingPayload {
  const header = buildSnapshotHeader(params)
  const lines = buildSnapshotLinesFromDataset(params.dataset, {
    include_debug_json: params.api_meta?.include_row_debug === true,
  })
  return { header, lines }
}
