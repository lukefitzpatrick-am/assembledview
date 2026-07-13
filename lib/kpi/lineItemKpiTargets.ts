import { parseMoneyInput } from "@/lib/format/money";
import type { CampaignKPI } from "@/lib/kpi/types";

export type DerivedRateTarget = { kind: "cpm" | "cpv"; value: number };

export type LineItemBurstSource = {
  line_item_id?: string;
  buy_type?: string;
  bursts_json?: unknown;
  bursts?: unknown;
};

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

function burstsFromLineItem(item: LineItemBurstSource): unknown {
  return item.bursts_json ?? item.bursts ?? null;
}

function sumBurstTotals(burstsJson: unknown): { totalMedia: number; totalCalculated: number } | null {
  const bursts = parseBurstsArray(burstsJson);
  if (!bursts?.length) return null;

  let totalMedia = 0;
  let totalCalculated = 0;

  for (const item of bursts) {
    if (!item || typeof item !== "object") continue;
    const burst = item as Record<string, unknown>;
    const mediaAmount = burstMediaAmount(burst);
    const calculatedValue = burstCalculatedValue(burst);
    if (mediaAmount === null || calculatedValue === null) continue;
    totalMedia += mediaAmount;
    totalCalculated += calculatedValue;
  }

  if (totalCalculated <= 0) return null;
  return { totalMedia, totalCalculated };
}

/**
 * Pooled CPM/CPV across active line items — only bursts whose buy_type matches `kind`.
 * Rate = Σ mediaAmount ÷ Σ calculatedValue (×1000 for CPM).
 */
export function aggregateRateTargetFromLineItems(
  items: LineItemBurstSource[],
  kind: "cpm" | "cpv",
): number | null {
  let totalMedia = 0;
  let totalCalculated = 0;

  for (const item of items) {
    if (String(item.buy_type ?? "").trim().toLowerCase() !== kind) continue;
    const totals = sumBurstTotals(burstsFromLineItem(item));
    if (!totals) continue;
    totalMedia += totals.totalMedia;
    totalCalculated += totals.totalCalculated;
  }

  if (totalCalculated <= 0) return null;
  return kind === "cpm" ? (totalMedia / totalCalculated) * 1000 : totalMedia / totalCalculated;
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

function parseBurstsArray(burstsJson: unknown): unknown[] | null {
  if (!burstsJson) return null;
  if (Array.isArray(burstsJson)) return burstsJson;
  if (typeof burstsJson === "string") {
    try {
      const parsed = JSON.parse(burstsJson);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function burstMediaAmount(burst: Record<string, unknown>): number | null {
  const raw = burst.mediaAmount ?? burst.media_amount;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  const parsed = parseMoneyInput(raw as string);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function burstCalculatedValue(burst: Record<string, unknown>): number | null {
  const raw = burst.calculatedValue ?? burst.calculated_value;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Spend-weighted CPM/CPV target from line-item bursts_json.
 * CPM = (Σ mediaAmount ÷ Σ calculatedValue) × 1000; CPV = Σ mediaAmount ÷ Σ calculatedValue.
 */
export function deriveRateTargetFromBursts(
  burstsJson: unknown,
  buyType: string,
): DerivedRateTarget | null {
  const kind = buyType.trim().toLowerCase();
  if (kind !== "cpm" && kind !== "cpv") return null;

  const bursts = parseBurstsArray(burstsJson);
  if (!bursts?.length) return null;

  let totalMedia = 0;
  let totalCalculated = 0;

  for (const item of bursts) {
    if (!item || typeof item !== "object") continue;
    const burst = item as Record<string, unknown>;
    const mediaAmount = burstMediaAmount(burst);
    const calculatedValue = burstCalculatedValue(burst);
    if (mediaAmount === null || calculatedValue === null) continue;
    totalMedia += mediaAmount;
    totalCalculated += calculatedValue;
  }

  if (totalCalculated <= 0) return null;

  const value =
    kind === "cpm" ? (totalMedia / totalCalculated) * 1000 : totalMedia / totalCalculated;

  return { kind, value };
}
