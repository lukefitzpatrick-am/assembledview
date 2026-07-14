import type Anthropic from "@anthropic-ai/sdk"
import { AVA_MODEL, getAnthropicClient } from "@/lib/ava/anthropic"
import {
  buildMapperSystemPrompt,
  EMIT_MAPPED_PLAN_TOOL,
  EMIT_MAPPED_PLAN_TOOL_NAME,
} from "./mapperPrompt"
import type {
  AutopopulateChannel,
  DetectedSheet,
  MappedBurst,
  MappedLineItem,
  MapperResult,
} from "./types"

function asString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined
  const t = v.trim()
  return t.length ? t : undefined
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  return undefined
}

function parseBurst(raw: unknown): MappedBurst | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const startDate = asString(o.startDate)
  const endDate = asString(o.endDate)
  if (!startDate || !endDate) return null
  const burst: MappedBurst = { startDate, endDate }
  const budget = asString(o.budget)
  if (budget) burst.budget = budget
  const buyAmount = asString(o.buyAmount)
  if (buyAmount) burst.buyAmount = buyAmount
  const quantity = asNumber(o.quantity)
  if (quantity !== undefined) burst.quantity = quantity
  const calculatedValue = asNumber(o.calculatedValue)
  if (calculatedValue !== undefined) burst.calculatedValue = calculatedValue
  const sourceCell = asString(o.sourceCell)
  if (sourceCell) burst.sourceCell = sourceCell
  return burst
}

function parseLineItem(
  raw: unknown,
  channel: AutopopulateChannel,
): MappedLineItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const fieldsRaw = o.fields
  const fields: Record<string, string> = {}
  if (fieldsRaw && typeof fieldsRaw === "object" && !Array.isArray(fieldsRaw)) {
    for (const [k, v] of Object.entries(fieldsRaw as Record<string, unknown>)) {
      if (typeof v === "string") fields[k] = v
      else if (v == null) fields[k] = ""
      else fields[k] = String(v)
    }
  }
  const burstsIn = Array.isArray(o.bursts) ? o.bursts : []
  const bursts = burstsIn.map(parseBurst).filter((b): b is MappedBurst => b != null)
  const confidence = asNumber(o.confidence) ?? 0
  const item: MappedLineItem = {
    channel: o.channel === "ooh" || o.channel === "radio" ? o.channel : channel,
    fields,
    bursts,
    confidence,
  }
  if (typeof o.is_bonus === "boolean") item.is_bonus = o.is_bonus
  const needsReview = asString(o.needs_review)
  if (needsReview) item.needs_review = needsReview
  return item
}

export function parseMapperToolInput(
  raw: unknown,
  channel: AutopopulateChannel,
): MapperResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Mapper returned invalid structured output")
  }
  const o = raw as Record<string, unknown>
  const metaRaw =
    o.plan_meta && typeof o.plan_meta === "object" && !Array.isArray(o.plan_meta)
      ? (o.plan_meta as Record<string, unknown>)
      : {}
  const plan_meta: MapperResult["plan_meta"] = {}
  for (const key of ["client", "campaign", "demo", "startDate", "endDate"] as const) {
    const v = asString(metaRaw[key])
    if (v) plan_meta[key] = v
  }

  const lineItemsIn = Array.isArray(o.line_items) ? o.line_items : []
  const line_items = lineItemsIn
    .map((row) => parseLineItem(row, channel))
    .filter((x): x is MappedLineItem => x != null)

  const needs_review: MapperResult["needs_review"] = []
  if (Array.isArray(o.needs_review)) {
    for (const row of o.needs_review) {
      if (!row || typeof row !== "object") continue
      const r = row as Record<string, unknown>
      const reason = asString(r.reason)
      const n = asNumber(r.row)
      if (reason && n !== undefined) needs_review.push({ row: n, reason })
    }
  }

  const warnings = Array.isArray(o.warnings)
    ? o.warnings.filter((w): w is string => typeof w === "string")
    : []

  return { plan_meta, line_items, needs_review, warnings }
}

/** Compact payload for Claude — keep grid but avoid shipping unused keys twice. */
function buildUserPayload(detected: DetectedSheet, channel: AutopopulateChannel) {
  return {
    channel,
    sheetName: detected.sheetName,
    meta: detected.meta,
    headerRow: detected.headerRow,
    lineItemColumns: detected.lineItemColumns,
    flight: detected.flight,
    costColumns: detected.costColumns,
    junkColumns: detected.junkColumns,
    dataRowRange: detected.dataRowRange,
    /** Header + data rows; junk columns already dropped. Numbers are source of truth. */
    grid: detected.grid,
  }
}

export async function mapPlanWithClaude(input: {
  detected: DetectedSheet
  channel: AutopopulateChannel
}): Promise<MapperResult> {
  const client = getAnthropicClient()
  const system = buildMapperSystemPrompt(input.channel)
  const userContent = JSON.stringify(buildUserPayload(input.detected, input.channel))

  const response = await client.messages.create({
    model: AVA_MODEL,
    max_tokens: 8192,
    system,
    tools: [EMIT_MAPPED_PLAN_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: EMIT_MAPPED_PLAN_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: `Map this detected ${input.channel} plan to Assembled View line items.\n\n${userContent}`,
      },
    ],
  })

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === EMIT_MAPPED_PLAN_TOOL_NAME,
  )
  if (!toolBlock) {
    throw new Error("Claude did not return emit_mapped_plan tool output")
  }

  return parseMapperToolInput(toolBlock.input, input.channel)
}
