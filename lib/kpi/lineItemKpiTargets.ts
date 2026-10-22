import type { CampaignKPI } from "@/lib/kpi/types";

// CPM, CPC and CPV plan rates live in lib/kpi/kpiReview (resolveCpmPlanRate,
// resolveCpcPlanRate, resolveCpvPlanRate). The burst-derived duplicate was
// removed on 22 Oct 2026 (C7).

export type AggregateRatioMetric = "ctr" | "conversion_rate" | "vtr";

/** Line-item grain KPI lookup key — same shape as pacing `makeKpiKey`. */
export function lineItemKpiKey(mba: string, version: number, lineItemId: string): string {
  return `${mba}|${version}|${lineItemId.toLowerCase().trim()}`;
}

/** Line-item grain KPI lookup — same key shape as pacing `makeKpiKey`. */
export function buildLineItemKpiTargetMap(rows: CampaignKPI[]): Map<string, CampaignKPI> {
  const map = new Map<string, CampaignKPI>();
  if (!Array.isArray(rows)) return map;

  for (const row of rows) {
    const lineItemId = row.line_item_id?.trim();
    if (!lineItemId) continue;
    map.set(lineItemKpiKey(row.mba_number, row.version_number, lineItemId), row);
  }

  return map;
}

export function getLineItemKpiRow(
  map: Map<string, CampaignKPI> | undefined,
  mba: string,
  version: number,
  lineItemId: string,
): CampaignKPI | undefined {
  if (!map?.size) return undefined;
  const id = lineItemId?.trim();
  if (!id) return undefined;
  return map.get(lineItemKpiKey(mba, version, id));
}

/**
 * Aggregate ratio target (raw stored decimal) when every line has a campaign_kpi row
 * and stored values are identical for the metric. Otherwise null.
 */
export function aggregateRatioTargetFromLineItems(
  items: Array<{ line_item_id?: string }>,
  lineItemTargets: Map<string, CampaignKPI> | undefined,
  mba: string,
  version: number,
  metric: AggregateRatioMetric,
): number | null {
  if (!items.length || !lineItemTargets?.size) return null;

  let shared: number | null | undefined;

  for (const item of items) {
    const row = getLineItemKpiRow(lineItemTargets, mba, version, String(item.line_item_id ?? ""));
    if (!row) return null;
    const value = row[metric];
    if (shared === undefined) {
      shared = value;
    } else if (shared !== value) {
      return null;
    }
  }

  return shared ?? null;
}
