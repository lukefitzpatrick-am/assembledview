/**
 * Build the human review package for a publisher schedule upload (MR-4).
 */

import ExcelJS from "exceljs"
import {
  detectSheetShape,
  type DetectedSheetShape,
} from "@/lib/mediaplans/ingest/detectShape"
import { pickBestProfile } from "@/lib/mediaplans/ingest/matchProfile"
import {
  runAvaColumnMappingProposals,
  type AvaColumnMappingProposal,
  type AvaMappingClient,
} from "@/lib/mediaplans/ingest/avaColumnMapping"
import {
  proposeLineItemsFromSheet,
  type IngestProposal,
} from "@/lib/mediaplans/ingest/proposeLineItems"
import {
  sheetIsLineItems,
  unmappedHeaders,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"

export type ColumnMappingRow = {
  header: string
  mapped_to: string | null
  /** true when not in profile.column_map */
  unmapped: boolean
}

export type IgnoredSummary = {
  sheets_skipped: string[]
  rows_unparsed: number
  columns_unmapped: string[]
  /** Human-readable counts — must be non-empty when anything was ignored. */
  spoken: string[]
}

export type BuildIngestReviewOptions = {
  /** Injectable AVA mapping client (tests). Omit → live Anthropic when gated. */
  avaMappingClient?: AvaMappingClient | null
  /** When true, skip AVA entirely (deterministic-only review). */
  skipAva?: boolean
}

export type IngestReviewPackage = {
  detected_publisher: string | null
  publisher_confidence: number
  match_reasons: string[]
  profile: PublisherProfileConfig | null
  /** Primary line-item sheet under review. */
  sheet_name: string | null
  column_mapping: ColumnMappingRow[]
  proposal: IngestProposal | null
  ignored: IgnoredSummary
  /**
   * AVA mapping proposals (unmapped + publisher confidence < 90% only).
   * Never auto-applied — human Accept/Override writes via remap.
   */
  ava_mapping_proposals: AvaColumnMappingProposal[]
  /** Anthropic invocations for this review (0 when confidence ≥ 90%). */
  ava_call_count: number
  /** All sheet shapes for debugging / multi-sheet accept later. */
  sheets: Array<{
    sheet_name: string
    line_item_sheet_confidence: number
    is_line_items: boolean
    proposal: IngestProposal | null
  }>
}

function buildColumnMapping(
  shape: DetectedSheetShape,
  profile: PublisherProfileConfig,
): ColumnMappingRow[] {
  const byHeader = new Map(
    Object.entries(profile.column_map).map(([k, v]) => [
      k.replace(/\s+/g, " ").trim().toLowerCase(),
      v,
    ]),
  )
  return shape.descriptor_columns.map((d) => {
    const key = d.header.replace(/\s+/g, " ").trim().toLowerCase()
    const mapped_to = byHeader.get(key) ?? null
    return {
      header: d.header,
      mapped_to,
      unmapped: mapped_to == null,
    }
  })
}

function countUnparsedRows(shape: DetectedSheetShape): number {
  // Rows after header that are neither grouping nor data (blank / junk).
  let n = 0
  const grouped = new Set(shape.grouping_rows)
  const data = new Set(shape.data_rows)
  for (let r = shape.header_row + 1; r < shape.matrix.length; r++) {
    if (grouped.has(r) || data.has(r)) continue
    let any = false
    for (let c = 1; c < (shape.matrix[r]?.length ?? 0); c++) {
      if (shape.matrix[r]?.[c]) {
        any = true
        break
      }
    }
    if (any) n++
  }
  return n
}

export function buildIgnoredSummary(args: {
  allShapes: DetectedSheetShape[]
  profile: PublisherProfileConfig | null
  primary: DetectedSheetShape | null
  column_mapping: ColumnMappingRow[]
}): IgnoredSummary {
  const { allShapes, profile, primary, column_mapping } = args
  const sheets_skipped: string[] = []
  for (const s of allShapes) {
    if (!profile) {
      if (s.line_item_sheet_confidence < 0.5) {
        sheets_skipped.push(s.sheet_name)
      }
      continue
    }
    if (!sheetIsLineItems(profile, s.sheet_name)) {
      sheets_skipped.push(s.sheet_name)
    } else if (s.line_item_sheet_confidence < 0.4) {
      sheets_skipped.push(s.sheet_name)
    }
  }

  const columns_unmapped = column_mapping
    .filter((c) => c.unmapped)
    .map((c) => c.header)

  const rows_unparsed = primary ? countUnparsedRows(primary) : 0

  const spoken: string[] = []
  if (sheets_skipped.length > 0) {
    spoken.push(
      `${sheets_skipped.length} sheet${sheets_skipped.length === 1 ? "" : "s"} skipped: ${sheets_skipped.join(", ")}`,
    )
  }
  if (rows_unparsed > 0) {
    spoken.push(`${rows_unparsed} row${rows_unparsed === 1 ? "" : "s"} unparsed`)
  }
  if (columns_unmapped.length > 0) {
    spoken.push(
      `${columns_unmapped.length} column${columns_unmapped.length === 1 ? "" : "s"} unmapped`,
    )
  }

  return { sheets_skipped, rows_unparsed, columns_unmapped, spoken }
}

export async function buildIngestReviewFromBuffer(
  buffer: Buffer,
  profiles: PublisherProfileConfig[],
  options: BuildIngestReviewOptions = {},
): Promise<IngestReviewPackage> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const allShapes = wb.worksheets.map((ws) => detectSheetShape(ws))

  // Pick the best (profile, sheet) pair.
  let best: {
    shape: DetectedSheetShape
    match: ReturnType<typeof pickBestProfile>
  } | null = null

  for (const shape of allShapes) {
    const match = pickBestProfile(profiles, shape)
    if (!match) continue
    if (!best || match.confidence > (best.match?.confidence ?? 0)) {
      best = { shape, match }
    }
  }

  // Prefer a sheet that is line_items under the matched profile.
  if (best?.match) {
    const profile = best.match.profile
    const lineSheets = allShapes.filter((s) =>
      sheetIsLineItems(profile, s.sheet_name),
    )
    let top: DetectedSheetShape | null = null
    let topScore = -1
    for (const s of lineSheets) {
      const m = pickBestProfile([profile], s)
      const score =
        (m?.confidence ?? 0) * 0.7 + s.line_item_sheet_confidence * 0.3
      if (score > topScore) {
        topScore = score
        top = s
      }
    }
    if (top) best = { shape: top, match: best.match }
  }

  const profile = best?.match?.profile ?? null
  const primary = best?.shape ?? null
  const publisher_confidence = best?.match?.confidence ?? 0
  const column_mapping =
    primary && profile ? buildColumnMapping(primary, profile) : []

  const proposal =
    primary && profile ? proposeLineItemsFromSheet(primary, profile) : null

  const ignored = buildIgnoredSummary({
    allShapes,
    profile,
    primary,
    column_mapping,
  })

  // Also surface unmapped via helper for consistency
  if (primary && profile) {
    const um = unmappedHeaders(
      profile,
      primary.descriptor_columns.map((d) => d.header),
    )
    for (const h of um) {
      if (!ignored.columns_unmapped.includes(h)) {
        ignored.columns_unmapped.push(h)
      }
    }
  }

  const sheets = allShapes.map((s) => {
    const is_line_items = profile
      ? sheetIsLineItems(profile, s.sheet_name)
      : s.line_item_sheet_confidence >= 0.5
    return {
      sheet_name: s.sheet_name,
      line_item_sheet_confidence: s.line_item_sheet_confidence,
      is_line_items,
      proposal:
        is_line_items && profile
          ? proposeLineItemsFromSheet(s, profile)
          : null,
    }
  })

  let ava_mapping_proposals: AvaColumnMappingProposal[] = []
  let ava_call_count = 0
  if (!options.skipAva) {
    const ava = await runAvaColumnMappingProposals({
      publisherName: profile?.publisher_name ?? null,
      publisherConfidence: publisher_confidence,
      unmappedHeaders: ignored.columns_unmapped,
      shape: primary,
      client: options.avaMappingClient,
    })
    ava_mapping_proposals = ava.proposals
    ava_call_count = ava.ava_call_count
  }

  return {
    detected_publisher: profile?.publisher_name ?? null,
    publisher_confidence,
    match_reasons: best?.match?.reasons ?? [],
    profile,
    sheet_name: primary?.sheet_name ?? null,
    column_mapping,
    proposal,
    ignored,
    ava_mapping_proposals,
    ava_call_count,
    sheets,
  }
}

export async function buildIngestReviewFromFile(
  filePath: string,
  profiles: PublisherProfileConfig[],
  options: BuildIngestReviewOptions = {},
): Promise<IngestReviewPackage> {
  const fs = await import("node:fs/promises")
  const buf = await fs.readFile(filePath)
  return buildIngestReviewFromBuffer(Buffer.from(buf), profiles, options)
}
