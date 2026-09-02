/**
 * AVA column-mapping proposals for ingest (MR-5) — client-safe.
 * Types, gate, and pure shaping/validation only.
 * The Anthropic call lives in avaColumnMapping.server.ts and is reached via
 * POST /api/admin/ingest/ava-mapping. Never auto-applies.
 */

import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"

/** Publisher match confidence at/above this → deterministic mapping wins; no AVA. */
export const AVA_MAPPING_CONFIDENCE_FLOOR = 0.9

/**
 * Canonical descriptors AVA may propose. Includes buy type, typed money
 * targets, and reference:ignore. parseToolProposals drops anything else.
 */
export const AVA_MAPPING_TARGET_DESCRIPTORS = [
  "latitude",
  "longitude",
  "publisher_format_name",
  "state",
  "site_number",
  "address_or_pack_details",
  "suburb",
  "postcode",
  "direction",
  "geography",
  "format",
  "size",
  "orientation",
  "digital_spec",
  "illumination",
  "digital_operating_hours",
  "rotation_seconds",
  "advertiser_share",
  "panel_name",
  "village_name",
  "panel_weight",
  "station",
  "network",
  "media_description",
  "daypart",
  "market",
  "length",
  "duration",
  "buy_type",
  "media_amount:stated",
  "media_rate:weekly",
  "media_rate:lunar",
  "media_rate:per_spot",
  "charge:production",
  "charge:installation",
  "reference:ignore",
] as const

export type AvaMappingTarget = (typeof AVA_MAPPING_TARGET_DESCRIPTORS)[number]

export type AvaColumnMappingProposal = {
  header: string
  sample_values: string[]
  /** null = propose leave unmapped */
  proposed_mapped_to: string | null
  reasoning: string
}

export type UnmappedColumnSample = {
  header: string
  sample_values: string[]
}

/** Stable React key: sheet + header, with index as a backstop for repeats. */
export function ingestMappingRowKey(
  row: { header: string; sheetName?: string | null },
  index: number,
): string {
  return `${row.sheetName ?? ""}\u0000${row.header}\u0000${index}`
}

export type AvaMappingClient = {
  proposeMappings: (args: {
    publisherName: string | null
    targets: readonly string[]
    columns: UnmappedColumnSample[]
  }) => Promise<AvaColumnMappingProposal[]>
}

export type AvaMappingRequestBody = {
  publisherName: string | null
  publisherConfidence: number
  columns: UnmappedColumnSample[]
}

export type ParsedAvaMappingRequest =
  | {
      ok: true
      publisherName: string | null
      publisherConfidence: number
      columns: UnmappedColumnSample[]
      unmatchedRequired?: Array<{ id?: string; label?: string }>
      leftoverHeaders?: string[]
    }
  | { ok: false; error: string }

export function shouldCallAvaForMappings(args: {
  unmatchedRequired?: Array<{ id?: string; label?: string }>
  leftoverHeaders?: string[]
  publisherConfidence?: number
  unmappedHeaders?: string[]
}): boolean {
  const leftover = args.leftoverHeaders ?? args.unmappedHeaders ?? []
  if (args.unmatchedRequired !== undefined) {
    return args.unmatchedRequired.length > 0 && leftover.length > 0
  }
  if ((args.publisherConfidence ?? 0) >= AVA_MAPPING_CONFIDENCE_FLOOR) {
    return false
  }
  return leftover.length > 0
}

export function sampleValuesForHeader(
  shape: DetectedSheetShape,
  header: string,
  limit = 8,
): string[] {
  const col = shape.descriptor_columns.find(
    (d) =>
      d.header.replace(/\s+/g, " ").trim().toLowerCase() ===
      header.replace(/\s+/g, " ").trim().toLowerCase(),
  )
  if (!col) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of shape.data_rows) {
    const v = (shape.matrix[r]?.[col.col] ?? "").trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= limit) break
  }
  return out
}

export function buildUnmappedColumnSamples(
  shape: DetectedSheetShape,
  unmappedHeaders: string[],
): UnmappedColumnSample[] {
  return unmappedHeaders.map((header) => ({
    header,
    sample_values: sampleValuesForHeader(shape, header),
  }))
}

function headerKey(header: string): string {
  return header.replace(/\s+/g, " ").trim().toLowerCase()
}

/**
 * One row per header across sheets of the same upload.
 * Merges sample values (first spelling wins). Empty headers dropped.
 */
export function dedupeUnmappedColumnSamples(
  samples: UnmappedColumnSample[],
): UnmappedColumnSample[] {
  const byKey = new Map<string, UnmappedColumnSample>()
  for (const sample of samples) {
    const key = headerKey(sample.header)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      const seen = new Set<string>()
      const sample_values: string[] = []
      for (const v of sample.sample_values) {
        if (!v || seen.has(v)) continue
        seen.add(v)
        sample_values.push(v)
      }
      byKey.set(key, {
        header: sample.header.replace(/\s+/g, " ").trim(),
        sample_values,
      })
      continue
    }
    const seen = new Set(existing.sample_values)
    for (const v of sample.sample_values) {
      if (!v || seen.has(v)) continue
      seen.add(v)
      existing.sample_values.push(v)
    }
  }
  return [...byKey.values()]
}

function parseToolProposals(
  raw: unknown,
  columns: UnmappedColumnSample[],
): AvaColumnMappingProposal[] {
  const byHeader = new Map(
    columns.map((c) => [c.header.replace(/\s+/g, " ").trim().toLowerCase(), c]),
  )
  const targetSet = new Set(
    AVA_MAPPING_TARGET_DESCRIPTORS.map((t) => t.toLowerCase()),
  )
  const list =
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { proposals?: unknown }).proposals)
      ? ((raw as { proposals: unknown[] }).proposals)
      : []

  const out: AvaColumnMappingProposal[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const header = typeof o.header === "string" ? o.header.trim() : ""
    if (!header) continue
    const sample = byHeader.get(header.replace(/\s+/g, " ").trim().toLowerCase())
    let mapped: string | null =
      o.proposed_mapped_to == null || o.proposed_mapped_to === ""
        ? null
        : String(o.proposed_mapped_to).trim()
    if (mapped && !targetSet.has(mapped.toLowerCase())) {
      mapped = null
    }
    const reasoning =
      typeof o.reasoning === "string" && o.reasoning.trim()
        ? o.reasoning.trim()
        : "No reasoning provided"
    out.push({
      header: sample?.header ?? header,
      sample_values: sample?.sample_values ?? [],
      proposed_mapped_to: mapped,
      reasoning,
    })
  }

  // Ensure every requested column appears (fallback leave unmapped)
  for (const col of columns) {
    const key = col.header.replace(/\s+/g, " ").trim().toLowerCase()
    if (
      !out.some(
        (p) => p.header.replace(/\s+/g, " ").trim().toLowerCase() === key,
      )
    ) {
      out.push({
        header: col.header,
        sample_values: col.sample_values,
        proposed_mapped_to: null,
        reasoning: "AVA did not return a proposal for this column.",
      })
    }
  }
  return out
}

function parseUnmappedColumnSample(raw: unknown): UnmappedColumnSample | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (typeof o.header !== "string" || !o.header.trim()) return null
  const samples = Array.isArray(o.sample_values)
    ? o.sample_values.filter((v): v is string => typeof v === "string")
    : []
  return { header: o.header.trim(), sample_values: samples }
}

/** Validate the POST /api/admin/ingest/ava-mapping body. */
export function parseAvaMappingRequestBody(raw: unknown): ParsedAvaMappingRequest {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "JSON body required" }
  }
  const o = raw as Record<string, unknown>
  if (typeof o.publisherConfidence !== "number" || !Number.isFinite(o.publisherConfidence)) {
    return { ok: false, error: "publisherConfidence must be a number" }
  }
  if (!Array.isArray(o.columns)) {
    return { ok: false, error: "columns array required" }
  }
  const columns: UnmappedColumnSample[] = []
  for (const item of o.columns) {
    const col = parseUnmappedColumnSample(item)
    if (!col) {
      return { ok: false, error: "each column needs a header string" }
    }
    columns.push(col)
  }
  const deduped = dedupeUnmappedColumnSamples(columns)
  const publisherName =
    o.publisherName == null
      ? null
      : typeof o.publisherName === "string"
        ? o.publisherName.trim() || null
        : null
  const leftoverHeaders = Array.isArray(o.leftoverHeaders)
    ? o.leftoverHeaders.filter(
        (h): h is string => typeof h === "string" && h.trim().length > 0,
      )
    : undefined
  const unmatchedRequired = Array.isArray(o.unmatchedRequired)
    ? o.unmatchedRequired.flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const rec = item as Record<string, unknown>
        return [
          {
            id: typeof rec.id === "string" ? rec.id : undefined,
            label: typeof rec.label === "string" ? rec.label : undefined,
          },
        ]
      })
    : undefined
  return {
    ok: true,
    publisherName,
    publisherConfidence: o.publisherConfidence,
    columns: deduped,
    unmatchedRequired,
    leftoverHeaders,
  }
}

/**
 * Run AVA mapping proposals when the gate opens.
 * Live Anthropic is never constructed here — inject a client (tests) or call
 * the server module from the API route.
 * Returns call_count 0 when skipped (high confidence, nothing unmapped, or no client).
 */
export async function runAvaColumnMappingProposals(args: {
  publisherName: string | null
  publisherConfidence: number
  unmappedHeaders?: string[]
  unmatchedRequired?: Array<{ id?: string; label?: string }>
  leftoverHeaders?: string[]
  shape?: DetectedSheetShape | null
  columns?: UnmappedColumnSample[]
  client?: AvaMappingClient | null
}): Promise<{
  proposals: AvaColumnMappingProposal[]
  ava_call_count: number
}> {
  const empty = { proposals: [] as AvaColumnMappingProposal[], ava_call_count: 0 }
  const columns = dedupeUnmappedColumnSamples(
    args.columns ??
      (args.shape && args.unmappedHeaders
        ? buildUnmappedColumnSamples(args.shape, args.unmappedHeaders)
        : []),
  )
  const unmappedHeaders = dedupeUnmappedColumnSamples(
    (args.unmappedHeaders ?? columns.map((c) => c.header)).map((header) => ({
      header,
      sample_values: [],
    })),
  ).map((c) => c.header)
  if (
    !shouldCallAvaForMappings({
      publisherConfidence: args.publisherConfidence,
      unmappedHeaders,
      unmatchedRequired: args.unmatchedRequired,
      leftoverHeaders: args.leftoverHeaders ?? unmappedHeaders,
    })
  ) {
    return empty
  }
  if (columns.length === 0) return empty
  if (!args.client) return empty
  const proposals = await args.client.proposeMappings({
    publisherName: args.publisherName,
    targets: AVA_MAPPING_TARGET_DESCRIPTORS,
    columns,
  })
  return { proposals, ava_call_count: 1 }
}

/** Test helper: parse tool payload without network. */
export function parseAvaMappingToolInputForTest(
  raw: unknown,
  columns: UnmappedColumnSample[],
): AvaColumnMappingProposal[] {
  return parseToolProposals(raw, columns)
}

export { parseToolProposals }
