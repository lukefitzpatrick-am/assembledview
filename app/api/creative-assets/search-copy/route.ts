import { NextRequest, NextResponse } from "next/server"
import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import type {
  SearchAdCopy,
  SearchAdFormat,
  SearchAsset,
  SearchAssetAngle,
  SearchAssetPin,
  SearchLimits,
} from "@/components/creative/searchads/types"
import { AVA_MODEL, getAnthropicClient } from "@/lib/ava/anthropic"
import { getSkillById } from "@/lib/ava/skills/registry"
import { fetchClientBrainForAdCopy } from "@/lib/creative/adCopy/fetchClientBrain"
import { researchClientBrief } from "@/lib/creative/adCopy/researchClient"
import { buildSearchAvContext } from "@/lib/creative/searchCopy/avContext"
import {
  buildSearchCopySystemPrompt,
  trimSearchCopyToLimits,
} from "@/lib/creative/searchCopy/prompt"
import { checkSearchCopyRateLimit } from "@/lib/creative/searchCopy/rateLimit"
import { loadMiLibrary, type MiFormatRecord, type MiFormatText } from "@/lib/specs/library"
import { requireRole } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

const ANGLES = [
  "keyword",
  "benefit",
  "proof",
  "cta-offer",
  "differentiator",
  "brand",
] as const

const PINS = ["H1", "H2", "H3", "D1", "D2"] as const

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(8_000),
})

const bodySchema = z.object({
  mbaNumber: z.string().min(1),
  format: z.enum(["rsa", "pmax"]),
  brandName: z.string().min(1),
  clientName: z.string().optional(),
  campaignName: z.string().optional(),
  adGroup: z.string().optional(),
  keywords: z.string().max(2_000).optional(),
  finalUrl: z.string().max(2_048).optional(),
  complianceCategory: z.enum(["none", "financial", "alcohol", "health"]).optional(),
  messages: z.array(messageSchema).min(1).max(40),
  optionCount: z.number().optional(),
  mode: z.enum(["no_brief"]).optional(),
})

const FALLBACK_LIMITS: Record<SearchAdFormat, SearchLimits> = {
  rsa: {
    headline: 30,
    description: 90,
    path: 15,
    longHeadline: 90,
    businessName: 25,
    maxHeadlines: 15,
    maxDescriptions: 4,
    maxLongHeadlines: 5,
  },
  pmax: {
    headline: 30,
    description: 90,
    path: 15,
    longHeadline: 90,
    businessName: 25,
    maxHeadlines: 15,
    maxDescriptions: 5,
    maxLongHeadlines: 5,
  },
}

const ASSET_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    angle: { type: "string", enum: [...ANGLES] },
    pinned: { type: "string", enum: [...PINS] },
  },
  required: ["text", "angle"],
  additionalProperties: false,
} as const

const EMIT_SEARCH_COPY_TOOL: Anthropic.Tool = {
  name: "emit_search_copy",
  description:
    "Return Google Search ad copy (RSA or Performance Max) plus a short chat reply.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string" },
      format: { type: "string", enum: ["rsa", "pmax"] },
      finalUrl: { type: "string" },
      path1: { type: "string" },
      path2: { type: "string" },
      headlines: {
        type: "array",
        minItems: 1,
        items: ASSET_SCHEMA,
      },
      longHeadlines: {
        type: "array",
        items: ASSET_SCHEMA,
      },
      descriptions: {
        type: "array",
        minItems: 1,
        items: ASSET_SCHEMA,
      },
      businessName: { type: "string" },
      sitelinks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            url: { type: "string" },
          },
          required: ["text", "url"],
          additionalProperties: false,
        },
      },
      callouts: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["reply", "format", "finalUrl", "path1", "path2", "headlines", "descriptions"],
    additionalProperties: false,
  },
}

function textField(text: MiFormatText, key: string): string {
  if (!text || typeof text === "string") return typeof text === "string" ? text : ""
  const value = text[key]
  return typeof value === "string" ? value : ""
}

/** Parse "max 15" / "30 characters" style notes from MI library text fields. */
function parseMaxCount(note: string, fallback: number): number {
  const maxMatch = note.match(/\bmax\s+(\d+)\b/i)
  if (maxMatch) return Number(maxMatch[1])
  const rangeMatch = note.match(/\b(\d+)\s*[-–]\s*(\d+)\b/)
  if (rangeMatch) return Number(rangeMatch[2])
  return fallback
}

function parseCharLimit(note: string, fallback: number): number {
  const match = note.match(/(\d+)\s*characters?\b/i)
  if (match) return Number(match[1])
  // e.g. "25 characters. Must match..."
  const leading = note.match(/^(\d+)\s*characters?\b/i)
  if (leading) return Number(leading[1])
  return fallback
}

function findGoogleAdsFormat(
  formats: MiFormatRecord[],
  format: SearchAdFormat,
): MiFormatRecord | undefined {
  if (format === "rsa") {
    return formats.find((row) => /responsive search|\(rsa\)/i.test(row.format_name))
  }
  return formats.find((row) => /performance max/i.test(row.format_name))
}

function resolveSearchLimits(format: SearchAdFormat): SearchLimits {
  const fallback = FALLBACK_LIMITS[format]
  try {
    const library = loadMiLibrary()
    const record = library.bySlug.get("google-ads")
    const miFormat = record ? findGoogleAdsFormat(record.formats ?? [], format) : undefined
    if (!miFormat?.text) {
      console.warn(
        "[api/creative-assets/search-copy] MI library Google Ads format missing; using fallback limits",
      )
      return { ...fallback }
    }

    const headlinesNote = textField(miFormat.text, "headlines")
    const descriptionsNote = textField(miFormat.text, "descriptions")
    const pathNote =
      textField(miFormat.text, "display_path")
      || textField(miFormat.text, "display_url_path")
    const longHeadlineNote = textField(miFormat.text, "long_headline")
    const businessNameNote = textField(miFormat.text, "business_name")

    return {
      headline: parseCharLimit(headlinesNote, fallback.headline),
      description: parseCharLimit(descriptionsNote, fallback.description),
      path: parseCharLimit(pathNote, fallback.path),
      longHeadline: parseCharLimit(longHeadlineNote, fallback.longHeadline),
      businessName: parseCharLimit(businessNameNote, fallback.businessName),
      maxHeadlines: parseMaxCount(headlinesNote, fallback.maxHeadlines),
      maxDescriptions: parseMaxCount(descriptionsNote, fallback.maxDescriptions),
      maxLongHeadlines: parseMaxCount(longHeadlineNote, fallback.maxLongHeadlines),
    }
  } catch (error) {
    console.warn(
      "[api/creative-assets/search-copy] MI library lookup failed; using fallback limits",
      error,
    )
    return { ...fallback }
  }
}

function optionCountNote(format: SearchAdFormat, limits: SearchLimits): string {
  if (format === "pmax") {
    return `${limits.maxHeadlines} headlines, ${limits.maxDescriptions} descriptions, ${limits.maxLongHeadlines} long headlines, 2 paths`
  }
  return `${limits.maxHeadlines} headlines, ${limits.maxDescriptions} descriptions, 2 paths`
}

function parseAngle(raw: unknown): SearchAssetAngle {
  const value = String(raw ?? "").trim()
  if ((ANGLES as readonly string[]).includes(value)) {
    return value as SearchAssetAngle
  }
  return "benefit"
}

function parsePin(raw: unknown): SearchAssetPin | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined
  const value = String(raw).trim()
  if ((PINS as readonly string[]).includes(value)) {
    return value as SearchAssetPin
  }
  return undefined
}

function parseAsset(item: unknown): SearchAsset {
  if (!item || typeof item !== "object") throw new Error("invalid_tool_output")
  const row = item as Record<string, unknown>
  const text = String(row.text ?? "")
  const asset: SearchAsset = {
    text,
    angle: parseAngle(row.angle),
  }
  const pinned = parsePin(row.pinned)
  if (pinned) asset.pinned = pinned
  return asset
}

function parseSearchCopyOutput(
  raw: unknown,
  requestedFormat: SearchAdFormat,
  finalUrlFallback: string,
): { reply: string; copy: SearchAdCopy } {
  if (!raw || typeof raw !== "object") throw new Error("invalid_tool_output")
  const row = raw as Record<string, unknown>
  const reply = String(row.reply ?? "").trim()
  if (!reply) throw new Error("invalid_tool_output")

  const headlines = Array.isArray(row.headlines) ? row.headlines.map(parseAsset) : []
  const descriptions = Array.isArray(row.descriptions) ? row.descriptions.map(parseAsset) : []
  if (headlines.length < 1 || descriptions.length < 1) {
    throw new Error("invalid_tool_output")
  }

  const format =
    row.format === "rsa" || row.format === "pmax"
      ? row.format
      : requestedFormat

  const copy: SearchAdCopy = {
    format,
    finalUrl: String(row.finalUrl ?? "").trim() || finalUrlFallback,
    path1: String(row.path1 ?? ""),
    path2: String(row.path2 ?? ""),
    headlines,
    descriptions,
  }

  if (Array.isArray(row.longHeadlines)) {
    copy.longHeadlines = row.longHeadlines.map(parseAsset)
  }
  if (row.businessName !== undefined && row.businessName !== null) {
    copy.businessName = String(row.businessName)
  }
  if (Array.isArray(row.sitelinks)) {
    copy.sitelinks = row.sitelinks
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        text: String(item.text ?? ""),
        url: String(item.url ?? ""),
      }))
  }
  if (Array.isArray(row.callouts)) {
    copy.callouts = row.callouts.map((item) => String(item ?? ""))
  }

  return { reply, copy }
}

function buildAnthropicMessages(
  chatMessages: Array<{ role: "user" | "assistant"; text: string }>,
): Anthropic.MessageParam[] {
  return chatMessages.map((msg) => ({
    role: msg.role,
    content: msg.text,
  }))
}

/**
 * POST /api/creative-assets/search-copy
 * Staff-only: AVA Google Search copy workshop (text-only, no creative image).
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  const sessionKey =
    gate.session?.user?.sub || gate.session?.user?.email || "anonymous"
  const limit = checkSearchCopyRateLimit(String(sessionKey))
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many AVA copy requests. Try again in a minute.",
      },
      { status: 429 },
    )
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Invalid request body." },
      { status: 400 },
    )
  }

  const isNoBrief = parsed.mode === "no_brief"
  const limits = resolveSearchLimits(parsed.format)
  const skill = getSkillById("assembled-search-copy")
  const skillBody = skill?.body?.trim()
    ? skill.body
    : "(Methodology skill assembled-search-copy is missing — write to Assembled Search standards still.)"

  try {
    const [clientBrain, avContext, research] = await Promise.all([
      fetchClientBrainForAdCopy(parsed.clientName),
      buildSearchAvContext({
        mbaNumber: parsed.mbaNumber,
        clientName: parsed.clientName,
        campaignName: parsed.campaignName,
        finalUrl: parsed.finalUrl,
      }),
      isNoBrief
        ? researchClientBrief({
            clientName: parsed.clientName,
            brandName: parsed.brandName,
            destinationUrl: parsed.finalUrl,
          })
        : Promise.resolve({ brief: null as string | null, thin: false }),
    ])

    const systemPrompt = buildSearchCopySystemPrompt({
      format: parsed.format,
      brandName: parsed.brandName,
      clientName: parsed.clientName,
      campaignName: parsed.campaignName,
      adGroup: parsed.adGroup,
      keywords: parsed.keywords,
      finalUrl: parsed.finalUrl,
      complianceCategory: parsed.complianceCategory,
      optionCountNote: optionCountNote(parsed.format, limits),
      mode: isNoBrief ? "no_brief" : "chat",
      skillBody,
      clientBrain,
      avContext: avContext.text,
      researchBrief: research.brief,
      researchThin: research.thin || avContext.researchThinHint,
      limits,
    })

    const chatMessages = parsed.messages.map((msg) => ({
      role: msg.role,
      text:
        msg.text.trim()
        || (isNoBrief && msg.role === "user"
          ? "No brief — research & write"
          : msg.text),
    }))

    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: AVA_MODEL,
      max_tokens: 4500,
      system: systemPrompt,
      tools: [EMIT_SEARCH_COPY_TOOL],
      tool_choice: { type: "tool", name: "emit_search_copy" },
      messages: buildAnthropicMessages(chatMessages),
    })

    const toolUse = response.content.find((block) => block.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use" || toolUse.name !== "emit_search_copy") {
      return NextResponse.json(
        { error: "generation_failed", message: "AVA didn't return search copy." },
        { status: 502 },
      )
    }

    const { reply, copy } = parseSearchCopyOutput(
      toolUse.input,
      parsed.format,
      parsed.finalUrl?.trim() || "",
    )
    const trimmed = trimSearchCopyToLimits(copy, limits)
    return NextResponse.json({ reply, copy: trimmed })
  } catch (error) {
    console.error("[api/creative-assets/search-copy]", error)
    return NextResponse.json(
      { error: "generation_failed", message: "AVA couldn't generate copy. Try again." },
      { status: 502 },
    )
  }
}
