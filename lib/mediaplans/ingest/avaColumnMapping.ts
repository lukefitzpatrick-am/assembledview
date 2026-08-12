/**
 * AVA column-mapping proposals for ingest (MR-5).
 * Mapping only — never parses values, computes bursts, or picks grid_semantics.
 * Never auto-applies; human Accept/Override writes via persistColumnRemap.
 */

import type Anthropic from "@anthropic-ai/sdk"
import { AVA_MODEL, getAnthropicClient } from "@/lib/ava/anthropic"
import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"

/** Publisher match confidence at/above this → deterministic mapping wins; no AVA. */
export const AVA_MAPPING_CONFIDENCE_FLOOR = 0.9

/** Canonical panel / line descriptors AVA may propose (not grid/money semantics). */
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

export type AvaMappingClient = {
  proposeMappings: (args: {
    publisherName: string | null
    targets: readonly string[]
    columns: UnmappedColumnSample[]
  }) => Promise<AvaColumnMappingProposal[]>
}

export function shouldCallAvaForMappings(args: {
  publisherConfidence: number
  unmappedHeaders: string[]
}): boolean {
  if (args.publisherConfidence >= AVA_MAPPING_CONFIDENCE_FLOOR) {
    return false
  }
  return args.unmappedHeaders.length > 0
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

const EMIT_TOOL_NAME = "emit_column_mapping_proposals"

const EMIT_TOOL: Anthropic.Tool = {
  name: EMIT_TOOL_NAME,
  description:
    "Propose canonical descriptor mappings for unmapped publisher columns. Mapping only.",
  input_schema: {
    type: "object",
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            header: { type: "string" },
            proposed_mapped_to: {
              type: ["string", "null"],
              description:
                "One of the target descriptors, or null to leave unmapped",
            },
            reasoning: { type: "string" },
          },
          required: ["header", "proposed_mapped_to", "reasoning"],
        },
      },
    },
    required: ["proposals"],
  },
}

function buildSystemPrompt(targets: readonly string[]): string {
  return [
    "You propose column mappings for publisher media schedules.",
    "You ONLY map header → canonical descriptor. You do NOT parse cell values into numbers,",
    "compute bursts, invent dates, or decide grid_semantics.",
    "If a column is clearly a rate/money/charge field, propose proposed_mapped_to=null",
    "and explain that it stays unmapped (spend stays on bursts/line items).",
    `Allowed targets: ${targets.join(", ")}.`,
    "Return proposals via the emit_column_mapping_proposals tool only.",
  ].join(" ")
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

/** Live Anthropic client — mapping proposals only. */
export function createAnthropicAvaMappingClient(): AvaMappingClient {
  return {
    async proposeMappings({ publisherName, targets, columns }) {
      if (columns.length === 0) return []
      const client = getAnthropicClient()
      const userPayload = {
        publisher: publisherName,
        target_descriptors: targets,
        unmapped_columns: columns,
        instruction:
          "Propose mapped_to for each unmapped column. Mapping only — no value parsing.",
      }
      const response = await client.messages.create({
        model: AVA_MODEL,
        max_tokens: 2048,
        system: buildSystemPrompt(targets),
        tools: [EMIT_TOOL],
        tool_choice: { type: "tool", name: EMIT_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: JSON.stringify(userPayload),
          },
        ],
      })
      const toolBlock = response.content.find(
        (b) => b.type === "tool_use" && b.name === EMIT_TOOL_NAME,
      )
      const input =
        toolBlock && toolBlock.type === "tool_use" ? toolBlock.input : null
      return parseToolProposals(input, columns)
    },
  }
}

/**
 * Run AVA mapping proposals when the gate opens.
 * Returns call_count 0 when skipped (high confidence or nothing unmapped).
 */
export async function runAvaColumnMappingProposals(args: {
  publisherName: string | null
  publisherConfidence: number
  unmappedHeaders: string[]
  shape: DetectedSheetShape | null
  client?: AvaMappingClient | null
}): Promise<{
  proposals: AvaColumnMappingProposal[]
  ava_call_count: number
}> {
  const empty = { proposals: [] as AvaColumnMappingProposal[], ava_call_count: 0 }
  if (
    !shouldCallAvaForMappings({
      publisherConfidence: args.publisherConfidence,
      unmappedHeaders: args.unmappedHeaders,
    })
  ) {
    return empty
  }
  if (!args.shape || args.unmappedHeaders.length === 0) return empty

  const columns = buildUnmappedColumnSamples(args.shape, args.unmappedHeaders)
  const client = args.client !== undefined ? args.client : createAnthropicAvaMappingClient()
  if (!client) return empty
  const proposals = await client.proposeMappings({
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
