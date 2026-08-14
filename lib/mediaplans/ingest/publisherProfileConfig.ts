/**
 * Publisher schedule profiles — configuration only.
 * Mapping lives in publisher_profiles rows / seed JSON, not in TypeScript branches
 * per publisher. Code only interprets the config shape.
 */

export const GRID_SEMANTICS = ["status_matrix", "count", "currency"] as const
export type GridSemantics = (typeof GRID_SEMANTICS)[number]

/** How buy rows become line items. Seeded publishers are all `per_row`. */
export const LINE_GRANULARITIES = ["per_row", "grouped"] as const
export type LineGranularity = (typeof LINE_GRANULARITIES)[number]

/** Acknowledged non-imported column — not unmapped, never sent to AVA. */
export const REFERENCE_IGNORE_TARGET = "reference:ignore"

export function isReferenceIgnoreTarget(canon: string): boolean {
  return canon === REFERENCE_IGNORE_TARGET
}

export const BOOKING_STATUSES = [
  "paid",
  "bonus",
  "bonus_display",
  "unavailable",
] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

export type LegendResolution = BookingStatus | "unmapped"

export type SheetRole = "line_items" | "ignore"

export type SheetMatch =
  | { name_includes: string }
  | { name_equals: string }
  | { any_line_item_sheet: true }

export type SheetRule = {
  match: SheetMatch
  role: SheetRole
  default_booking_status?: BookingStatus
}

export type PublisherProfileConfig = {
  publisher_name: string
  /** Catalogue `publishers.id` (0036). Null on seed until joined. */
  publisher_id: number | null
  media_type: string
  active: boolean
  detect_signature: Record<string, unknown>
  /**
   * `per_row` (default): each classified buy row is one line.
   * `grouped`: collapse by grouping_keys (retained for a future publisher
   * whose file is not row-per-buy — no seeded profile uses it).
   */
  line_granularity: LineGranularity
  /** Canonical field names used to group panels into line items when grouped. */
  grouping_keys: string[]
  column_map: Record<string, string>
  grid_semantics: GridSemantics
  legend_map: Record<string, BookingStatus>
  sheet_rules: SheetRule[]
  notes: string | null
}

/** Burst-facing interpretation of one grid cell under a profile. */
export type GridBurstOutput = {
  raw: string
  grid_semantics: GridSemantics
  booking_status: LegendResolution
  /** Spot / unit count — used when grid_semantics is `count`. */
  quantity: number | null
  /** Whether the cell books presence — used when grid_semantics is `status_matrix`. */
  present: boolean | null
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

function asStringRecord(v: unknown, field: string): Record<string, string> {
  if (!isObject(v)) throw new Error(`${field} must be an object`)
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v)) {
    if (typeof val !== "string") {
      throw new Error(`${field}.${k} must be a string`)
    }
    out[k] = val
  }
  return out
}

function parseLegendMap(v: unknown): Record<string, BookingStatus> {
  const raw = asStringRecord(v ?? {}, "legend_map")
  const out: Record<string, BookingStatus> = {}
  for (const [k, val] of Object.entries(raw)) {
    if (!(BOOKING_STATUSES as readonly string[]).includes(val)) {
      throw new Error(`legend_map.${k} has invalid booking status ${val}`)
    }
    out[k] = val as BookingStatus
  }
  return out
}

function parseSheetRules(v: unknown): SheetRule[] {
  if (!Array.isArray(v)) throw new Error("sheet_rules must be an array")
  return v.map((rule, i) => {
    if (!isObject(rule)) throw new Error(`sheet_rules[${i}] must be an object`)
    const match = rule.match
    if (!isObject(match)) throw new Error(`sheet_rules[${i}].match required`)
    const role = rule.role
    if (role !== "line_items" && role !== "ignore") {
      throw new Error(`sheet_rules[${i}].role must be line_items|ignore`)
    }
    let default_booking_status: BookingStatus | undefined
    if (rule.default_booking_status != null) {
      if (
        !(BOOKING_STATUSES as readonly string[]).includes(
          String(rule.default_booking_status),
        )
      ) {
        throw new Error(`sheet_rules[${i}].default_booking_status invalid`)
      }
      default_booking_status = rule.default_booking_status as BookingStatus
    }
    return {
      match: match as SheetMatch,
      role,
      default_booking_status,
    }
  })
}

/**
 * Parse a DB row or seed object into a validated profile config.
 * Throws on invalid grid_semantics / legend / sheet_rules — never silently coerces.
 */
export function parsePublisherProfile(input: unknown): PublisherProfileConfig {
  if (!isObject(input)) throw new Error("profile must be an object")
  const publisher_name = String(input.publisher_name ?? "").trim()
  if (!publisher_name) throw new Error("publisher_name required")
  const media_type = String(input.media_type ?? "").trim()
  if (!media_type) throw new Error("media_type required")
  const grid_semantics = String(input.grid_semantics ?? "")
  if (!(GRID_SEMANTICS as readonly string[]).includes(grid_semantics)) {
    throw new Error(
      `grid_semantics must be one of ${GRID_SEMANTICS.join(",")}`,
    )
  }
  const notes =
    input.notes == null || input.notes === ""
      ? null
      : String(input.notes)
  const rawPublisherId = input.publisher_id
  const publisher_id =
    rawPublisherId == null || rawPublisherId === ""
      ? null
      : Number.isFinite(Number(rawPublisherId))
        ? Number(rawPublisherId)
        : null

  const detect_signature = isObject(input.detect_signature)
    ? (input.detect_signature as Record<string, unknown>)
    : {}

  let grouping_keys: string[] = []
  if (Array.isArray(input.grouping_keys)) {
    grouping_keys = input.grouping_keys.map((k) => String(k))
  } else if (Array.isArray(detect_signature.grouping_keys)) {
    grouping_keys = (detect_signature.grouping_keys as unknown[]).map((k) =>
      String(k),
    )
  }

  const rawGranularity =
    input.line_granularity == null || input.line_granularity === ""
      ? "per_row"
      : String(input.line_granularity).trim()
  if (!(LINE_GRANULARITIES as readonly string[]).includes(rawGranularity)) {
    throw new Error(
      `line_granularity must be one of ${LINE_GRANULARITIES.join(",")}`,
    )
  }

  return {
    publisher_name,
    publisher_id,
    media_type,
    active: Boolean(input.active ?? true),
    detect_signature,
    line_granularity: rawGranularity as LineGranularity,
    grouping_keys,
    column_map: asStringRecord(input.column_map ?? {}, "column_map"),
    grid_semantics: grid_semantics as GridSemantics,
    legend_map: parseLegendMap(input.legend_map),
    sheet_rules: parseSheetRules(input.sheet_rules ?? []),
    notes,
  }
}

/** Serialize for JSON / jsonb round-trip (stable key order not required). */
export function serializePublisherProfile(
  profile: PublisherProfileConfig,
): Record<string, unknown> {
  return {
    publisher_name: profile.publisher_name,
    publisher_id: profile.publisher_id,
    media_type: profile.media_type,
    active: profile.active,
    detect_signature: {
      ...profile.detect_signature,
      grouping_keys: profile.grouping_keys,
    },
    line_granularity: profile.line_granularity,
    grouping_keys: profile.grouping_keys,
    column_map: profile.column_map,
    grid_semantics: profile.grid_semantics,
    legend_map: profile.legend_map,
    sheet_rules: profile.sheet_rules,
    notes: profile.notes,
  }
}

/** Resolve a legend letter via profile config — unknown → `unmapped` (never default paid). */
export function resolveLegendStatus(
  legendMap: Record<string, BookingStatus>,
  raw: string,
): LegendResolution {
  const key = String(raw ?? "").trim()
  if (!key) return "unmapped"
  if (Object.prototype.hasOwnProperty.call(legendMap, key)) {
    return legendMap[key]!
  }
  // Case-insensitive fallback still from config keys only — no invented statuses.
  const found = Object.entries(legendMap).find(
    ([k]) => k.toLowerCase() === key.toLowerCase(),
  )
  return found ? found[1] : "unmapped"
}

function parseQuantity(raw: string): number | null {
  const t = String(raw ?? "").trim()
  if (!t) return null
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Interpret one grid cell using only the profile's grid_semantics + legend_map.
 * Same raw cell under status_matrix vs count yields different burst outputs.
 */
export function interpretGridCell(
  profile: PublisherProfileConfig,
  rawCell: string,
): GridBurstOutput {
  const raw = String(rawCell ?? "").trim()
  const semantics = profile.grid_semantics

  if (semantics === "status_matrix") {
    const booking_status = resolveLegendStatus(profile.legend_map, raw)
    const present =
      booking_status === "paid" ||
      booking_status === "bonus" ||
      booking_status === "bonus_display"
    return {
      raw,
      grid_semantics: semantics,
      booking_status,
      quantity: null,
      present: raw ? present : false,
    }
  }

  if (semantics === "count") {
    const quantity = parseQuantity(raw)
    if (quantity == null) {
      // Non-numeric cells are not inventively treated as paid spots.
      return {
        raw,
        grid_semantics: semantics,
        booking_status: "unmapped",
        quantity: null,
        present: null,
      }
    }
    return {
      raw,
      grid_semantics: semantics,
      booking_status: "paid",
      quantity,
      present: null,
    }
  }

  // currency — parse as number; letters unmapped
  const quantity = parseQuantity(raw.replace(/[$,\s]/g, ""))
  if (quantity == null) {
    return {
      raw,
      grid_semantics: semantics,
      booking_status: "unmapped",
      quantity: null,
      present: null,
    }
  }
  return {
    raw,
    grid_semantics: semantics,
    booking_status: "paid",
    quantity,
    present: null,
  }
}

export function interpretGridCells(
  profile: PublisherProfileConfig,
  cells: string[],
): GridBurstOutput[] {
  return cells.map((c) => interpretGridCell(profile, c))
}

/** Headers present in a sheet that have no column_map entry (after trim). */
export function unmappedHeaders(
  profile: PublisherProfileConfig,
  headers: string[],
): string[] {
  const mapped = new Set(
    Object.keys(profile.column_map).map((k) =>
      k.replace(/\s+/g, " ").trim().toLowerCase(),
    ),
  )
  return headers
    .map((h) => h.replace(/\s+/g, " ").trim())
    .filter((h) => h.length > 0)
    .filter((h) => !mapped.has(h.toLowerCase()))
}

export function sheetIsLineItems(
  profile: PublisherProfileConfig,
  sheetName: string,
): boolean {
  const name = sheetName.trim()
  for (const rule of profile.sheet_rules) {
    const m = rule.match
    if ("name_includes" in m && name.includes(m.name_includes)) {
      return rule.role === "line_items"
    }
    if ("name_equals" in m && name === m.name_equals) {
      return rule.role === "line_items"
    }
  }
  for (const rule of profile.sheet_rules) {
    if ("any_line_item_sheet" in rule.match && rule.match.any_line_item_sheet) {
      return rule.role === "line_items"
    }
  }
  return false
}
