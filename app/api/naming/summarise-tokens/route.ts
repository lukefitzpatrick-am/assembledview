import { NextRequest, NextResponse } from "next/server"
import type Anthropic from "@anthropic-ai/sdk"

import { AVA_MODEL, getAnthropicClient } from "@/lib/ava/anthropic"
import { requireRole } from "@/lib/requireRole"
import {
  applyAvaSuggestions,
  type AvaTokenSuggestions,
  type TokenSourceItem,
} from "@/lib/naming/summariseTargetingTokens"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const ITEM_CAP = 200
const RAW_CAP = 200

function asItems(raw: unknown): TokenSourceItem[] {
  if (!Array.isArray(raw)) return []
  const out: TokenSourceItem[] = []
  for (const row of raw.slice(0, ITEM_CAP)) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    const id = String(o.line_item_id ?? "").trim()
    if (!id) continue
    out.push({
      line_item_id: id,
      targeting_raw: String(o.targeting_raw ?? "").trim().slice(0, RAW_CAP),
      geo_raw: String(o.geo_raw ?? "").trim().slice(0, RAW_CAP),
    })
  }
  return out
}

async function suggestWithAva(
  sources: TokenSourceItem[],
): Promise<AvaTokenSuggestions> {
  const client = getAnthropicClient()
  const tool: Anthropic.Tool = {
    name: "emit_naming_tokens",
    description:
      "Emit cleaned targeting and geo slug tokens for each line item. Tokens must be lowercase, use underscores for spaces, and never include hyphens.",
    input_schema: {
      type: "object",
      properties: {
        tokens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              line_item_id: { type: "string" },
              targeting: { type: "string" },
              geo: { type: "string" },
            },
            required: ["line_item_id"],
            additionalProperties: false,
          },
        },
      },
      required: ["tokens"],
      additionalProperties: false,
    },
  }

  const payload = sources.map((s) => ({
    line_item_id: s.line_item_id,
    targeting_raw: s.targeting_raw,
    geo_raw: s.geo_raw,
  }))

  const response = await client.messages.create({
    model: AVA_MODEL,
    max_tokens: 4096,
    tools: [tool],
    tool_choice: { type: "tool", name: "emit_naming_tokens" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Clean these media-plan targeting/geo free-text values into short naming tokens for trafficking templates. Prefer concise audience/geo labels (e.g. retargeting, prospecting, nsw, metro). Keep meaning; drop punctuation.\n\n" +
              JSON.stringify(payload),
          },
        ],
      },
    ],
  })

  const suggestions: AvaTokenSuggestions = {}
  for (const block of response.content) {
    if (block.type !== "tool_use" || block.name !== "emit_naming_tokens") continue
    const input = block.input as { tokens?: unknown }
    if (!Array.isArray(input.tokens)) continue
    for (const row of input.tokens) {
      if (!row || typeof row !== "object") continue
      const o = row as Record<string, unknown>
      const id = String(o.line_item_id ?? "").trim()
      if (!id) continue
      const entry: { targeting?: string; geo?: string } = {}
      if (typeof o.targeting === "string") entry.targeting = o.targeting
      if (typeof o.geo === "string") entry.geo = o.geo
      if (entry.targeting !== undefined || entry.geo !== undefined) {
        suggestions[id] = entry
      }
    }
  }

  return suggestions
}

/**
 * Optional AVA pre-fill for naming targeting/geo tokens.
 * Always re-slugifies + validateValue; failures fall back to slugify(raw).
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const items = asItems(
    body && typeof body === "object"
      ? (body as { items?: unknown }).items
      : undefined,
  )

  if (items.length === 0) {
    return NextResponse.json({
      overrides: {},
      appliedCount: 0,
      usedAva: false,
    })
  }

  try {
    const suggestions = await suggestWithAva(items)
    const { overrides, appliedCount } = applyAvaSuggestions(items, suggestions)
    return NextResponse.json({
      overrides,
      appliedCount,
      usedAva: true,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        overrides: {},
        appliedCount: 0,
        usedAva: false,
        error: message,
      },
      { status: 502 },
    )
  }
}
