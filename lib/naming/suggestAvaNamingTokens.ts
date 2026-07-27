import { AVA_MODEL, getAnthropicClient } from "@/lib/ava/anthropic"
import {
  NAMING_TOKEN_MAX_LEN,
  type AvaTokenSuggestions,
  type TokenSourceItem,
} from "./summariseTargetingTokens"

const DEFAULT_TIMEOUT_MS = 25_000

const SYSTEM = `You standardise media-plan targeting and geo into SHORT naming-convention tokens.
For every token:
- lowercase; join words with underscores; charset [a-z0-9_] only; no spaces, no hyphens.
- at most ${NAMING_TOKEN_MAX_LEN} characters.
- prefer standard abbreviations: "contextual site alignment" -> "csa"; states -> nsw/vic/qld/sa/wa/tas/nt/act; "metropolitan" -> "metro".
- geo: use au/nsw/vic/qld/sa/wa/tas/nt/act/metro/regional when the market clearly maps; otherwise a short slug.
- drop filler words (audience, targeting, the, and, campaign, interest).
- be consistent: the same meaning must yield the same token across line items.
Return ONLY a JSON object keyed by line_item_id:
{"<line_item_id>":{"targeting":"<token>","geo":"<token>"}}
Omit a field when there is no sensible token. No prose, no code fences.`

export function buildAvaNamingTokensPrompt(items: TokenSourceItem[]): string {
  const rows = items.map((it) => ({
    line_item_id: it.line_item_id,
    channel: it.channel,
    family: it.family,
    media_type: it.media_type,
    publisher: it.publisher,
    buy_type: it.buy_type,
    brand: it.brand,
    campaign: it.campaign,
    creative_name: it.creative_name,
    targeting: it.targeting_raw,
    geo: it.geo_raw,
    element_order: it.element_order,
    best_practice_notes: it.best_practice_notes,
  }))
  return [
    `Produce short naming tokens for each line item.`,
    `Hard max length: ${NAMING_TOKEN_MAX_LEN} characters per token.`,
    `Prefer abbreviations such as "contextual site alignment" -> "csa".`,
    `Input (JSON):`,
    JSON.stringify(rows),
  ].join("\n")
}

function parseSuggestions(text: string): AvaTokenSuggestions {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== "object") return {}
  const out: AvaTokenSuggestions = {}
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue
    const rec = value as Record<string, unknown>
    const entry: { targeting?: string; geo?: string } = {}
    if (typeof rec.targeting === "string") entry.targeting = rec.targeting
    if (typeof rec.geo === "string") entry.geo = rec.geo
    if (entry.targeting || entry.geo) out[id] = entry
  }
  return out
}

/** One-shot AVA call → raw suggestions. Throws on model/env error (route catches). */
export async function suggestAvaNamingTokens(
  items: TokenSourceItem[],
): Promise<AvaTokenSuggestions> {
  if (!items.length) return {}
  const client = getAnthropicClient()
  const response = await client.messages.create({
    model: AVA_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: buildAvaNamingTokensPrompt(items) }],
  })
  const text = response.content
    .map((block: { type: string; text?: string }) =>
      block.type === "text" ? block.text ?? "" : "",
    )
    .join("")
  return parseSuggestions(text)
}

/** Timeout wrapper for the generate flow — resolves to {} so the slug fallback runs. */
export async function suggestAvaNamingTokensWithTimeout(
  items: TokenSourceItem[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<AvaTokenSuggestions> {
  if (!items.length) return {}
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<AvaTokenSuggestions>((resolve) => {
    timer = setTimeout(() => resolve({}), timeoutMs)
  })
  try {
    return await Promise.race([suggestAvaNamingTokens(items), timeout])
  } catch {
    return {}
  } finally {
    if (timer) clearTimeout(timer)
  }
}
