import type { NormalisedBurst } from "@/lib/pacing/campaigns/types";

function normalizeISODate(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses bursts_json (or inline bursts array) into sorted NormalisedBurst rows.
 * Field keys align with lib/pacing/plan/normalisePlan.ts and serializeBurstsJson.
 */
export function parseBurstsToNormalised(raw: unknown): NormalisedBurst[] {
  const source = (() => {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  })();

  if (!source) return [];

  const mapped = source
    .map((b: Record<string, unknown>) => {
      const startDate =
        normalizeISODate(
          b?.start_date ?? b?.startDate ?? b?.start ?? b?.begin_date ?? b?.beginDate
        ) ?? null;
      const endDate =
        normalizeISODate(b?.end_date ?? b?.endDate ?? b?.end ?? b?.stop_date ?? b?.stopDate) ??
        startDate;

      if (!startDate || !endDate) return null;

      const budget = parseNumber(
        b?.budget_number ?? b?.media_investment ?? b?.buy_amount_number ?? b?.budget ?? b?.Budget ?? 0
      );
      const buyAmount = parseNumber(
        b?.buy_amount_number ?? b?.buy_amount ?? b?.buyAmount ?? b?.BuyAmount ?? budget
      );
      const calculatedValue = parseNumber(
        b?.calculated_value_number ??
          b?.calculated_value ??
          b?.calculatedValue ??
          b?.deliverables ??
          b?.deliverable ??
          b?.conversions ??
          0
      );
      const mediaAmountRaw = b?.media_amount ?? b?.mediaAmount;
      const feeAmountRaw = b?.fee_amount ?? b?.fee ?? b?.feeAmount;

      const burst: NormalisedBurst = {
        index: 0,
        startDate,
        endDate,
        budget,
        buyAmount,
        calculatedValue,
      };
      const mediaAmount = parseNumber(mediaAmountRaw);
      const feeAmount = parseNumber(feeAmountRaw);
      if (mediaAmountRaw !== undefined && mediaAmountRaw !== null && mediaAmount > 0) {
        burst.mediaAmount = mediaAmount;
      }
      if (feeAmountRaw !== undefined && feeAmountRaw !== null && feeAmount > 0) {
        burst.feeAmount = feeAmount;
      }
      return burst;
    })
    .filter(Boolean) as NormalisedBurst[];

  mapped.sort((a, b) => a.startDate.localeCompare(b.startDate));
  mapped.forEach((b, i) => {
    b.index = i;
  });
  return mapped;
}
