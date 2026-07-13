import "server-only"

import type Anthropic from "@anthropic-ai/sdk"

import { AVA_MODEL, getAnthropicClient } from "@/lib/ava/anthropic"

const RESEARCH_TIMEOUT_MS = 20_000
const RESEARCH_MAX_TOKENS = 700

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
}

export type ClientResearchResult = {
  brief: string | null
  thin: boolean
}

function extractTextSummary(content: Anthropic.ContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === "text" && block.text?.trim()) {
      parts.push(block.text.trim())
    }
  }
  return parts.join("\n\n").trim()
}

/**
 * Call 1 of no-brief mode: web search only, auto tool choice.
 * Returns a compact text brief (no citation structures). On timeout/error → thin.
 */
export async function researchClientBrief(args: {
  clientName?: string
  brandName: string
  destinationUrl?: string
}): Promise<ClientResearchResult> {
  const clientLabel = args.clientName?.trim() || args.brandName.trim() || "the brand"
  let domainHint = ""
  if (args.destinationUrl?.trim()) {
    try {
      domainHint = new URL(args.destinationUrl.trim()).hostname
    } catch {
      domainHint = args.destinationUrl.trim()
    }
  }

  const prompt = `Research ${clientLabel} for Australian advertising copywriters.

${domainHint ? `Destination / site domain: ${domainHint}` : ""}

Produce a compact research brief (about 500–600 tokens) covering:
1. What the brand sells (products/category)
2. Brand voice / positioning
3. Current offers or campaigns — only if you find them; cite sources in plain text
4. Category context relevant to paid social

Prefer .com.au sources. If research is thin or unreliable, say so explicitly.
NEVER invent offers, prices, or claims — only state what search results support.
Do not use bullet-heavy citation markup; write a clean prose brief.`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS)

  try {
    const client = getAnthropicClient()
    const response = await client.messages.create(
      {
        model: AVA_MODEL,
        max_tokens: RESEARCH_MAX_TOKENS,
        tools: [WEB_SEARCH_TOOL],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    )

    const brief = extractTextSummary(response.content)
    if (!brief) return { brief: null, thin: true }
    const thin = /thin|limited|could not find|couldn't find|no reliable/i.test(brief)
    return { brief: brief.slice(0, 3500), thin }
  } catch (error) {
    console.warn("[ad-copy/research]", error)
    return { brief: null, thin: true }
  } finally {
    clearTimeout(timer)
  }
}
