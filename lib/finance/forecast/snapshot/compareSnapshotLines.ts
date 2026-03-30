import type {
  FinanceForecastGroupKey,
  FinanceForecastLineKey,
  FinanceForecastMonthKey,
} from "@/lib/types/financeForecast"
import type {
  FinanceForecastSnapshotClientRollupDelta,
  FinanceForecastSnapshotComparisonKey,
  FinanceForecastSnapshotLineCategoryRollupDelta,
  FinanceForecastSnapshotLineDelta,
  FinanceForecastSnapshotLineRecord,
  FinanceForecastSnapshotMonthlyRollupDelta,
} from "@/lib/types/financeForecastSnapshot"

import { FINANCE_FORECAST_FISCAL_MONTH_ORDER } from "@/lib/types/financeForecast"

export function normaliseMediaPlanVersionId(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined) return null
  return String(id)
}

export function snapshotLineComparisonKey(line: FinanceForecastSnapshotLineRecord): string {
  const vid = normaliseMediaPlanVersionId(line.media_plan_version_id)
  return [
    line.client_id,
    vid ?? "",
    line.group_key,
    line.line_key,
    line.month_key,
  ].join("\u001f")
}

export function toComparisonKey(line: FinanceForecastSnapshotLineRecord): FinanceForecastSnapshotComparisonKey {
  return {
    client_id: line.client_id,
    media_plan_version_id: normaliseMediaPlanVersionId(line.media_plan_version_id),
    group_key: line.group_key,
    line_key: line.line_key,
    month_key: line.month_key,
  }
}

/** Map keyed by `snapshotLineComparisonKey` for point-in-time lines from one snapshot. */
export function indexSnapshotLinesByComparisonKey(
  lines: FinanceForecastSnapshotLineRecord[]
): Map<string, FinanceForecastSnapshotLineRecord> {
  const m = new Map<string, FinanceForecastSnapshotLineRecord>()
  for (const line of lines) {
    m.set(snapshotLineComparisonKey(line), line)
  }
  return m
}

/**
 * Month-level diff for lines present in either snapshot (full outer on comparison key).
 */
export function compareFinanceForecastSnapshotLines(
  baseline: { snapshot_id: string; lines: FinanceForecastSnapshotLineRecord[] },
  comparison: { snapshot_id: string; lines: FinanceForecastSnapshotLineRecord[] }
): FinanceForecastSnapshotLineDelta[] {
  const baseMap = indexSnapshotLinesByComparisonKey(baseline.lines)
  const compMap = indexSnapshotLinesByComparisonKey(comparison.lines)
  const keys = new Set([...baseMap.keys(), ...compMap.keys()])
  const out: FinanceForecastSnapshotLineDelta[] = []

  for (const key of keys) {
    const a = baseMap.get(key)
    const b = compMap.get(key)
    const baseAmt = a?.amount ?? 0
    const compAmt = b?.amount ?? 0
    if (baseAmt === 0 && compAmt === 0) continue

    const ref = a ?? b
    if (!ref) continue

    out.push({
      key: toComparisonKey(ref),
      client_name: ref.client_name,
      mba_number: ref.mba_number,
      baseline_amount: baseAmt,
      comparison_amount: compAmt,
      delta: compAmt - baseAmt,
      baseline_snapshot_id: baseline.snapshot_id,
      comparison_snapshot_id: comparison.snapshot_id,
    })
  }

  return out.sort((x, y) => {
    const c = x.key.client_id.localeCompare(y.key.client_id)
    if (c !== 0) return c
    const v = (x.key.media_plan_version_id ?? "").localeCompare(y.key.media_plan_version_id ?? "")
    if (v !== 0) return v
    const g = x.key.group_key.localeCompare(y.key.group_key)
    if (g !== 0) return g
    const lk = x.key.line_key.localeCompare(y.key.line_key)
    if (lk !== 0) return lk
    return (
      FINANCE_FORECAST_FISCAL_MONTH_ORDER.indexOf(x.key.month_key) -
      FINANCE_FORECAST_FISCAL_MONTH_ORDER.indexOf(y.key.month_key)
    )
  })
}

function sumByMonth(lines: FinanceForecastSnapshotLineRecord[], month: FinanceForecastMonthKey): number {
  let t = 0
  for (const l of lines) {
    if (l.month_key === month) t += l.amount
  }
  return t
}

export function compareSnapshotsByMonth(
  baseline: FinanceForecastSnapshotLineRecord[],
  comparison: FinanceForecastSnapshotLineRecord[]
): FinanceForecastSnapshotMonthlyRollupDelta[] {
  return FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((month_key) => {
    const bt = sumByMonth(baseline, month_key)
    const ct = sumByMonth(comparison, month_key)
    return { month_key, baseline_total: bt, comparison_total: ct, delta: ct - bt }
  })
}

function sumForClient(lines: FinanceForecastSnapshotLineRecord[], clientId: string): number {
  let t = 0
  for (const l of lines) {
    if (l.client_id === clientId) t += l.amount
  }
  return t
}

export function compareSnapshotsByClient(
  baseline: FinanceForecastSnapshotLineRecord[],
  comparison: FinanceForecastSnapshotLineRecord[]
): FinanceForecastSnapshotClientRollupDelta[] {
  const names = new Map<string, string>()
  for (const l of baseline) names.set(l.client_id, l.client_name)
  for (const l of comparison) names.set(l.client_id, l.client_name)

  const ids = new Set([...baseline.map((l) => l.client_id), ...comparison.map((l) => l.client_id)])
  return [...ids]
    .sort()
    .map((client_id) => {
      const bt = sumForClient(baseline, client_id)
      const ct = sumForClient(comparison, client_id)
      return {
        client_id,
        client_name: names.get(client_id) ?? client_id,
        baseline_total: bt,
        comparison_total: ct,
        delta: ct - bt,
      }
    })
    .filter((r) => r.baseline_total !== 0 || r.comparison_total !== 0)
}

function lineCategoryKey(g: FinanceForecastGroupKey, lk: FinanceForecastLineKey): string {
  return `${g}\u001f${lk}`
}

export function compareSnapshotsByLineCategory(
  baseline: FinanceForecastSnapshotLineRecord[],
  comparison: FinanceForecastSnapshotLineRecord[]
): FinanceForecastSnapshotLineCategoryRollupDelta[] {
  const sum = (rows: FinanceForecastSnapshotLineRecord[]) => {
    const m = new Map<string, number>()
    for (const l of rows) {
      const k = lineCategoryKey(l.group_key, l.line_key)
      m.set(k, (m.get(k) ?? 0) + l.amount)
    }
    return m
  }

  const a = sum(baseline)
  const b = sum(comparison)
  const keys = new Set([...a.keys(), ...b.keys()])
  const out: FinanceForecastSnapshotLineCategoryRollupDelta[] = []

  for (const key of keys) {
    const bt = a.get(key) ?? 0
    const ct = b.get(key) ?? 0
    if (bt === 0 && ct === 0) continue
    const sep = key.indexOf("\u001f")
    const group_key = key.slice(0, sep) as FinanceForecastGroupKey
    const line_key = key.slice(sep + 1) as FinanceForecastLineKey
    out.push({
      group_key,
      line_key,
      baseline_total: bt,
      comparison_total: ct,
      delta: ct - bt,
    })
  }

  return out.sort((x, y) => {
    const g = x.group_key.localeCompare(y.group_key)
    if (g !== 0) return g
    return x.line_key.localeCompare(y.line_key)
  })
}
