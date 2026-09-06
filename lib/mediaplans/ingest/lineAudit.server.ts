/**
 * Server-only Anthropic client for the independent line audit.
 * Forced tool_use structured output. Never imported from Client Components.
 */
import "server-only"

import type Anthropic from "@anthropic-ai/sdk"
import { getAnthropicClient } from "@/lib/ava/anthropic"
import {
  LINE_AUDIT_SYSTEM_PROMPT,
  LINE_AUDIT_TOOL_NAME,
  parseLineAuditRows,
  serializeChunkForModel,
  type LineAuditClient,
  type LineAuditChunkRequest,
  type LineAuditRow,
} from "@/lib/mediaplans/ingest/lineAudit"

export const INGEST_AUDIT_MODEL =
  process.env.INGEST_AUDIT_MODEL ?? "claude-opus-4-6"

const EMIT_TOOL: Anthropic.Tool = {
  name: LINE_AUDIT_TOOL_NAME,
  description:
    "Emit one independent reading per buy row. Use the A1 addresses you read. Do not apply agency mapping rules.",
  input_schema: {
    type: "object",
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            row: { type: "integer" },
            identity: {
              type: "object",
              properties: {
                panel: { type: ["string", "null"] },
                name: { type: ["string", "null"] },
                market: { type: ["string", "null"] },
                section: { type: ["string", "null"] },
              },
              required: ["panel", "name", "market", "section"],
            },
            status_runs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  status: { type: "string" },
                  from_col: { type: "string" },
                  to_col: { type: "string" },
                },
                required: ["status", "from_col", "to_col"],
              },
            },
            money: {
              type: "object",
              properties: {
                cell: { type: ["string", "null"] },
                amount: { type: ["number", "null"] },
                basis_guess: { type: ["string", "null"] },
              },
              required: ["cell", "amount", "basis_guess"],
            },
            dates_implied: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: ["string", "null"] },
                  to: { type: ["string", "null"] },
                },
                required: ["from", "to"],
              },
            },
            format_header: { type: ["string", "null"] },
            notes: { type: "array", items: { type: "string" } },
          },
          required: [
            "row",
            "identity",
            "status_runs",
            "money",
            "dates_implied",
            "format_header",
            "notes",
          ],
        },
      },
    },
    required: ["rows"],
  },
}

function rowsFromResponse(response: Anthropic.Message): LineAuditRow[] {
  const toolBlock = response.content.find(
    (b) => b.type === "tool_use" && b.name === LINE_AUDIT_TOOL_NAME,
  )
  const input =
    toolBlock && toolBlock.type === "tool_use" ? toolBlock.input : null
  return parseLineAuditRows(input)
}

export function createAnthropicLineAuditClient(): LineAuditClient {
  return {
    model: INGEST_AUDIT_MODEL,
    async auditChunk(request: LineAuditChunkRequest) {
      const client = getAnthropicClient()
      const response = await client.messages.create({
        model: INGEST_AUDIT_MODEL,
        max_tokens: 16000,
        system: LINE_AUDIT_SYSTEM_PROMPT,
        tools: [EMIT_TOOL],
        tool_choice: { type: "tool", name: LINE_AUDIT_TOOL_NAME },
        thinking: { type: "enabled", budget_tokens: 10000 },
        messages: [
          {
            role: "user",
            content: serializeChunkForModel(request),
          },
        ],
      } as Anthropic.MessageCreateParams)
      const rows = rowsFromResponse(response)
      if (rows.length === 0 && request.data_rows.length > 0) {
        throw new Error(
          `line audit returned no rows for section ${request.section_row} (${request.data_rows.length} buy rows)`,
        )
      }
      return rows
    },
  }
}
