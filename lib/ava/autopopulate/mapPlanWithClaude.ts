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

/** Above this many grid data rows, map in sequential batches. */
export const MAPPER_CHUNK_THRESHOLD = 40
/** Target data-row count per Claude batch when chunking. */
export const MAPPER_CHUNK_SIZE = 30

/**
 * Grid rows after the header row. Detector always puts headerRow (when known)
 * at grid[0]; remaining rows are the data band (panels + group context).
 */
export function countGridDataRows(detected: DetectedSheet): number {
  if (detected.headerRow != null) return Math.max(0, detected.grid.length - 1)
  return detected.grid.length
}

/**
 * Split a detected sheet into mapper batches. Under the threshold returns the
 * original sheet unchanged (same reference). Over it, each batch shares the
 * same header/flight/columns/meta and only differs in its data-row grid slice.
 * Trailing fully-blank data rows are dropped before splitting so worksheet
 * padding does not create empty Claude calls.
 */
export function buildChunkedSheets(detected: DetectedSheet): DetectedSheet[] {
  const dataCount = countGridDataRows(detected)
  if (dataCount <= MAPPER_CHUNK_THRESHOLD) return [detected]

  const hasHeader = detected.headerRow != null
  const headerRows = hasHeader ? detected.grid.slice(0, 1) : []
  let dataRows = hasHeader ? detected.grid.slice(1) : detected.grid.slice()

  while (
    dataRows.length > 0 &&
    dataRows[dataRows.length - 1]!.every(
      (c) => c == null || String(c).trim() === "",
    )
  ) {
    dataRows = dataRows.slice(0, -1)
  }
  // Re-check after trim — entire sheet of blanks stays unchunked path below.
  if (dataRows.length <= MAPPER_CHUNK_THRESHOLD) {
    return [
      {
        ...detected,
        grid: [...headerRows, ...dataRows],
        dataRowRange: {
          firstDataRow: detected.dataRowRange.firstDataRow,
          lastDataRow:
            detected.dataRowRange.firstDataRow + Math.max(0, dataRows.length - 1),
        },
        bonusSheets: undefined,
      },
    ]
  }

  const firstAbsolute = detected.dataRowRange.firstDataRow

  const batches: DetectedSheet[] = []
  for (let offset = 0; offset < dataRows.length; offset += MAPPER_CHUNK_SIZE) {
    const slice = dataRows.slice(offset, offset + MAPPER_CHUNK_SIZE)
    batches.push({
      ...detected,
      grid: [...headerRows, ...slice],
      dataRowRange: {
        firstDataRow: firstAbsolute + offset,
        lastDataRow: firstAbsolute + offset + slice.length - 1,
      },
      // Chunks never carry nested bonus sheets — processPlanAutopopulate loops those.
      bonusSheets: undefined,
    })
  }
  return batches
}

/** Merge batch MapperResults: concat lines/reviews/warnings; prefer earliest plan_meta. */
export function mergeMapperResults(results: MapperResult[]): MapperResult {
  if (results.length === 0) {
    return { plan_meta: {}, line_items: [], needs_review: [], warnings: [] }
  }
  if (results.length === 1) return results[0]!

  const plan_meta: MapperResult["plan_meta"] = {}
  for (const r of results) {
    for (const key of ["client", "campaign", "demo", "startDate", "endDate"] as const) {
      if (!plan_meta[key] && r.plan_meta[key]) plan_meta[key] = r.plan_meta[key]
    }
  }

  return {
    plan_meta,
    line_items: results.flatMap((r) => r.line_items),
    needs_review: results.flatMap((r) => r.needs_review),
    warnings: results.flatMap((r) => r.warnings),
  }
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

async function mapSingleBatch(input: {
  detected: DetectedSheet
  channel: AutopopulateChannel
}): Promise<MapperResult> {
  const client = getAnthropicClient()
  const system = buildMapperSystemPrompt(input.channel)
  const userContent = JSON.stringify(buildUserPayload(input.detected, input.channel))

  // Stream: SDK requires streaming when max_tokens may take >10 min
  // (claude-sonnet-4-5 ceiling is 64k).
  const response = await client.messages
    .stream({
      model: AVA_MODEL,
      max_tokens: 64000,
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
    .finalMessage()

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === EMIT_MAPPED_PLAN_TOOL_NAME,
  )
  if (!toolBlock) {
    throw new Error("Claude did not return emit_mapped_plan tool output")
  }

  return parseMapperToolInput(toolBlock.input, input.channel)
}

/**
 * Map a detected sheet via Claude. Large sheets are split into sequential
 * batches so output size is unbounded by a single-call token ceiling.
 */
export async function mapPlanWithClaude(input: {
  detected: DetectedSheet
  channel: AutopopulateChannel
}): Promise<MapperResult> {
  const batches = buildChunkedSheets(input.detected)
  if (batches.length === 1) {
    return mapSingleBatch({ detected: batches[0]!, channel: input.channel })
  }

  const results: MapperResult[] = []
  for (const batch of batches) {
    results.push(await mapSingleBatch({ detected: batch, channel: input.channel }))
  }
  return mergeMapperResults(results)
}
