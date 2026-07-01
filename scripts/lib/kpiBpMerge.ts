import {
  BID_STRATEGY_OPTIONS_BY_MEDIA_TYPE,
  CLIENT_KPI_METRIC_FIELDS,
  MEDIA_TYPE_OPTIONS,
  type PublisherKpi,
  type PublisherKpiInput,
} from "@/lib/kpi/types"
import {
  isEmptyBestPractice,
  normalizeBestPractice,
  type BestPractice,
} from "@/lib/types/bestPractice"

export type KpiMetricField = (typeof CLIENT_KPI_METRIC_FIELDS)[number]

export type KpiImportRow = {
  publisher: string
  media_type: string
  bid_strategy: string
  metrics: Partial<Record<KpiMetricField, number>>
}

export type ContainerBpImportRow = {
  media_container: string
  best_practice: BestPractice
  is_active: boolean
}

export type PublisherBpImportRow = {
  id: number
  best_practice: BestPractice
}

export type KpiMergeAction = "create" | "patch" | "skip" | "error"

export type KpiMergeResult = {
  action: KpiMergeAction
  key: string
  patch?: Partial<Record<KpiMetricField, number>>
  createBody?: PublisherKpiInput
  existingId?: number
  error?: string
  patchedFields?: KpiMetricField[]
}

const VALID_MEDIA_TYPES = new Set(MEDIA_TYPE_OPTIONS.map((o) => o.value))

export function isMetricEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true
  const n = typeof value === "number" ? value : Number(String(value).trim())
  return !Number.isFinite(n) || n === 0
}

export function parseMetricCell(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const n = parseFloat(trimmed)
  return Number.isFinite(n) ? n : null
}

export function kpiRowKey(publisher: string, media_type: string, bid_strategy: string): string {
  return `${publisher.trim()}\0${media_type.trim()}\0${bid_strategy.trim()}`
}

export function validateKpiImportRow(row: KpiImportRow): string | null {
  if (!row.publisher.trim()) return "missing publisher"
  if (!VALID_MEDIA_TYPES.has(row.media_type)) {
    return `unknown media_type: ${row.media_type}`
  }
  const strategies = BID_STRATEGY_OPTIONS_BY_MEDIA_TYPE[row.media_type] ?? []
  const validBid = strategies.some((s) => s.value === row.bid_strategy)
  if (!validBid) {
    return `unknown bid_strategy ${row.bid_strategy} for media_type ${row.media_type}`
  }
  return null
}

export function importRowToCreateBody(row: KpiImportRow): PublisherKpiInput {
  const body: PublisherKpiInput = {
    publisher: row.publisher.trim(),
    media_type: row.media_type.trim(),
    bid_strategy: row.bid_strategy.trim(),
    ctr: 0,
    cpv: 0,
    conversion_rate: 0,
    vtr: 0,
    frequency: 0,
  }
  for (const field of CLIENT_KPI_METRIC_FIELDS) {
    const v = row.metrics[field]
    if (v !== undefined && v !== null) body[field] = v
  }
  return body
}

export function mergeKpiRow(
  existing: PublisherKpi | undefined,
  importRow: KpiImportRow,
): KpiMergeResult {
  const key = kpiRowKey(importRow.publisher, importRow.media_type, importRow.bid_strategy)
  const validationError = validateKpiImportRow(importRow)
  if (validationError) {
    return { action: "error", key, error: validationError }
  }

  if (!existing) {
    return {
      action: "create",
      key,
      createBody: importRowToCreateBody(importRow),
    }
  }

  const patch: Partial<Record<KpiMetricField, number>> = {}
  const patchedFields: KpiMetricField[] = []

  for (const field of CLIENT_KPI_METRIC_FIELDS) {
    const importVal = importRow.metrics[field]
    if (importVal === undefined || importVal === null) continue
    if (!isMetricEmpty(existing[field])) continue
    patch[field] = importVal
    patchedFields.push(field)
  }

  if (patchedFields.length === 0) {
    return { action: "skip", key, existingId: existing.id }
  }

  return {
    action: "patch",
    key,
    patch,
    existingId: existing.id,
    patchedFields,
  }
}

export type ContainerBpMergeAction = "create" | "update" | "skip" | "error"

export type ContainerBpMergeResult = {
  action: ContainerBpMergeAction
  media_container: string
  existingId?: number
  body?: { best_practice: BestPractice; is_active: boolean }
  error?: string
}

export function mergeContainerBpRow(
  existing:
    | { id: number; media_container: string; best_practice: unknown; is_active?: boolean }
    | undefined,
  importRow: ContainerBpImportRow,
): ContainerBpMergeResult {
  const slug = importRow.media_container.trim()
  if (!slug) return { action: "error", media_container: slug, error: "missing media_container" }
  if (!importRow.best_practice || isEmptyBestPractice(importRow.best_practice)) {
    return { action: "error", media_container: slug, error: "import best_practice is empty" }
  }

  if (!existing) {
    return {
      action: "create",
      media_container: slug,
      body: {
        best_practice: importRow.best_practice,
        is_active: importRow.is_active,
      },
    }
  }

  const existingBp = normalizeBestPractice(existing.best_practice)
  if (!isEmptyBestPractice(existingBp)) {
    return { action: "skip", media_container: slug, existingId: existing.id }
  }

  return {
    action: "update",
    media_container: slug,
    existingId: existing.id,
    body: {
      best_practice: importRow.best_practice,
      is_active: importRow.is_active || existing.is_active === true,
    },
  }
}

export type PublisherBpMergeAction = "update" | "skip" | "error"

export type PublisherBpMergeResult = {
  action: PublisherBpMergeAction
  id: number
  error?: string
  best_practice?: BestPractice
}

export function mergePublisherBpRow(
  existing: { id: number; best_practice?: unknown } | undefined,
  importRow: PublisherBpImportRow,
): PublisherBpMergeResult {
  if (!existing) {
    return { action: "error", id: importRow.id, error: `publisher id ${importRow.id} not found in Xano` }
  }
  if (!importRow.best_practice || isEmptyBestPractice(importRow.best_practice)) {
    return { action: "error", id: importRow.id, error: "import best_practice is empty" }
  }

  const existingBp = normalizeBestPractice(existing.best_practice)
  if (!isEmptyBestPractice(existingBp)) {
    return { action: "skip", id: importRow.id }
  }

  return {
    action: "update",
    id: importRow.id,
    best_practice: importRow.best_practice,
  }
}

/** CTR values below 1% stored as percent-as-number (e.g. 0.13 = 0.13%). */
export function collectSubOnePercentCtrWarnings(rows: KpiImportRow[]): string[] {
  const warnings: string[] = []
  for (const row of rows) {
    const ctr = row.metrics.ctr
    if (ctr !== undefined && ctr !== null && ctr > 0 && ctr < 1) {
      warnings.push(
        `${row.publisher}/${row.media_type}/${row.bid_strategy}: ctr=${ctr} (sub-1% percent-as-number; UI may display inflated until formatter fix)`,
      )
    }
  }
  return warnings
}
