import type { CampaignKPI } from "@/lib/kpi/types"

/**
 * Target values for a single (media_type, publisher, bid_strategy) tuple.
 * Values are the KPI rates (CTR, VTR, etc.) or per-line expectations (frequency).
 * CPV is derived from line spend / deliverables at render time, not stored.
 */
export interface KPITargetValues {
  ctr: number | null
  conversion_rate: number | null
  vtr: number | null
  frequency: number | null
}

/**
 * Lookup of KPI targets for a campaign. Key format: `${mediaType}::${publisher}::${bidStrategy}`,
 * all normalised to lowercase-trimmed. Miss returns undefined (container renders no band).
 */
export type KPITargetsMap = Map<string, KPITargetValues>

function normKey(mediaType: string, publisher: string, bidStrategy: string): string {
  const a = String(mediaType ?? "").toLowerCase().trim()
  const b = String(publisher ?? "").toLowerCase().trim()
  const c = String(bidStrategy ?? "").toLowerCase().trim()
  return `${a}::${b}::${c}`
}

/** Key for callers who need to look up a target from their own line-item shape. */
export function kpiTargetKey(mediaType: string, publisher: string, bidStrategy: string): string {
  return normKey(mediaType, publisher, bidStrategy)
}

/** Build the lookup. Empty input returns an empty map. */
export function buildKPITargetsMap(rows: CampaignKPI[] | null | undefined): KPITargetsMap {
  const map: KPITargetsMap = new Map()
  if (!Array.isArray(rows)) return map
  for (const row of rows) {
    const key = normKey(row.media_type, row.publisher, row.bid_strategy)
    const norm = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    map.set(key, {
      ctr: norm(row.ctr),
      conversion_rate: norm(row.conversion_rate),
      vtr: norm(row.vtr),
      frequency: norm(row.frequency),
    })
  }
  return map
}
