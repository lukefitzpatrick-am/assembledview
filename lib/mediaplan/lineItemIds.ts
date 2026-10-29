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
  production: "PROD",
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
 * Produce both line_item_id and line_item values using UI codes.
 * If the incoming line item already has a persisted line_item_id / lineItemId,
 * KEEP it (reordering must not restamp). Otherwise mint from the numeric
 * line_item (or fallbackIndex+1 when minting a single item).
 *
 * Prefer {@link assignLineItemIdentities} for batches so new lines mint
 * (max existing)+1 instead of the array index.
 */
export function buildLineItemIdentity(
  lineItem: any,
  mbaNumber: string | undefined,
  mediaTypeCode: typeof MEDIA_TYPE_ID_CODES[MediaTypeKey],
  fallbackIndex: number
) {
  const existingId = String(
    lineItem?.line_item_id ?? lineItem?.lineItemId ?? ""
  ).trim();
  if (existingId) {
    const parsedFromId = parseLineNumberFromLineItemId(existingId);
    const line_item = pickLineItemNumber(
      lineItem,
      parsedFromId ?? Math.max(1, fallbackIndex + 1)
    );
    return { line_item_id: existingId, line_item };
  }

  const line_item = pickLineItemNumber(lineItem, fallbackIndex + 1);
  const line_item_id = buildLineItemId(mbaNumber, mediaTypeCode, line_item);
  return { line_item_id, line_item };
}

/**
 * Batch identity assignment for channel saves:
 * - Keep persisted line_item_id values (reorder-safe).
 * - If two lines share the same persisted id, keep the first and remint the
 *   second at (max existing)+1 — two UI lines sharing an id is never legitimate.
 * - Mint new ids only for lines without one, using (max existing)+1 — never
 *   the array index.
 */
export function assignLineItemIdentities(
  lineItems: any[],
  mbaNumber: string | undefined,
  mediaTypeCode: typeof MEDIA_TYPE_ID_CODES[MediaTypeKey]
): Array<{ line_item_id: string; line_item: number }> {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const used = new Set<number>();
  const seenPersistedIds = new Set<string>();

  // Pass 1: claim numbers owned by the first occurrence of each persisted id.
  for (const item of items) {
    const existingId = String(item?.line_item_id ?? item?.lineItemId ?? "").trim();
    if (!existingId) continue;
    if (seenPersistedIds.has(existingId)) continue;
    seenPersistedIds.add(existingId);
    const fromId = parseLineNumberFromLineItemId(existingId);
    const n = pickLineItemNumber(item, fromId ?? 0);
    if (n > 0) used.add(n);
  }

  let next = (used.size ? Math.max(...used) : 0) + 1;
  seenPersistedIds.clear();

  const mintNext = (): number => {
    while (used.has(next)) next += 1;
    const lineNo = next;
    used.add(lineNo);
    next += 1;
    return lineNo;
  };

  // Pass 2: keep first persisted id; remint collisions; mint missing ids.
  return items.map((item) => {
    const existingId = String(item?.line_item_id ?? item?.lineItemId ?? "").trim();
    if (existingId) {
      if (seenPersistedIds.has(existingId)) {
        console.warn(
          `[assignLineItemIdentities] same-id collision on ${existingId}; keeping first, reminting duplicate`
        );
        const lineNo = mintNext();
        return buildLineItemIdentity(
          {
            ...item,
            line_item_id: undefined,
            lineItemId: undefined,
            line_item: lineNo,
            lineItem: lineNo,
          },
          mbaNumber,
          mediaTypeCode,
          lineNo - 1
        );
      }
      seenPersistedIds.add(existingId);
      return buildLineItemIdentity(item, mbaNumber, mediaTypeCode, 0);
    }

    const explicit = pickLineItemNumber(item, 0);
    let lineNo: number;
    if (explicit > 0 && !used.has(explicit)) {
      lineNo = explicit;
      used.add(lineNo);
      if (lineNo >= next) next = lineNo + 1;
    } else {
      lineNo = mintNext();
    }

    return buildLineItemIdentity(
      { ...item, line_item: lineNo, lineItem: lineNo },
      mbaNumber,
      mediaTypeCode,
      lineNo - 1
    );
  });
}

/** Media type codes longest-first so e.g. `PO` matches before `O` in ambiguous tails. */
const MEDIA_TYPE_CODES_BY_LENGTH = Object.values(MEDIA_TYPE_ID_CODES).sort(
  (a, b) => b.length - a.length
);

/**
 * Derive the MBA number embedded in a line_item_id server-side.
 * Supports compact `buildLineItemId` shape (`BICAU002SM1`) including legacy `ML`,
 * and pipe-delimited pacing ids (`mba|version|channel|…`).
 * Returns null when the MBA cannot be derived — callers must fail closed for clients.
 */
export function parseMbaNumberFromLineItemId(lineItemId: string): string | null {
  const id = String(lineItemId ?? "").trim()
  if (!id) return null

  if (id.includes("|")) {
    const first = id.split("|")[0]?.trim()
    return first || null
  }

  // Include legacy ML (pre-May 2026 catch-all) alongside current codes.
  const codes = [...MEDIA_TYPE_CODES_BY_LENGTH, "ML"].sort(
    (a, b) => b.length - a.length
  )
  for (const code of codes) {
    const match = id.match(new RegExp(`^(.+?)${code}\\d+$`, "i"))
    if (match?.[1]) return match[1]
  }

  return null
}

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

/**
 * Next line number for an add or a duplicate: one past the highest numeric
 * suffix already in use. Uses `parseLineNumberFromLineItemId` (the same
 * suffix rules `assignStableLineItemNumbers` uses). Does not fill gaps and
 * does not renumber existing lines. An empty list returns 1.
 */
export function nextLineNumber(
  existingIds: readonly (string | null | undefined)[],
): number {
  let max = 0
  for (const id of existingIds) {
    if (id == null) continue
    const trimmed = String(id).trim()
    if (!trimmed) continue
    const parsed = parseLineNumberFromLineItemId(trimmed)
    if (parsed != null && parsed > max) max = parsed
  }
  return max + 1
}

/**
 * Ids already claimed on these rows, plus a synthetic id for a numeric
 * `line_item` that has no id yet, so `nextLineNumber` sees that suffix.
 * The synthetic id is not persisted.
 */
export function lineItemIdsInUse(
  items: readonly any[] | null | undefined,
): string[] {
  if (!items?.length) return []
  const ids: string[] = []
  for (const item of items) {
    for (const rawId of [item?.line_item_id, item?.lineItemId]) {
      if (typeof rawId === "string" && rawId.trim()) ids.push(rawId.trim())
    }
    const n = parseLineItemFieldValue(item?.line_item ?? item?.lineItem)
    if (n != null) ids.push(buildLineItemId("n", "LN", n))
  }
  return ids
}

/**
 * Identity fields for a new line. Existing rows are left unchanged.
 * The number is above every suffix on these rows and above the plan's line id
 * floor (`lineIdFloor`), so an id used by any earlier version is never reused.
 */
export function nextLineFields(
  items: readonly any[] | null | undefined,
  mbaNumber: string,
  mediaTypeIdCode: string,
): {
  lineItemId: string
  line_item_id: string
  line_item: number
  lineItem: number
} {
  const lineNumber = Math.max(
    nextLineNumber(lineItemIdsInUse(items)),
    lineIdFloor(mbaNumber, mediaTypeIdCode) + 1,
  )
  const id = buildLineItemId(mbaNumber || "", mediaTypeIdCode, lineNumber)
  return {
    lineItemId: id,
    line_item_id: id,
    line_item: lineNumber,
    lineItem: lineNumber,
  }
}

/** Card label: the stored id when the row has one, otherwise the stored number. */
export function resolvedLineItemId(
  row: any,
  mbaNumber: string,
  mediaTypeIdCode: string,
  indexFallback: number,
): string {
  const stored = row?.line_item_id ?? row?.lineItemId
  if (typeof stored === "string" && stored.trim()) return stored.trim()
  const n = parseLineItemFieldValue(row?.line_item ?? row?.lineItem)
  const num = n ?? (indexFallback > 0 ? Math.trunc(indexFallback) : 1)
  return buildLineItemId(mbaNumber || "", mediaTypeIdCode, num)
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

/**
 * Line id floor: per plan (MBA) and per media code, the highest line number
 * ever used by any version of the plan. A new line numbers above it, so a
 * deleted line's id never comes back on a different line.
 */
export type LineIdFloors = Record<string, number>

const KNOWN_MEDIA_CODES = new Set<string>(Object.values(MEDIA_TYPE_ID_CODES))

function floorKey(mbaNumber: string | null | undefined): string {
  return String(mbaNumber ?? "").trim().toLowerCase()
}

/**
 * Highest number per media code over `ids` for this MBA. Only ids shaped
 * `<mba><code><n>` count (case-insensitive). Other ids cannot collide with an
 * id minted for this MBA, so they are ignored.
 */
export function computeLineIdFloors(
  mbaNumber: string | null | undefined,
  ids: readonly (string | null | undefined)[],
): LineIdFloors {
  const mba = floorKey(mbaNumber)
  const floors: LineIdFloors = {}
  if (!mba) return floors
  for (const raw of ids) {
    if (raw == null) continue
    const id = String(raw).trim().toLowerCase()
    if (!id.startsWith(mba)) continue
    const m = id.slice(mba.length).match(/^([a-z]+)(\d+)$/)
    if (!m) continue
    const code = m[1].toUpperCase()
    if (!KNOWN_MEDIA_CODES.has(code)) continue
    const n = parseInt(m[2], 10)
    if (!Number.isFinite(n) || n <= 0) continue
    if (n > (floors[code] ?? 0)) floors[code] = n
  }
  return floors
}

const registeredFloors = new Map<string, LineIdFloors>()

/**
 * Record floors for a plan (editor load, save response). Merges by max, so a
 * floor never goes down in a session. Bad input is ignored.
 */
export function registerLineIdFloors(
  mbaNumber: string | null | undefined,
  floors: unknown,
): void {
  const key = floorKey(mbaNumber)
  if (!key || !floors || typeof floors !== "object") return
  const current = { ...(registeredFloors.get(key) ?? {}) }
  for (const [rawCode, rawValue] of Object.entries(floors as Record<string, unknown>)) {
    const code = String(rawCode).trim().toUpperCase()
    if (!KNOWN_MEDIA_CODES.has(code)) continue
    const n = Math.trunc(Number(rawValue))
    if (!Number.isFinite(n) || n <= 0) continue
    if (n > (current[code] ?? 0)) current[code] = n
  }
  registeredFloors.set(key, current)
}

/** Raise the floors to cover ids this session just saved. */
export function noteSavedLineItemIds(
  mbaNumber: string | null | undefined,
  ids: readonly (string | null | undefined)[],
): void {
  registerLineIdFloors(mbaNumber, computeLineIdFloors(mbaNumber, ids))
}

/** Highest number ever used for this plan and code. 0 when none is known. */
export function lineIdFloor(
  mbaNumber: string | null | undefined,
  mediaTypeIdCode: string,
): number {
  const key = floorKey(mbaNumber)
  if (!key) return 0
  return registeredFloors.get(key)?.[String(mediaTypeIdCode).toUpperCase()] ?? 0
}

/** Tests only. */
export function resetLineIdFloorsForTests(): void {
  registeredFloors.clear()
}
