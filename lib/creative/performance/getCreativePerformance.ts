import "server-only"

import { attachPreviewFields } from "@/lib/creative/previews/dashboard"
import { loadDashboardPreviews } from "@/lib/creative/previews/lookup"
import { querySnowflake } from "@/lib/snowflake/query"

import {
  creativeRowsFromWarehouse,
  groupAndRank,
  type CreativePerformanceRow,
  type RankMetric,
} from "./metrics"
import { loadPublishedLineLabels } from "./planLineLabels"

const CREATIVE_SQL = `
SELECT
  platform,
  creative_key,
  creative_name,
  creative_size,
  line_item_id,
  ad_set_id,
  ad_group_name,
  date,
  spend,
  impressions,
  clicks,
  viewable_impressions,
  video_views,
  video_completions,
  conversions
FROM ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY
WHERE LOWER(mba_number) = LOWER(?)
  AND date >= ?
  AND date <= ?
`

export async function getCreativePerformance(input: {
  mbaNumber: string
  from: string
  to: string
  sort: RankMetric
}): Promise<CreativePerformanceRow[]> {
  const raw = await querySnowflake<Record<string, unknown>>(
    CREATIVE_SQL,
    [input.mbaNumber, input.from, input.to],
    { label: "creative-performance" },
  )
  const daily = creativeRowsFromWarehouse(raw ?? [])
  const labels = await loadPublishedLineLabels(input.mbaNumber)
  const ranked = groupAndRank(daily, labels, input.sort)
  const previews = await loadDashboardPreviews(ranked)
  return attachPreviewFields(ranked, previews)
}
