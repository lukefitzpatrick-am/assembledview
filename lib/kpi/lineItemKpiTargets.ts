import { parseMoneyInput } from "@/lib/format/money";
import type { CampaignKPI } from "@/lib/kpi/types";

export type DerivedRateTarget = { kind: "cpm" | "cpv"; value: number };

function makeLineItemKpiKey(mba: string, version: number, lineItemId: string): string {
  return `${mba}|${version}|${lineItemId.toLowerCase().trim()}`;
}

/** Line-item grain KPI lookup — same key shape as pacing `makeKpiKey`. */
export function buildLineItemKpiTargetMap(rows: CampaignKPI[]): Map<string, CampaignKPI> {
  const map = new Map<string, CampaignKPI>();
  if (!Array.isArray(rows)) return map;

  for (const row of rows) {
    const lineItemId = row.line_item_id?.trim();
    if (!lineItemId) continue;
    map.set(makeLineItemKpiKey(row.mba_number, row.version_number, lineItemId), row);
  }

  return map;
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
