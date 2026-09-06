/**
 * Deterministic publisher-profile proposal from an unmatched workbook.
 * Scores headers against AV canonicals / target-template labels — never a
 * per-publisher branch, never a live model call. The draft is display-only
 * until the planner confirms; load/accept must refuse unconfirmed drafts.
 */

import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"
import {
  parsePublisherProfile,
  type BookingStatus,
  type GridSemantics,
  type MediaAmountBasis,
  type MoneyRules,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"

export const UNCONFIRMED_PROFILE_REFUSE_MESSAGE =
  "Confirm the proposed profile field by field before loading. Nothing was written."

export const PROFILE_QUESTION_PREFIX = "ingest:profile:"

export type ProposedPublisherProfile = {
  draft: PublisherProfileConfig
  confirmed: boolean
}

export function hasUnconfirmedProposedProfile(review: {
  proposed_profile?: ProposedPublisherProfile | null
}): boolean {
  return review.proposed_profile?.confirmed === false
}

function norm(header: string): string {
  return header.replace(/\s+/g, " ").trim().toLowerCase()
}

function skipHeader(header: string): boolean {
  const n = norm(header)
  if (!n) return true
  if (n.startsWith("default ")) return true
  if (n.includes("guaranteed")) return true
  if (n.includes("approx")) return true
  if (n.includes("display weeks")) return true
  if (n.includes("screen minutes")) return true
  if (n.includes("quantity booked")) return true
  return false
}

type HeaderScore = { canonical: string; score: number }

function scoresFor(header: string): HeaderScore[] {
  const n = norm(header)
  const out: HeaderScore[] = []
  const add = (canonical: string, score: number) => {
    if (score > 0) out.push({ canonical, score })
  }

  if (/panel\s*#/.test(n) || /site\s*number/.test(n) || /^panel\s*(no|number)\b/.test(n)) {
    add("site_number", 10)
  }
  if (/panel\s*name/.test(n)) add("panel_name", 10)
  if (/village/.test(n)) add("village_name", 8)
  if (/suburb/.test(n)) add("suburb", 8)
  if (/^state$/.test(n) || /\bstate\b/.test(n)) add("state", 9)
  if (/^area$/.test(n) || /geography/.test(n)) add("geography", 8)
  if (/dimension/.test(n) || /^size$/.test(n)) add("size", 8)
  if (/^illumination$/.test(n)) add("illumination", 10)
  else if (/illumination/.test(n) && !/hours|operating|operation/.test(n)) {
    add("illumination", 8)
  }
  if (
    /operation hours|operating hours|illumination \(hours\)/.test(n)
  ) {
    add("digital_operating_hours", 10)
  }
  if (/rotation seconds|ad duration/.test(n)) add("rotation_seconds", 10)
  if (/share[- ]of[- ]time|share of time/.test(n)) add("advertiser_share", 10)
  if (/^direction$/.test(n)) add("direction", 10)
  if (/lunar/.test(n) && /rate/.test(n)) add("media_rate:lunar", 10)
  if (/weekly/.test(n) && /rate/.test(n)) add("media_rate:weekly", 10)
  if (/bought rate|media bought/.test(n)) add("media_rate:bought", 12)
  if (/production charge/.test(n) || /^prod$/.test(n)) {
    add("charge:production", 10)
  } else if (/^production$/.test(n)) {
    add("charge:production", 3)
  }
  if (/installation charge/.test(n) || /^install$/.test(n)) {
    add("charge:installation", 10)
  } else if (/minimum install/.test(n)) {
    add("charge:installation", 3)
  }
  if (/media value/.test(n) && /inc\.?\s*sta/.test(n)) {
    add("media_amount:stated", 12)
  } else if (/^client total$/.test(n)) {
    add("media_amount:stated", 9)
  } else if (/media value/.test(n) && !/guaranteed/.test(n)) {
    add("media_amount:stated", 6)
  }
  if (/^latitude$/.test(n)) add("latitude", 10)
  if (/^longitude$/.test(n)) add("longitude", 10)
  if (/qms format|publisher format/.test(n)) add("publisher_format_name", 10)
  if (/address/.test(n) || /pack details/.test(n)) {
    add("address_or_pack_details", 10)
  }
  if (/^postcode$/.test(n) || /^post code$/.test(n)) add("postcode", 10)
  if (/portrait|landscape|orientation/.test(n)) add("orientation", 10)
  if (/digital spec/.test(n)) add("digital_spec", 10)
  if (/^format$/.test(n)) add("format", 9)
  if (/^station$/.test(n) || /media schedule/.test(n)) add("station", 9)
  if (/^network$/.test(n)) add("network", 8)
  if (/media description/.test(n) || /^entitlement$/.test(n)) {
    add("media_description", 10)
  }
  if (/^daypart$/.test(n)) add("daypart", 10)
  if (/^length$/.test(n) || /^duration$/.test(n)) add("length", 9)
  if (/^buy type$/.test(n)) add("buy_type", 10)
  if (/^market$/.test(n) && !/rate/.test(n)) add("market", 8)
  return out
}

const MAP_SCORE_FLOOR = 7

function proposeColumnMap(headers: string[]): Record<string, string> {
  const claimed = new Map<string, { header: string; score: number }>()
  for (const header of headers) {
    if (skipHeader(header)) continue
    for (const { canonical, score } of scoresFor(header)) {
      const prev = claimed.get(canonical)
      if (!prev || score > prev.score) {
        claimed.set(canonical, { header, score })
      }
    }
  }
  const column_map: Record<string, string> = {}
  for (const [canonical, hit] of claimed) {
    if (hit.score >= MAP_SCORE_FLOOR) column_map[hit.header] = canonical
  }
  return column_map
}

function cellsMatching(
  matrix: string[][],
  test: (cell: string) => boolean,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of matrix) {
    for (const raw of row) {
      const cell = String(raw ?? "").replace(/\s+/g, " ").trim()
      if (!cell || seen.has(cell) || !test(cell)) continue
      seen.add(cell)
      out.push(cell)
    }
  }
  return out
}

function headerForCanonical(
  column_map: Record<string, string>,
  canonical: string,
): string | undefined {
  return Object.entries(column_map).find(([, v]) => v === canonical)?.[0]
}

function proposeMoneyRules(
  matrix: string[][],
  column_map: Record<string, string>,
): MoneyRules {
  const statedLabels = cellsMatching(matrix, (c) =>
    /^total media investment/i.test(c),
  )
  const subtotalLabels = cellsMatching(matrix, (c) =>
    /^media investment\s*\(ex\.?\s*p&i\)\s*:?\s*$/i.test(c),
  )
  const bought = headerForCanonical(column_map, "media_rate:bought")
  const weekly = headerForCanonical(column_map, "media_rate:weekly")
  const lunar = headerForCanonical(column_map, "media_rate:lunar")
  const statedCol =
    headerForCanonical(column_map, "media_amount:stated") ?? bought

  let basis: MediaAmountBasis | undefined
  if (bought) basis = "line_total"
  else if (weekly) basis = "weekly_rate"
  else if (lunar) basis = "lunar_rate"
  else if (statedCol) basis = "line_total"

  const statedLabel =
    statedLabels.find((l) => /ex\.?\s*p&i/i.test(l)) ?? statedLabels[0]
  const subtotal =
    subtotalLabels.find((l) => l.endsWith(":")) ?? subtotalLabels[0]

  const out: MoneyRules = {}
  if (basis) out.media_amount_basis = basis
  if (statedLabel || bought) {
    out.stated_total = {
      label: statedLabel ?? "",
      ...(bought ? { column: bought } : {}),
    }
  }
  if (subtotal) out.section_subtotal = { label: subtotal }
  if (statedCol) out.rate_card = { column: statedCol }
  return out
}

const LEGEND_BY_CODE: Record<string, BookingStatus> = {
  p: "paid",
  b: "bonus",
  sta: "bonus_display",
  "c/c": "unavailable",
  "n/a": "unavailable",
  na: "unavailable",
}

function proposeLegendAndGrid(matrix: string[][]): {
  grid_semantics: GridSemantics
  legend_map: Record<string, BookingStatus>
} {
  const legend_map: Record<string, BookingStatus> = {}
  const found = new Set<string>()
  for (const row of matrix) {
    for (const raw of row) {
      const cell = String(raw ?? "").trim()
      if (!cell) continue
      const key = cell.toLowerCase()
      const status = LEGEND_BY_CODE[key]
      if (!status) continue
      const store = cell === cell.toUpperCase() || cell.includes("/") ? cell : cell
      // Preserve the file's canonical casing for known codes.
      const display =
        key === "p"
          ? "p"
          : key === "b"
            ? "B"
            : key === "sta"
              ? "STA"
              : key === "c/c"
                ? "C/C"
                : key === "n/a" || key === "na"
                  ? "N/A"
                  : store
      if (found.has(display)) continue
      found.add(display)
      legend_map[display] = status
    }
  }
  const grid_semantics: GridSemantics =
    Object.keys(legend_map).length > 0 ? "status_matrix" : "count"
  return { grid_semantics, legend_map }
}

function pickPrimary(shapes: DetectedSheetShape[]): DetectedSheetShape | null {
  let top: DetectedSheetShape | null = null
  for (const shape of shapes) {
    if (!top || shape.line_item_sheet_confidence > top.line_item_sheet_confidence) {
      top = shape
    }
  }
  return top
}

function inferMediaType(
  column_map: Record<string, string>,
  headers: string[],
): string {
  const canons = new Set(Object.values(column_map))
  const hay = headers.map(norm).join(" | ")
  let ooh = 0
  let radio = 0
  if (canons.has("site_number") || canons.has("panel_name")) ooh += 2
  if (canons.has("illumination") || canons.has("village_name")) ooh += 1
  if (canons.has("latitude") || canons.has("publisher_format_name")) ooh += 2
  if (/panel\s*#|ooh|street furniture|large format/.test(hay)) ooh += 1
  if (canons.has("station") || canons.has("daypart")) radio += 2
  if (canons.has("media_description") || canons.has("length")) radio += 1
  if (/media schedule|daypart|entitlement/.test(hay)) radio += 1
  if (radio > ooh && radio >= 2) return "radio"
  return "ooh"
}

function inferGroupingKeys(
  mediaType: string,
  column_map: Record<string, string>,
): string[] {
  const canons = new Set(Object.values(column_map))
  if (mediaType === "radio") {
    const keys = ["station", "media_description"]
    if (canons.has("daypart")) keys.push("daypart")
    else if (canons.has("length")) keys.push("length")
    return keys
  }
  if (canons.has("publisher_format_name") || canons.has("latitude")) {
    return ["format", "state"]
  }
  return ["format", "market"]
}

function distinctiveHeaders(mappedHeaders: string[]): string[] {
  const preferred = mappedHeaders.filter((h) =>
    /panel\s*#|panel name|rotation seconds|qms format|latitude|media schedule|daypart/i.test(
      h,
    ),
  )
  return (preferred.length >= 3 ? preferred : mappedHeaders).slice(0, 5)
}

export function proposePublisherProfileFromShapes(
  shapes: DetectedSheetShape[],
): PublisherProfileConfig {
  const primary = pickPrimary(shapes)
  const headers = primary?.descriptor_columns.map((d) => d.header) ?? []
  const matrix = primary?.matrix ?? []
  const column_map = proposeColumnMap(headers)
  const money_rules = proposeMoneyRules(matrix, column_map)
  const { grid_semantics, legend_map } = proposeLegendAndGrid(matrix)
  const media_type = inferMediaType(column_map, headers)
  const grouping_keys = inferGroupingKeys(media_type, column_map)
  const header_text_includes = distinctiveHeaders(Object.keys(column_map))
  const radioGrid: GridSemantics =
    media_type === "radio" ? "count" : grid_semantics

  return parsePublisherProfile({
    publisher_name: "proposed",
    publisher_id: null,
    media_type,
    active: true,
    detect_signature: {
      header_text_includes,
      legend_codes: Object.keys(legend_map),
      grouping_keys,
    },
    grouping_keys,
    line_granularity: "per_row",
    column_map,
    grid_semantics: radioGrid,
    legend_map: media_type === "radio" ? {} : legend_map,
    sheet_rules: [
      {
        match: { any_line_item_sheet: true },
        role: "line_items",
        default_booking_status: "paid",
      },
    ],
    money_rules,
    notes: null,
  })
}
