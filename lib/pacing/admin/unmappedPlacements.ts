import { suggestedMbaFromCampaignName } from "@/lib/pacing/admin/suggestedMbaFromCampaignName"
import { normalizeDailyFactDate } from "@/lib/snowflake/normalizeDate"

export const CM360_PACING_CHANNEL = "Ad Serving - CM360"
export const UNMAPPED_PLACEMENTS_WINDOW_DAYS = 60

export type UnmappedPlacement = {
  placementName: string
  campaignName: string
  firstDate: string
  lastDate: string
  impressions: number
  suggestedMba: string | null
}

export type UnmappedPlacementQueryFn = (
  sql: string,
  binds?: unknown[],
  options?: { label?: string },
) => Promise<Record<string, unknown>[]>

function asIsoDate(value: unknown): string {
  return normalizeDailyFactDate(value) ?? ""
}

function publishedIdSet(publishedLineIds: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const id of publishedLineIds) {
    const key = String(id ?? "")
      .trim()
      .toLowerCase()
    if (key) out.add(key)
  }
  return out
}

export function applyLabelMapThenResolve(
  factLineItemId: string | null | undefined,
  mappedLineItemId: string | null | undefined,
): string | null {
  const mapped = String(mappedLineItemId ?? "").trim()
  if (mapped) return mapped
  const fact = String(factLineItemId ?? "").trim()
  return fact || null
}

export function resolvedLineItemIsUnmapped(
  resolvedLineItemId: string | null | undefined,
  publishedLineIds: Iterable<string>,
): boolean {
  const id = String(resolvedLineItemId ?? "")
    .trim()
    .toLowerCase()
  if (!id) return true
  return !publishedIdSet(publishedLineIds).has(id)
}

/**
 * PACING_FACT CM360 rows in the last 60 days whose resolved LINE_ITEM_ID
 * (LABEL_MAP first, then the fact stamp) is null, empty, or absent from
 * MART.XANO_LINE_ITEMS_SNAPSHOT — the published ids warehouse attach uses.
 */
export function buildUnmappedPlacementsSql(): string {
  return `
    WITH resolved AS (
      SELECT
        COALESCE(NULLIF(TRIM(CAST(f.ENTITY_NAME AS VARCHAR)), ''), CAST(f.LINE_ITEM_NAME AS VARCHAR)) AS PLACEMENT_NAME,
        CAST(f.CAMPAIGN_NAME AS VARCHAR) AS CAMPAIGN_NAME,
        CAST(f.DATE_DAY AS DATE) AS DATE_DAY,
        f.IMPRESSIONS AS IMPRESSIONS,
        COALESCE(m.LINE_ITEM_ID, f.LINE_ITEM_ID) AS RESOLVED_LINE_ITEM_ID
      FROM ASSEMBLEDVIEW.MART.PACING_FACT f
      LEFT JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
        ON LOWER(TRIM(m.CHANNEL)) = LOWER(TRIM(f.CHANNEL))
       AND LOWER(TRIM(CAST(m.PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(CAST(f.PLATFORM_LINE_ITEM_ID AS VARCHAR)))
       AND m.IS_ACTIVE = TRUE
      WHERE f.CHANNEL = '${CM360_PACING_CHANNEL}'
        AND CAST(f.DATE_DAY AS DATE) >= DATEADD(day, -?, CURRENT_DATE())
    )
    SELECT
      r.PLACEMENT_NAME,
      r.CAMPAIGN_NAME,
      MIN(r.DATE_DAY) AS FIRST_DATE,
      MAX(r.DATE_DAY) AS LAST_DATE,
      SUM(r.IMPRESSIONS) AS IMPRESSIONS
    FROM resolved r
    WHERE r.RESOLVED_LINE_ITEM_ID IS NULL
       OR TRIM(CAST(r.RESOLVED_LINE_ITEM_ID AS VARCHAR)) = ''
       OR LOWER(TRIM(CAST(r.RESOLVED_LINE_ITEM_ID AS VARCHAR))) NOT IN (
         SELECT LOWER(TRIM(CAST(s.LINE_ITEM_ID AS VARCHAR)))
         FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
         WHERE s.LINE_ITEM_ID IS NOT NULL
           AND TRIM(CAST(s.LINE_ITEM_ID AS VARCHAR)) <> ''
       )
    GROUP BY r.PLACEMENT_NAME, r.CAMPAIGN_NAME
    ORDER BY IMPRESSIONS DESC NULLS LAST, r.PLACEMENT_NAME
  `
}

export function mapUnmappedPlacementRow(row: Record<string, unknown>): UnmappedPlacement {
  const campaignName = String(row.CAMPAIGN_NAME ?? "")
  return {
    placementName: String(row.PLACEMENT_NAME ?? ""),
    campaignName,
    firstDate: asIsoDate(row.FIRST_DATE),
    lastDate: asIsoDate(row.LAST_DATE),
    impressions: Number(row.IMPRESSIONS) || 0,
    suggestedMba: suggestedMbaFromCampaignName(campaignName),
  }
}

export async function getUnmappedPlacements(
  query: UnmappedPlacementQueryFn,
): Promise<UnmappedPlacement[]> {
  const rows = await query(buildUnmappedPlacementsSql(), [UNMAPPED_PLACEMENTS_WINDOW_DAYS], {
    label: "unmapped_cm360_placements",
  })
  return rows.map(mapUnmappedPlacementRow)
}
