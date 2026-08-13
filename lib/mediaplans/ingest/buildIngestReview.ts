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
  buildUnmappedColumnSamples,
  dedupeUnmappedColumnSamples,
  runAvaColumnMappingProposals,
  type AvaColumnMappingProposal,
  type AvaMappingClient,
  type UnmappedColumnSample,
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
  /** Sheet this header was observed on (review UI key disambiguation). */
  sheetName?: string | null
}

/** Stable React key: sheet + header, with index as a backstop for repeats. */
export { ingestMappingRowKey } from "@/lib/mediaplans/ingest/avaColumnMapping"

export type IgnoredSummary = {
  sheets_skipped: string[]
  rows_unparsed: number
  columns_unmapped: string[]
  /** Human-readable counts — must be non-empty when anything was ignored. */
  spoken: string[]
}

export type BuildIngestReviewOptions = {
  /** Injectable AVA mapping client (tests). Omit → no live Anthropic (API route owns that). */
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
  /** Unmapped headers + sample cells for POST /api/admin/ingest/ava-mapping. */
  unmapped_column_samples: UnmappedColumnSample[]
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
      sheetName: shape.sheet_name,
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
  /** Unique unmapped headers (already deduped). Overrides column_mapping when set. */
  columns_unmapped?: string[]
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

  const columns_unmapped =
    args.columns_unmapped ??
    dedupeUnmappedColumnSamples(
      column_mapping
        .filter((c) => c.unmapped)
        .map((c) => ({ header: c.header, sample_values: [] })),
    ).map((c) => c.header)

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

  const lineShapes =
    profile != null
      ? allShapes.filter((s) => sheetIsLineItems(profile, s.sheet_name))
      : []
  const sampleShapes =
    lineShapes.length > 0 ? lineShapes : primary ? [primary] : []

  const rawSamples: UnmappedColumnSample[] = []
  if (profile) {
    for (const shape of sampleShapes) {
      const um = unmappedHeaders(
        profile,
        shape.descriptor_columns.map((d) => d.header),
      )
      rawSamples.push(...buildUnmappedColumnSamples(shape, um))
    }
  }
  const unmapped_column_samples =
    dedupeUnmappedColumnSamples(rawSamples)

  const ignored = buildIgnoredSummary({
    allShapes,
    profile,
    primary,
    column_mapping,
    columns_unmapped: unmapped_column_samples.map((c) => c.header),
  })

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
      unmappedHeaders: unmapped_column_samples.map((c) => c.header),
      columns: unmapped_column_samples,
      client: options.avaMappingClient ?? null,
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
    unmapped_column_samples,
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
