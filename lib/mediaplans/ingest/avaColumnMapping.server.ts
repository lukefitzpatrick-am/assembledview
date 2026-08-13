/**
 * Server-only AVA column-mapping: one batched Anthropic call.
 * Mapping only — never parses values, computes bursts, or picks grid_semantics.
 * Never auto-applies; human Accept/Override writes via persistColumnRemap.
 */
import "server-only"

import type Anthropic from "@anthropic-ai/sdk"
import { AVA_MODEL, getAnthropicClient } from "@/lib/ava/anthropic"
import {
  AVA_MAPPING_TARGET_DESCRIPTORS,
  parseToolProposals,
  runAvaColumnMappingProposals,
  type AvaMappingClient,
  type AvaColumnMappingProposal,
  type UnmappedColumnSample,
} from "@/lib/mediaplans/ingest/avaColumnMapping"

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
 * Live path for POST /api/admin/ingest/ava-mapping.
 * Constructs Anthropic only after the MR-5 gate opens (confidence < 90% and
 * unmapped columns). Suggestion-only — never auto-applies.
 */
export async function runLiveAvaColumnMappingProposals(args: {
  publisherName: string | null
  publisherConfidence: number
  columns: UnmappedColumnSample[]
  client?: AvaMappingClient | null
}): Promise<{
  proposals: AvaColumnMappingProposal[]
  ava_call_count: number
}> {
  const client =
    args.client !== undefined ? args.client : createAnthropicAvaMappingClient()
  return runAvaColumnMappingProposals({
    publisherName: args.publisherName,
    publisherConfidence: args.publisherConfidence,
    columns: args.columns,
    client,
  })
}
