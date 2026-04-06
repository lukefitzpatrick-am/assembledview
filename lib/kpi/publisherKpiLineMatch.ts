import type { Publisher } from "@/lib/types/publisher"

function normStr(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
}

/** Maps normalised publisherid → normalised publisher_name for KPI join (line items use display name). */
export function buildPublisherIdToNormNameMap(publishers: Publisher[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const p of publishers) {
    const id = String(p.publisherid ?? "").trim()
    if (!id) continue
    m.set(normStr(id), normStr(p.publisher_name))
  }
  return m
}

/**
 * Line-item publisher key is lowercase display name (`extractKPIKeys`).
 * `publisher_kpi.publisher` is often Xano publisher id; client rows use `publisher_name` (display name).
 */
export function linePublisherMatchesKpiPublisherField(
  linePublisherNorm: string,
  kpiPublisherField: string,
  idToNormName: Map<string, string>,
): boolean {
  const k = normStr(kpiPublisherField)
  if (!k) return false
  if (k === linePublisherNorm) return true
  const nameFromId = idToNormName.get(k)
  return Boolean(nameFromId && nameFromId === linePublisherNorm)
}
