/**
 * Helpers for deterministic media plan line item identifiers.
 * IDs follow: <MBA_NUMBER><MEDIA_TYPE_CODE><LINE_ITEM_NUMBER>
 * Media type codes come from the UI labels shown beside each media container line item.
 *
 * MIGRATION NOTE (May 2026): Previously seven containers shared the catch-all
 * "ML" code (digitalDisplay, integration, progVideo, progBVOD, progAudio,
 * progOOH, ooh). This caused ID collisions when plans had multiple ML
 * containers. They now have distinct codes (DD, IT, PV, PB, PA, PO, OH).
 *
 * Historic line item IDs in Xano with ML codes remain valid — this change
 * affects new line items only. Pacing pipelines that match on extracted
 * suffixes will need to handle both ML (legacy) and the new specific codes
 * for any line items created before this change.
 */
export const MEDIA_TYPE_ID_CODES = {
  television: "TV",
  newspaper: "NP",
  socialMedia: "SM",
  radio: "RA",
  magazines: "MG",
  cinema: "CN",
  digitalDisplay: "DD",
  digitalAudio: "DA",
  digitalVideo: "DV",
  bvod: "BV",
  integration: "IT",
  search: "SE",
  progDisplay: "PD",
  progVideo: "PV",
  progBVOD: "PB",
  progAudio: "PA",
  progOOH: "PO",
  ooh: "OH",
  influencers: "IN",
} as const;

type MediaTypeKey = keyof typeof MEDIA_TYPE_ID_CODES;

function normalizeMbaNumber(mbaNumber: string | undefined | null, fallbackCode: string) {
  const trimmed = (mbaNumber ?? "").toString().trim();
  return trimmed || fallbackCode;
}

/**
 * Get a stable line item number using any provided fields, falling back to the
 * current index (1-based).
 */
export function pickLineItemNumber(candidate: any, fallbackNumber: number): number {
  const possibleNumbers = [
    candidate?.line_item,
    candidate?.lineItem,
    candidate?.lineitem,
    candidate?.lineItemNumber,
  ];

  for (const value of possibleNumbers) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }

  return fallbackNumber;
}

/**
 * Build the deterministic line item ID string.
 */
export function buildLineItemId(
  mbaNumber: string | undefined,
  mediaTypeCode: string,
  lineItemNumber: number
): string {
  const base = normalizeMbaNumber(mbaNumber, mediaTypeCode);
  const number = Math.max(1, Math.trunc(lineItemNumber));
  return `${base}${mediaTypeCode}${number}`;
}

/**
 * Produce both line_item_id and line_item values using UI codes and the
 * provided fallback index (0-based).
 */
export function buildLineItemIdentity(
  lineItem: any,
  mbaNumber: string | undefined,
  mediaTypeCode: typeof MEDIA_TYPE_ID_CODES[MediaTypeKey],
  fallbackIndex: number
) {
  const line_item = pickLineItemNumber(lineItem, fallbackIndex + 1);
  const line_item_id = buildLineItemId(mbaNumber, mediaTypeCode, line_item);
  return { line_item_id, line_item };
}

/** Media type codes longest-first so e.g. `PO` matches before `O` in ambiguous tails. */
const MEDIA_TYPE_CODES_BY_LENGTH = Object.values(MEDIA_TYPE_ID_CODES).sort(
  (a, b) => b.length - a.length
);

/**
 * Parse the numeric line-item suffix from a deterministic line_item_id
 * (e.g. `MBA2024OH68` → 68, legacy `MBA2024ML7` → 7).
 */
export function parseLineNumberFromLineItemId(lineItemId: string): number | null {
  const id = lineItemId.trim();
  if (!id) return null;

  for (const code of MEDIA_TYPE_CODES_BY_LENGTH) {
    const match = id.match(new RegExp(`${code}(\\d+)$`, "i"));
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  const tail = id.match(/(\d+)$/);
  if (tail) {
    const parsed = parseInt(tail[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function parseLineItemFieldValue(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const parsed = parseInt(trimmed, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return parseLineNumberFromLineItemId(trimmed);
  }
  return null;
}

/**
 * Resolve a numeric sort key for a line item row (API, form, or export shape).
 * Uses explicit line_item fields first, then line_item_id suffix parsing.
 */
export function resolveLineItemSortNumber(item: any, fallbackIndex = 0): number {
  const fieldCandidates = [
    item?.line_item,
    item?.lineItem,
    item?.lineitem,
    item?.lineItemNumber,
  ];

  for (const value of fieldCandidates) {
    const parsed = parseLineItemFieldValue(value);
    if (parsed !== null) return parsed;
  }

  for (const idValue of [item?.line_item_id, item?.lineItemId]) {
    if (idValue === undefined || idValue === null) continue;
    const parsed = parseLineNumberFromLineItemId(String(idValue));
    if (parsed !== null) return parsed;
  }

  return Number.POSITIVE_INFINITY;
}

/** Stable ascending sort by line item number (fixes string-order API responses). */
export function sortLineItemsByLineItemNumber<T>(items: T[]): T[] {
  return [...items]
    .map((item, index) => ({
      item,
      index,
      lineItemNumber: resolveLineItemSortNumber(item, index),
    }))
    .sort((a, b) => {
      if (a.lineItemNumber !== b.lineItemNumber) {
        return a.lineItemNumber - b.lineItemNumber;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
