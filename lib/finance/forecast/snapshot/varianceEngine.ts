/**
 * Pure variance engine: Finance Forecast snapshot A vs snapshot B.
 * No I/O — accepts in-memory line records only.
 */

import { FINANCE_FORECAST_FISCAL_MONTH_ORDER } from "@/lib/types/financeForecast"
import type { FinanceForecastGroupKey, FinanceForecastLineKey } from "@/lib/types/financeForecast"
import type { FinanceForecastSnapshotLineRecord } from "@/lib/types/financeForecastSnapshot"
import type {
  CompareFinanceForecastVarianceOptions,
  FinanceForecastSnapshotVarianceInput,
  FinanceForecastVarianceChangeType,
  FinanceForecastVarianceClientRow,
  FinanceForecastVarianceFyLineRow,
  FinanceForecastVarianceFyTotalRow,
  FinanceForecastVarianceLineItemRow,
  FinanceForecastVarianceMonthLineRow,
  FinanceForecastVarianceMonthRow,
  FinanceForecastVarianceReport,
  FinanceForecastVarianceRowGroupRow,
  FinanceForecastVarianceSourceSide,
} from "@/lib/types/financeForecastVariance"

import { indexSnapshotLinesByComparisonKey, normaliseMediaPlanVersionId } from "./compareSnapshotLines"

function sourceSide(line: FinanceForecastSnapshotLineRecord | undefined): FinanceForecastVarianceSourceSide | null {
  if (!line) return null
  return {
    line_record_id: String(line.id),
    source_hash: line.source_hash,
    source_debug_json: line.source_debug_json,
  }
}

function mergeSourceSides(
  lines: FinanceForecastSnapshotLineRecord[],
  pick: "first" | "any" = "first"
): FinanceForecastVarianceSourceSide | null {
  if (lines.length === 0) return null
  const withHash = lines.find((l) => l.source_hash != null && l.source_hash !== "")
  const ref = pick === "first" ? lines[0] : withHash ?? lines[0]
  return sourceSide(ref)
}

export function classifyFinanceForecastVariance(
  old_amount: number | null,
  new_amount: number | null,
  eps: number
): FinanceForecastVarianceChangeType {
  if (old_amount === null && new_amount === null) return "unchanged"
  const o = old_amount ?? 0
  const n = new_amount ?? 0
  if (old_amount === null && new_amount !== null) {
    return Math.abs(n) <= eps ? "unchanged" : "new"
  }
  if (old_amount !== null && new_amount === null) {
    return Math.abs(o) <= eps ? "unchanged" : "removed"
  }
  if (old_amount !== null && new_amount !== null) {
    const d = n - o
    if (Math.abs(d) <= eps) return "unchanged"
    return d > 0 ? "increased" : "decreased"
  }
  return "unchanged"
}

export function financeForecastVariancePercentChange(
  old_amount: number | null,
  new_amount: number | null
): number | null {
  if (old_amount === null || new_amount === null) return null
  if (old_amount === 0) return null
  return ((new_amount - old_amount) / Math.abs(old_amount)) * 100
}

function varianceCore(
  old_amount: number | null,
  new_amount: number | null,
  eps: number
): Pick<
  FinanceForecastVarianceMonthLineRow,
  "old_amount" | "new_amount" | "absolute_change" | "percent_change" | "change_type"
> {
  const absolute_change = (new_amount ?? 0) - (old_amount ?? 0)
  return {
    old_amount,
    new_amount,
    absolute_change,
    percent_change: financeForecastVariancePercentChange(old_amount, new_amount),
    change_type: classifyFinanceForecastVariance(old_amount, new_amount, eps),
  }
}

function shouldIncludeRow(
  core: Pick<FinanceForecastVarianceMonthLineRow, "change_type" | "old_amount" | "new_amount">,
  includeUnchanged: boolean,
  eps: number
): boolean {
  const o = core.old_amount ?? 0
  const n = core.new_amount ?? 0
  if (!includeUnchanged && core.change_type === "unchanged") return false
  if (!includeUnchanged && Math.abs(o) <= eps && Math.abs(n) <= eps) return false
  return true
}

function fyLineAggKey(line: FinanceForecastSnapshotLineRecord): string {
  const vid = normaliseMediaPlanVersionId(line.media_plan_version_id) ?? ""
  return [line.client_id, vid, line.group_key, line.line_key].join("\u001f")
}

function sumSnapshotTotalAmount(lines: FinanceForecastSnapshotLineRecord[]): number {
  let t = 0
  for (const l of lines) t += l.amount
  return t
}

function groupLinesByKey(
  lines: FinanceForecastSnapshotLineRecord[],
  keyFn: (l: FinanceForecastSnapshotLineRecord) => string
): Map<string, FinanceForecastSnapshotLineRecord[]> {
  const m = new Map<string, FinanceForecastSnapshotLineRecord[]>()
  for (const l of lines) {
    const k = keyFn(l)
    const arr = m.get(k) ?? []
    arr.push(l)
    m.set(k, arr)
  }
  return m
}

function sumGroupAmount(rows: FinanceForecastSnapshotLineRecord[]): number {
  let t = 0
  for (const r of rows) t += r.amount
  return t
}

/**
 * Compare baseline snapshot **A** (`snapshotA`) to comparison snapshot **B** (`snapshotB`).
 * Convention: **old** = A amounts, **new** = B amounts.
 */
export function compareFinanceForecastSnapshots(
  snapshotA: FinanceForecastSnapshotVarianceInput,
  snapshotB: FinanceForecastSnapshotVarianceInput,
  options?: CompareFinanceForecastVarianceOptions
): FinanceForecastVarianceReport {
  const includeUnchanged = options?.include_unchanged ?? false
  const eps = options?.amount_epsilon ?? 0

  const baseMap = indexSnapshotLinesByComparisonKey(snapshotA.lines)
  const compMap = indexSnapshotLinesByComparisonKey(snapshotB.lines)
  const keys = new Set([...baseMap.keys(), ...compMap.keys()])

  const by_month_line: FinanceForecastVarianceMonthLineRow[] = []

  for (const key of keys) {
    const a = baseMap.get(key)
    const b = compMap.get(key)
    const old_amount = a !== undefined ? a.amount : null
    const new_amount = b !== undefined ? b.amount : null

    const core = varianceCore(old_amount, new_amount, eps)
    if (!shouldIncludeRow(core, includeUnchanged, eps)) continue

    const ref = a ?? b
    if (!ref) continue

    by_month_line.push({
      level: "month_line",
      ...core,
      client_id: ref.client_id,
      client_name: ref.client_name,
      mba_number: ref.mba_number,
      campaign_id: ref.campaign_id,
      media_plan_version_id: normaliseMediaPlanVersionId(ref.media_plan_version_id),
      version_number: ref.version_number,
      group_key: ref.group_key,
      line_key: ref.line_key,
      month_key: ref.month_key,
      baseline: sourceSide(a),
      comparison: sourceSide(b),
    })
  }

  by_month_line.sort(sortMonthLineRow)

  const aggA = groupLinesByKey(snapshotA.lines, fyLineAggKey)
  const aggB = groupLinesByKey(snapshotB.lines, fyLineAggKey)
  const fyKeys = new Set([...aggA.keys(), ...aggB.keys()])
  const by_fy_line: FinanceForecastVarianceFyLineRow[] = []

  for (const fk of fyKeys) {
    const rowsA = aggA.get(fk) ?? []
    const rowsB = aggB.get(fk) ?? []
    const old_amount = rowsA.length ? sumGroupAmount(rowsA) : null
    const new_amount = rowsB.length ? sumGroupAmount(rowsB) : null
    const core = varianceCore(old_amount, new_amount, eps)
    if (!shouldIncludeRow(core, includeUnchanged, eps)) continue
    const ref = rowsA[0] ?? rowsB[0]
    if (!ref) continue

    by_fy_line.push({
      level: "fy_line",
      ...core,
      client_id: ref.client_id,
      client_name: ref.client_name,
      mba_number: ref.mba_number,
      campaign_id: ref.campaign_id,
      media_plan_version_id: normaliseMediaPlanVersionId(ref.media_plan_version_id),
      version_number: ref.version_number,
      group_key: ref.group_key,
      line_key: ref.line_key,
      baseline: mergeSourceSides(rowsA, "any"),
      comparison: mergeSourceSides(rowsB, "any"),
    })
  }
  by_fy_line.sort(sortFyLineRow)

  const clientKey = (l: FinanceForecastSnapshotLineRecord) => l.client_id
  const byClientA = groupLinesByKey(snapshotA.lines, clientKey)
  const byClientB = groupLinesByKey(snapshotB.lines, clientKey)
  const clientIds = new Set([...byClientA.keys(), ...byClientB.keys()])
  const by_client: FinanceForecastVarianceClientRow[] = []
  const clientNames = new Map<string, string>()
  for (const l of snapshotA.lines) clientNames.set(l.client_id, l.client_name)
  for (const l of snapshotB.lines) clientNames.set(l.client_id, l.client_name)

  for (const cid of [...clientIds].sort()) {
    const rowsA = byClientA.get(cid) ?? []
    const rowsB = byClientB.get(cid) ?? []
    const old_amount = rowsA.length ? sumGroupAmount(rowsA) : null
    const new_amount = rowsB.length ? sumGroupAmount(rowsB) : null
    const core = varianceCore(old_amount, new_amount, eps)
    if (!shouldIncludeRow(core, includeUnchanged, eps)) continue
    by_client.push({
      level: "client",
      ...core,
      client_id: cid,
      client_name: clientNames.get(cid) ?? cid,
      baseline: mergeSourceSides(rowsA, "any"),
      comparison: mergeSourceSides(rowsB, "any"),
    })
  }

  const groupOnlyKey = (l: FinanceForecastSnapshotLineRecord) => l.group_key
  const byGroupA = groupLinesByKey(snapshotA.lines, groupOnlyKey)
  const byGroupB = groupLinesByKey(snapshotB.lines, groupOnlyKey)
  const groupKeys = new Set([...byGroupA.keys(), ...byGroupB.keys()])
  const by_row_group: FinanceForecastVarianceRowGroupRow[] = []

  for (const gk of [...groupKeys].sort()) {
    const rowsA = byGroupA.get(gk) ?? []
    const rowsB = byGroupB.get(gk) ?? []
    const old_amount = rowsA.length ? sumGroupAmount(rowsA) : null
    const new_amount = rowsB.length ? sumGroupAmount(rowsB) : null
    const core = varianceCore(old_amount, new_amount, eps)
    if (!shouldIncludeRow(core, includeUnchanged, eps)) continue
    by_row_group.push({
      level: "row_group",
      ...core,
      group_key: gk as FinanceForecastGroupKey,
      baseline: mergeSourceSides(rowsA, "any"),
      comparison: mergeSourceSides(rowsB, "any"),
    })
  }

  const lineItemKey = (l: FinanceForecastSnapshotLineRecord) => `${l.group_key}\u001f${l.line_key}`
  const byLiA = groupLinesByKey(snapshotA.lines, lineItemKey)
  const byLiB = groupLinesByKey(snapshotB.lines, lineItemKey)
  const liKeys = new Set([...byLiA.keys(), ...byLiB.keys()])
  const by_line_item: FinanceForecastVarianceLineItemRow[] = []

  for (const lk of [...liKeys].sort()) {
    const rowsA = byLiA.get(lk) ?? []
    const rowsB = byLiB.get(lk) ?? []
    const old_amount = rowsA.length ? sumGroupAmount(rowsA) : null
    const new_amount = rowsB.length ? sumGroupAmount(rowsB) : null
    const core = varianceCore(old_amount, new_amount, eps)
    if (!shouldIncludeRow(core, includeUnchanged, eps)) continue
    const sep = lk.indexOf("\u001f")
    const group_key = lk.slice(0, sep) as FinanceForecastGroupKey
    const line_key = lk.slice(sep + 1) as FinanceForecastLineKey
    by_line_item.push({
      level: "line_item",
      ...core,
      group_key,
      line_key,
      baseline: mergeSourceSides(rowsA, "any"),
      comparison: mergeSourceSides(rowsB, "any"),
    })
  }

  const monthOnly = (l: FinanceForecastSnapshotLineRecord) => l.month_key
  const byMoA = groupLinesByKey(snapshotA.lines, monthOnly)
  const byMoB = groupLinesByKey(snapshotB.lines, monthOnly)
  const by_month: FinanceForecastVarianceMonthRow[] = []

  for (const mk of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
    const rowsA = byMoA.get(mk) ?? []
    const rowsB = byMoB.get(mk) ?? []
    const old_amount = rowsA.length ? sumGroupAmount(rowsA) : null
    const new_amount = rowsB.length ? sumGroupAmount(rowsB) : null
    const core = varianceCore(old_amount, new_amount, eps)
    if (!shouldIncludeRow(core, includeUnchanged, eps)) continue
    by_month.push({
      level: "month",
      ...core,
      month_key: mk,
      baseline: mergeSourceSides(rowsA, "any"),
      comparison: mergeSourceSides(rowsB, "any"),
    })
  }

  const totalOld = snapshotA.lines.length ? sumSnapshotTotalAmount(snapshotA.lines) : null
  const totalNew = snapshotB.lines.length ? sumSnapshotTotalAmount(snapshotB.lines) : null
  const fyCore = varianceCore(totalOld, totalNew, eps)
  const fy_total: FinanceForecastVarianceFyTotalRow = {
    level: "fy_total",
    ...fyCore,
    baseline: null,
    comparison: null,
  }

  return {
    baseline_snapshot_id: snapshotA.snapshot_id,
    comparison_snapshot_id: snapshotB.snapshot_id,
    baseline_label: snapshotA.label,
    comparison_label: snapshotB.label,
    by_month_line,
    by_fy_line,
    by_client,
    by_row_group,
    by_line_item,
    by_month,
    fy_total,
  }
}

function sortMonthLineRow(a: FinanceForecastVarianceMonthLineRow, b: FinanceForecastVarianceMonthLineRow): number {
  const c = a.client_id.localeCompare(b.client_id)
  if (c !== 0) return c
  const v = (a.media_plan_version_id ?? "").localeCompare(b.media_plan_version_id ?? "")
  if (v !== 0) return v
  const g = a.group_key.localeCompare(b.group_key)
  if (g !== 0) return g
  const lk = a.line_key.localeCompare(b.line_key)
  if (lk !== 0) return lk
  return (
    FINANCE_FORECAST_FISCAL_MONTH_ORDER.indexOf(a.month_key) -
    FINANCE_FORECAST_FISCAL_MONTH_ORDER.indexOf(b.month_key)
  )
}

function sortFyLineRow(a: FinanceForecastVarianceFyLineRow, b: FinanceForecastVarianceFyLineRow): number {
  const c = a.client_id.localeCompare(b.client_id)
  if (c !== 0) return c
  const v = (a.media_plan_version_id ?? "").localeCompare(b.media_plan_version_id ?? "")
  if (v !== 0) return v
  const g = a.group_key.localeCompare(b.group_key)
  if (g !== 0) return g
  return a.line_key.localeCompare(b.line_key)
}