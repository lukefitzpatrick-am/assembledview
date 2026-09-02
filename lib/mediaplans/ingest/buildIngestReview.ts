/**
 * Build the human review package for a publisher schedule upload (MR-4).
 */

import ExcelJS from "exceljs"
import {
  detectSheetShape,
  type DetectedSheetShape,
} from "@/lib/mediaplans/ingest/detectShape"
import { pickBestProfile } from "@/lib/mediaplans/ingest/matchProfile"
import { isUnknownPublisherMatch } from "@/lib/mediaplans/ingest/unknownPublisher"
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
import { overlayMoneySynonyms } from "@/lib/mediaplans/ingest/moneySynonyms"
import {
  applyFieldDefaultsToProposal,
  attachControlledResolutions,
  evaluateTemplateCoverage,
  type TemplateCoverage,
} from "@/lib/mediaplans/ingest/templateCoverage"

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
  /** Identifying labels from unparsed leftover rows (never a silent count). */
  rows_unparsed_labels: string[]
  columns_unmapped: string[]
  /** Human-readable counts — must be non-empty when anything was ignored. */
  spoken: string[]
}

export type MediaTypeStatus = "detected" | "ambiguous" | "unknown"

export type BuildIngestReviewOptions = {
  /** Injectable AVA mapping client (tests). Omit → no live Anthropic (API route owns that). */
  avaMappingClient?: AvaMappingClient | null
  /** When true, skip AVA entirely (deterministic-only review). */
  skipAva?: boolean
  sourceFileName?: string | null
  /** After a human catalogue pick — use this profile, never re-guess. */
  pinnedPublisherName?: string | null
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
   * AVA mapping proposals (required field unmatched + leftover headers only).
   * Never auto-applied — human Accept/Override writes via remap.
   */
  ava_mapping_proposals: AvaColumnMappingProposal[]
  /** Anthropic invocations for this review (0 when required coverage is complete). */
  ava_call_count: number
  /** Leftover headers + sample cells for POST /api/admin/ingest/ava-mapping. */
  unmapped_column_samples: UnmappedColumnSample[]
  /** Template-first field coverage (Section A / completeness). */
  template_coverage: TemplateCoverage | null
  detected_media_type: string | null
  media_type_status: MediaTypeStatus
  /**
   * True when detect confidence is below UNKNOWN_PUBLISHER_CONFIDENCE (or no
   * profile). UI must ask which catalogue publisher — never guess.
   */
  needs_catalogue_choice: boolean
  source_file_name: string | null
  /**
   * Chat-side session for confirm-then-ask (MBA pick + answered cards).
   * Lives on the staged package so it survives overlay persist without a migration.
   */
  ava_chat?: {
    selectedMbaNumber?: string | null
    answers?: Record<string, string>
    emittedQuestionIds?: string[]
  }
  /** All sheet shapes for debugging / multi-sheet accept later. */
  sheets: Array<{
    sheet_name: string
    line_item_sheet_confidence: number
    is_line_items: boolean
    proposal: IngestProposal | null
  }>
}

function mediaTypeStatusFor(profile: PublisherProfileConfig | null): {
  detected_media_type: string | null
  media_type_status: MediaTypeStatus
} {
  const raw = profile?.media_type?.trim().toLowerCase() ?? ""
  if (!profile || !raw) {
    return { detected_media_type: null, media_type_status: "unknown" }
  }
  if (raw === "ooh" || raw === "radio") {
    return { detected_media_type: raw, media_type_status: "detected" }
  }
  return { detected_media_type: raw, media_type_status: "ambiguous" }
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

/** First letter-bearing cell on an unparsed leftover row — extracted, never invented. */
export function labelUnparsedRows(shape: DetectedSheetShape): {
  rowCount: number
  labels: string[]
} {
  const grouped = new Set(shape.grouping_rows)
  const data = new Set(shape.data_rows)
  const descCols = shape.descriptor_columns.map((d) => d.col)
  const labels: string[] = []
  const seen = new Set<string>()
  let rowCount = 0
  for (let r = shape.header_row + 1; r < shape.matrix.length; r++) {
    if (grouped.has(r) || data.has(r)) continue
    const row = shape.matrix[r]
    if (!row) continue
    let any = false
    for (let c = 1; c < row.length; c++) {
      if (row[c]) {
        any = true
        break
      }
    }
    if (!any) continue
    rowCount++
    const label = firstLetterCell(row, descCols)
    if (!label) continue
    const key = label.replace(/\s+/g, " ").trim().toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(label.replace(/\s+/g, " ").trim())
  }
  return { rowCount, labels }
}

function firstLetterCell(row: string[], preferredCols: number[]): string | null {
  const order = [
    ...preferredCols,
    ...row.map((_, c) => c).filter((c) => c > 0 && !preferredCols.includes(c)),
  ]
  for (const c of order) {
    const value = row[c]
    if (typeof value !== "string" && typeof value !== "number") continue
    const raw = String(value).replace(/\s+/g, " ").trim()
    if (raw && /[A-Za-z]/.test(raw) && raw !== "[object Object]") return raw
  }
  return null
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

  const labelled = primary
    ? labelUnparsedRows(primary)
    : { rowCount: 0, labels: [] as string[] }
  const rows_unparsed = labelled.rowCount
  const rows_unparsed_labels = labelled.labels

  const spoken: string[] = []
  if (sheets_skipped.length > 0) {
    spoken.push(
      `${sheets_skipped.length} sheet${sheets_skipped.length === 1 ? "" : "s"} skipped: ${sheets_skipped.join(", ")}`,
    )
  }
  if (rows_unparsed > 0) {
    const named =
      rows_unparsed_labels.length > 0
        ? `: ${rows_unparsed_labels.join(" / ")}`
        : ""
    spoken.push(
      `${rows_unparsed} row${rows_unparsed === 1 ? "" : "s"} unparsed${named}`,
    )
  }
  if (columns_unmapped.length > 0) {
    spoken.push(
      `${columns_unmapped.length} column${columns_unmapped.length === 1 ? "" : "s"} unmapped`,
    )
  }

  return {
    sheets_skipped,
    rows_unparsed,
    rows_unparsed_labels,
    columns_unmapped,
    spoken,
  }
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

  const pinnedName = options.pinnedPublisherName?.trim()
  if (pinnedName) {
    const pinned = profiles.find(
      (p) =>
        p.publisher_name.replace(/\s+/g, " ").trim().toLowerCase() ===
        pinnedName.replace(/\s+/g, " ").trim().toLowerCase(),
    )
    if (pinned) {
      let top: DetectedSheetShape | null = best?.shape ?? null
      let topScore = -1
      for (const s of allShapes) {
        const m = pickBestProfile([pinned], s)
        const score =
          (m?.confidence ?? 0) * 0.7 + s.line_item_sheet_confidence * 0.3
        if (score > topScore) {
          topScore = score
          top = s
        }
      }
      best = {
        shape: top ?? allShapes[0]!,
        match: {
          profile: pinned,
          confidence: 1,
          reasons: ["human catalogue pick"],
        },
      }
    }
  }

  const unknown =
    !pinnedName && isUnknownPublisherMatch(best?.match ?? null)

  const profileMatch = unknown ? null : (best?.match?.profile ?? null)
  const primary = unknown ? null : (best?.shape ?? null)
  const profile =
    profileMatch && primary
      ? overlayMoneySynonyms(profileMatch, primary)
      : profileMatch
  let publisher_confidence = best?.match?.confidence ?? 0
  const column_mapping =
    primary && profile ? buildColumnMapping(primary, profile) : []

  let proposal =
    primary && profile ? proposeLineItemsFromSheet(primary, profile) : null
  if (proposal && profile) {
    proposal = applyFieldDefaultsToProposal(proposal, profile)
  }

  const media = mediaTypeStatusFor(unknown ? null : profile)
  let template_coverage: TemplateCoverage | null = null
  if (!unknown && profile && media.detected_media_type) {
    try {
      template_coverage = evaluateTemplateCoverage({
        mediaType: media.detected_media_type,
        profile,
        shape: primary,
        proposal,
      })
      const attached = await attachControlledResolutions({
        coverage: template_coverage,
        mediaType: media.detected_media_type,
        profile,
        proposal,
      })
      template_coverage = attached.coverage
      proposal = attached.proposal
      publisher_confidence = Math.max(
        publisher_confidence,
        template_coverage.completeness,
      )
    } catch {
      template_coverage = null
    }
  }

  const lineShapes =
    profile != null
      ? allShapes.filter((s) => sheetIsLineItems(profile, s.sheet_name))
      : []
  const sampleShapes =
    lineShapes.length > 0 ? lineShapes : primary ? [primary] : []

  const leftoverHeaders =
    template_coverage?.not_used.map((n) => n.header) ?? []
  const rawSamples: UnmappedColumnSample[] = []
  if (profile && leftoverHeaders.length > 0) {
    for (const shape of sampleShapes) {
      rawSamples.push(
        ...buildUnmappedColumnSamples(shape, leftoverHeaders),
      )
    }
  } else if (profile && !template_coverage) {
    for (const shape of sampleShapes) {
      const um = unmappedHeaders(
        profile,
        shape.descriptor_columns.map((d) => d.header),
      )
      rawSamples.push(...buildUnmappedColumnSamples(shape, um))
    }
  }
  const unmapped_column_samples = dedupeUnmappedColumnSamples(rawSamples)

  const ignored = buildIgnoredSummary({
    allShapes,
    profile,
    primary,
    column_mapping,
    columns_unmapped:
      leftoverHeaders.length > 0
        ? leftoverHeaders
        : unmapped_column_samples.map((c) => c.header),
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
    const unmatchedRequired =
      template_coverage?.required.filter((f) => !f.matched) ?? []
    const ava = await runAvaColumnMappingProposals({
      publisherName: profile?.publisher_name ?? null,
      publisherConfidence: publisher_confidence,
      unmatchedRequired,
      leftoverHeaders:
        leftoverHeaders.length > 0
          ? leftoverHeaders
          : unmapped_column_samples.map((c) => c.header),
      unmappedHeaders: unmapped_column_samples.map((c) => c.header),
      columns: unmapped_column_samples,
      client: options.avaMappingClient ?? null,
    })
    ava_mapping_proposals = ava.proposals
    ava_call_count = ava.ava_call_count
  }

  return {
    detected_publisher: unknown ? null : (profile?.publisher_name ?? null),
    publisher_confidence,
    match_reasons: best?.match?.reasons ?? [],
    profile: unknown ? null : profile,
    sheet_name: primary?.sheet_name ?? null,
    column_mapping,
    proposal: unknown ? null : proposal,
    ignored,
    ava_mapping_proposals,
    ava_call_count,
    unmapped_column_samples,
    template_coverage: unknown ? null : template_coverage,
    detected_media_type: media.detected_media_type,
    media_type_status: unknown ? "unknown" : media.media_type_status,
    needs_catalogue_choice: unknown,
    source_file_name: options.sourceFileName ?? null,
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
