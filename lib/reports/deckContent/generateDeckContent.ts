/**
 * One Messages call that returns content.json for the campaign deck.
 * Runs only when DECK_RENDERER is exactly "python". No route calls this.
 */
import "server-only"

import { getAnthropicClient } from "@/lib/ava/anthropic"
import { logJob } from "@/lib/log"
import { DECK_CONTENT_JSON_SCHEMA, validateDeckContent } from "@/lib/reports/deckContent/validateDeckContent"

const INPUT_USD_PER_MILLION = 4
const OUTPUT_USD_PER_MILLION = 20
const CACHE_WRITE_USD_PER_MILLION = 5
const CACHE_READ_USD_PER_MILLION = 0.2
const MAX_TOKENS = 16_000

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const

type Effort = (typeof EFFORTS)[number]

const SYSTEM_PROMPT = `You write content.json for an Assembled Media campaign report.

Titles state the point. Use sentence case. End each title with a full stop. Mark exactly one serif italic phrase as {i:"phrase"}.

One idea per slide. Write 5 to 7 slides.

Only numbers that are in the payload. Never invent a figure. A value field is a dotted path into the payload, never a typed number. Prose has no digits. Copy each formatted string by its key.

Australian English. No em dashes. No emojis.

Include a breaker as a summary statement slide. Include 2 or 3 numbered recommendations on an iao rows slide. Number them in words. Each recommendation uses the action tag.

Slide types are cover (sand or black), summary (stat-row or statement), channel (bars, cards or photo), not-live (cards or list), kpi (four-cards or table), iao (rows or journey), appendix (table) and close (thank-you or cta).

The user message is the slim payload, including audiences when they are present.`

export type DeckContentUsage = {
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  costUsd: number
}

export type DeckContentResult = {
  content: { slides: unknown[] }
  usage: DeckContentUsage
}

export class DeckContentValidationError extends Error {
  readonly errors: string[]

  constructor(errors: string[]) {
    super(errors.join("\n"))
    this.name = "DeckContentValidationError"
    this.errors = errors
  }
}

type ParsedMessage = {
  parsed_output?: unknown
  usage?: {
    input_tokens?: number | null
    output_tokens?: number | null
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  }
}

export type DeckContentParseParams = {
  model: string
  max_tokens: number
  system: string
  messages: { role: "user"; content: string }[]
  output_config: {
    effort: Effort
    format: { type: "json_schema"; schema: Record<string, unknown> }
  }
}

export type DeckContentClient = {
  messages: {
    parse: (params: DeckContentParseParams) => Promise<ParsedMessage>
  }
}

function usageCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function modelFromEnv(): string {
  const model = process.env.DECK_CONTENT_MODEL?.trim()
  return model || "claude-opus-5-5"
}

function effortFromEnv(): Effort {
  const effort = process.env.DECK_CONTENT_EFFORT?.trim()
  if (effort && (EFFORTS as readonly string[]).includes(effort)) return effort as Effort
  return "high"
}

function costOf(usage: ParsedMessage["usage"]): DeckContentUsage {
  const inputTokens = usageCount(usage?.input_tokens)
  const outputTokens = usageCount(usage?.output_tokens)
  const cacheWriteTokens = usageCount(usage?.cache_creation_input_tokens)
  const cacheReadTokens = usageCount(usage?.cache_read_input_tokens)
  const costUsd =
    (inputTokens * INPUT_USD_PER_MILLION +
      outputTokens * OUTPUT_USD_PER_MILLION +
      cacheWriteTokens * CACHE_WRITE_USD_PER_MILLION +
      cacheReadTokens * CACHE_READ_USD_PER_MILLION) /
    1_000_000
  return { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, costUsd }
}

export async function generateDeckContent(
  payload: unknown,
  client?: DeckContentClient,
): Promise<DeckContentResult | null> {
  if (process.env.DECK_RENDERER !== "python") return null

  const model = modelFromEnv()
  const effort = effortFromEnv()
  const api = client ?? (getAnthropicClient() as unknown as DeckContentClient)
  const message = await api.messages.parse({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    output_config: {
      effort,
      format: { type: "json_schema", schema: DECK_CONTENT_JSON_SCHEMA },
    },
  })

  const usage = costOf(message.usage)
  logJob("[deck-content]", {
    model,
    effort,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_write_tokens: usage.cacheWriteTokens,
    cache_read_tokens: usage.cacheReadTokens,
    cost_usd: usage.costUsd,
  })

  const errors = validateDeckContent(message.parsed_output, payload)
  if (errors.length > 0) throw new DeckContentValidationError(errors)
  return { content: message.parsed_output as { slides: unknown[] }, usage }
}
