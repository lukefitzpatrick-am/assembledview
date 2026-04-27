import type { CampaignKPI } from "@/lib/kpi/types"

/**
 * Target values for a single (media_type, publisher, bid_strategy) tuple.
 * Values are the KPI rates (CTR, VTR, etc.) or per-line expectations (frequency).
 * CPV is derived from line spend / deliverables at render time, not stored.
 */
export interface KPITargetValues {
  ctr: number
  conversion_rate: number
  vtr: number
  frequency: number
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
    map.set(key, {
      ctr: Number(row.ctr) || 0,
      conversion_rate: Number(row.conversion_rate) || 0,
      vtr: Number(row.vtr) || 0,
      frequency: Number(row.frequency) || 0,
    })
  }
  return map
}
