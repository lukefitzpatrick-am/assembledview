import { serializeBurstsJson } from "@/lib/mediaplan/serializeBurstsJson"
import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { getBooleanField } from "@/lib/util/getBooleanField"

export function parseBurstMoney(value: any): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveFeePctFromSerializedBursts(
  bursts: any[],
  budgetIncludesFees: boolean
): number {
  const burst = bursts.find((candidate) => candidate?.feeAmount !== undefined);
  if (!burst) return 0;

  const rawBudget = parseBurstMoney(burst.budget);
  const feeAmount = parseBurstMoney(burst.feeAmount);
  if (rawBudget <= 0 || feeAmount <= 0) return 0;

  if (budgetIncludesFees) {
    return (feeAmount * 100) / rawBudget;
  }

  return (feeAmount * 100) / (rawBudget + feeAmount);
}

export function normalizeFeePct(value: any): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Extract and format bursts from a line item for Xano persistence.
 * Handles both lineItem.bursts (array) and lineItem.bursts_json (string) cases.
 * Formats all burst fields with proper names and handles date serialization.
 */
export function extractAndFormatBursts(lineItem: any, feePct?: number): any[] {
  let bursts: any[] = [];

  // First, try to get bursts from lineItem.bursts (array) - matches radio schema
  if (Array.isArray(lineItem.bursts)) {
    bursts = lineItem.bursts;
  }
  // If not found, try to parse from lineItem.bursts_json (string) - for backward compatibility
  else if (lineItem.bursts_json) {
    try {
      if (typeof lineItem.bursts_json === 'string') {
        const trimmed = lineItem.bursts_json.trim();
        if (trimmed) {
          bursts = JSON.parse(trimmed);
        }
      } else if (Array.isArray(lineItem.bursts_json)) {
        bursts = lineItem.bursts_json;
      } else if (typeof lineItem.bursts_json === 'object') {
        bursts = [lineItem.bursts_json];
      }
    } catch (parseError) {
      console.error('Error parsing bursts_json:', parseError, lineItem.bursts_json);
      bursts = [];
    }
  }
  // Also check if bursts is a non-array object (should be converted to array)
  else if (lineItem.bursts && typeof lineItem.bursts === 'object' && !Array.isArray(lineItem.bursts)) {
    bursts = [lineItem.bursts];
  }

  // Ensure bursts is an array
  if (!Array.isArray(bursts)) {
    bursts = [];
  }

  const budgetIncludesFees = getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false);
  const clientPaysForMedia = getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false);

  const normalizedFeePct = normalizeFeePct(feePct);
  const effectiveFeePct = normalizedFeePct !== undefined
    ? normalizedFeePct
    : deriveFeePctFromSerializedBursts(bursts, budgetIncludesFees);

  // Normalize dates to Sydney YYYY-MM-DD before the shared serializer (heal on write).
  const formatBurstDate = (value: any) => {
    if (!value) return "";
    if (value instanceof Date || typeof value === "string") {
      return formatBurstDateLocal(value);
    }
    return value;
  };

  const serializedBursts = serializeBurstsJson({
    bursts: bursts.map((burst: any) => ({
      budget: burst.budget,
      buyAmount: burst.buyAmount,
      startDate: formatBurstDate(burst.startDate),
      endDate: formatBurstDate(burst.endDate),
      calculatedValue: burst.calculatedValue,
    })),
    feePct: effectiveFeePct,
    budgetIncludesFees,
    clientPaysForMedia,
  });

  return serializedBursts.map((serializedBurst, index) => {
    const burst = bursts[index] || {};
    const extraFields = Object.keys(burst).reduce((fields: Record<string, any>, key) => {
      if (!['budget', 'buyAmount', 'startDate', 'endDate', 'calculatedValue', 'fee', 'mediaAmount', 'feeAmount', '_reactKey'].includes(key)) {
        fields[key] = burst[key];
      }
      return fields;
    }, {});

    return {
      ...serializedBurst,
      ...extraFields,
    };
  });
}
