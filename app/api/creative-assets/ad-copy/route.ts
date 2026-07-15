import { NextRequest, NextResponse } from "next/server"
import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import {
  SOCIAL_CTA_OPTIONS,
  type SocialCtaLabel,
} from "@/components/creative/mockups/social/types"
import { AVA_MODEL, getAnthropicClient } from "@/lib/ava/anthropic"
import {
  buildAdCopySystemPrompt,
  trimVariantToLimits,
  type AdCopyPlatform,
  type AdCopyVariant,
} from "@/lib/creative/adCopy/prompt"
import { buildAdCopyAvContext } from "@/lib/creative/adCopy/avContext"
import { fetchClientBrainForAdCopy } from "@/lib/creative/adCopy/fetchClientBrain"
import { researchClientBrief } from "@/lib/creative/adCopy/researchClient"
import { checkAdCopyRateLimit } from "@/lib/creative/adCopy/rateLimit"
import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import type { CreativeAsset } from "@/lib/creative/types"
import { getById, XanoCreativeAssetError } from "@/lib/creative/xanoCreativeAssets"
import { requireRole } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

const platformSchema = z.enum([
  "facebook-feed",
  "instagram-feed",
  "instagram-story",
  "tiktok",
])

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(8_000),
})

const bodySchema = z.object({
  assetId: z.number().int().positive(),
  platform: platformSchema,
  brandName: z.string().min(1).max(120),
  clientName: z.string().max(120).optional(),
  campaignName: z.string().max(200).optional(),
  destinationUrl: z.string().max(2_000).optional(),
  videoFrameDataUrl: z.string().max(2_800_000).optional(),
  /** Multi-turn copy chat. When present, drives the chat contract. */
  messages: z.array(messageSchema).min(1).max(40).optional(),
  optionCount: z.number().int().min(3).max(15).optional(),
  /** First-turn research mode — web search then emit. */
  mode: z.enum(["no_brief"]).optional(),
  /** Legacy one-shot regenerate hint (ignored when messages is set). */
  existingCopy: z
    .object({
      primaryText: z.string().optional(),
      headline: z.string().optional(),
      description: z.string().optional(),
      ctaLabel: z.string().optional(),
    })
    .optional(),
})

const VARIANT_SCHEMA = {
  type: "object",
  properties: {
    angle: { type: "string" },
    primaryText: { type: "string" },
    headline: { type: "string" },
    description: { type: "string" },
    cta: { type: "string", enum: [...SOCIAL_CTA_OPTIONS] },
  },
  required: ["angle", "primaryText", "headline", "description", "cta"],
  additionalProperties: false,
} as const

const EMIT_AD_COPY_TOOL: Anthropic.Tool = {
  name: "emit_ad_copy",
  description: "Return exactly 3 ad copy variants for the requested platform.",
  input_schema: {
    type: "object",
    properties: {
      variants: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: VARIANT_SCHEMA,
      },
    },
    required: ["variants"],
    additionalProperties: false,
  },
}

const EMIT_COPY_CHAT_TOOL: Anthropic.Tool = {
  name: "emit_copy_chat",
  description:
    "Reply in the copy workshop chat. Include options when you produced or updated the list.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string" },
      options: {
        type: "array",
        minItems: 1,
        maxItems: 15,
        items: VARIANT_SCHEMA,
      },
    },
    required: ["reply"],
    additionalProperties: false,
  },
}

const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,/

function parseCta(raw: unknown): SocialCtaLabel {
  const value = String(raw ?? "").trim()
  if ((SOCIAL_CTA_OPTIONS as readonly string[]).includes(value)) {
    return value as SocialCtaLabel
  }
  return "Learn More"
}

function parseVariantItem(item: unknown, platform: AdCopyPlatform): AdCopyVariant {
  if (!item || typeof item !== "object") throw new Error("invalid_tool_output")
  const row = item as Record<string, unknown>
  return trimVariantToLimits(platform, {
    angle: String(row.angle ?? "").trim() || "Variant",
    primaryText: String(row.primaryText ?? ""),
    headline: String(row.headline ?? ""),
    description: String(row.description ?? ""),
    cta: parseCta(row.cta),
  })
}

function parseVariants(raw: unknown, platform: AdCopyPlatform): AdCopyVariant[] {
  if (!raw || typeof raw !== "object") throw new Error("invalid_tool_output")
  const variants = (raw as { variants?: unknown }).variants
  if (!Array.isArray(variants) || variants.length !== 3) {
    throw new Error("invalid_tool_output")
  }
  return variants.map((item) => parseVariantItem(item, platform))
}

function parseChatOutput(
  raw: unknown,
  platform: AdCopyPlatform,
): { reply: string; options?: AdCopyVariant[] } {
  if (!raw || typeof raw !== "object") throw new Error("invalid_tool_output")
  const row = raw as { reply?: unknown; options?: unknown }
  const reply = String(row.reply ?? "").trim()
  if (!reply) throw new Error("invalid_tool_output")
  if (row.options === undefined || row.options === null) {
    return { reply }
  }
  if (!Array.isArray(row.options) || row.options.length < 1) {
    throw new Error("invalid_tool_output")
  }
  return {
    reply,
    options: row.options.map((item) => parseVariantItem(item, platform)),
  }
}

async function loadImageBase64(
  row: CreativeAsset,
  videoFrameDataUrl?: string,
): Promise<{
  mediaType: "image/jpeg" | "image/png" | "image/webp"
  data: string
}> {
  const mime = row.mime_type
  if (mime.startsWith("video/")) {
    if (!videoFrameDataUrl || !DATA_URL_RE.test(videoFrameDataUrl)) {
      throw new Error("video_frame_required")
    }
    const match = videoFrameDataUrl.match(DATA_URL_RE)
    const subtype = match?.[1] ?? "jpeg"
    const mediaType =
      subtype === "png"
        ? "image/png"
        : subtype === "webp"
          ? "image/webp"
          : "image/jpeg"
    const data = videoFrameDataUrl.slice(videoFrameDataUrl.indexOf(",") + 1)
    return { mediaType, data }
  }

  if (!mime.startsWith("image/")) {
    throw new Error("unsupported_mime")
  }

  const blobResult = await getPrivateBlob(row.blob_url)
  if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
    throw new Error("blob_missing")
  }

  const chunks: Uint8Array[] = []
  const reader = blobResult.stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  const buffer = Buffer.concat(chunks)
  const mediaType =
    mime === "image/png"
      ? "image/png"
      : mime === "image/webp"
        ? "image/webp"
        : "image/jpeg"

  return { mediaType, data: buffer.toString("base64") }
}

function buildAnthropicMessages(
  chatMessages: Array<{ role: "user" | "assistant"; text: string }>,
  imageBlock: Anthropic.ImageBlockParam,
): Anthropic.MessageParam[] {
  return chatMessages.map((msg, index) => {
    if (msg.role === "assistant") {
      return { role: "assistant" as const, content: msg.text }
    }
    // Attach creative image on the first user turn only (cache-friendly).
    if (index === 0 || chatMessages.findIndex((m) => m.role === "user") === index) {
      const isFirstUser = chatMessages.findIndex((m) => m.role === "user") === index
      if (isFirstUser) {
        return {
          role: "user" as const,
          content: [imageBlock, { type: "text" as const, text: msg.text }],
        }
      }
    }
    return { role: "user" as const, content: msg.text }
  })
}

/**
 * POST /api/creative-assets/ad-copy
 * Staff-only: AVA copy workshop (multi-turn) or legacy 3-variant one-shot.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  const sessionKey =
    gate.session?.user?.sub || gate.session?.user?.email || "anonymous"
  const limit = checkAdCopyRateLimit(String(sessionKey))
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

  let row: CreativeAsset | null
  try {
    row = await getById(parsed.assetId)
  } catch (error) {
    if (error instanceof XanoCreativeAssetError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    throw error
  }

  if (!row) {
    return NextResponse.json({ error: "not_found", message: "Creative not found." }, { status: 404 })
  }

  if (row.mime_type === "application/zip") {
    return NextResponse.json(
      {
        error: "unsupported_mime",
        message: "HTML5 zip creatives aren't supported for AVA copy generation.",
      },
      { status: 400 },
    )
  }

  let imageBlock: Anthropic.ImageBlockParam
  try {
    const image = await loadImageBase64(row, parsed.videoFrameDataUrl)
    imageBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.data,
      },
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "load_failed"
    if (code === "video_frame_required") {
      return NextResponse.json(
        {
          error: "video_frame_required",
          message: "Video creatives need a captured frame before generating copy.",
        },
        { status: 400 },
      )
    }
    if (code === "unsupported_mime") {
      return NextResponse.json(
        { error: "unsupported_mime", message: "This asset type isn't supported." },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { error: "load_failed", message: "Couldn't load the creative for AVA." },
      { status: 502 },
    )
  }

  const optionCount = parsed.optionCount ?? 12
  const isChat = Boolean(parsed.messages?.length)
  const isNoBrief = parsed.mode === "no_brief" && isChat

  try {
    const client = getAnthropicClient()

    if (isChat && parsed.messages) {
      let systemPrompt: string

      if (isNoBrief) {
        const [avContext, research, clientBrain] = await Promise.all([
          buildAdCopyAvContext({
            asset: row,
            clientName: parsed.clientName,
            campaignName: parsed.campaignName,
            destinationUrl: parsed.destinationUrl,
          }),
          researchClientBrief({
            clientName: parsed.clientName,
            brandName: parsed.brandName,
            destinationUrl: parsed.destinationUrl,
          }),
          fetchClientBrainForAdCopy(parsed.clientName),
        ])

        systemPrompt = buildAdCopySystemPrompt({
          platform: parsed.platform,
          brandName: parsed.brandName,
          clientName: parsed.clientName,
          campaignName: parsed.campaignName,
          optionCount,
          mode: "no_brief",
          avContext: avContext.text,
          researchBrief: research.brief,
          researchThin: research.thin || avContext.researchThinHint,
          clientBrain,
        })
      } else {
        const clientBrain = await fetchClientBrainForAdCopy(parsed.clientName)
        systemPrompt = buildAdCopySystemPrompt({
          platform: parsed.platform,
          brandName: parsed.brandName,
          clientName: parsed.clientName,
          campaignName: parsed.campaignName,
          optionCount,
          mode: "chat",
          clientBrain,
        })
      }

      const chatMessages = parsed.messages.map((msg) => ({
        role: msg.role,
        text:
          msg.text.trim() ||
          (isNoBrief && msg.role === "user"
            ? "No brief — research & write"
            : msg.text),
      }))

      const response = await client.messages.create({
        model: AVA_MODEL,
        max_tokens: 4500,
        system: systemPrompt,
        tools: [EMIT_COPY_CHAT_TOOL],
        tool_choice: { type: "tool", name: "emit_copy_chat" },
        messages: buildAnthropicMessages(chatMessages, imageBlock),
      })

      const toolUse = response.content.find((block) => block.type === "tool_use")
      if (!toolUse || toolUse.type !== "tool_use" || toolUse.name !== "emit_copy_chat") {
        return NextResponse.json(
          { error: "generation_failed", message: "AVA didn't return a chat reply." },
          { status: 502 },
        )
      }

      const { reply, options } = parseChatOutput(toolUse.input, parsed.platform)
      return NextResponse.json({ reply, options })
    }

    // Legacy one-shot (3 variants).
    const existingLines: string[] = []
    if (parsed.existingCopy) {
      const ec = parsed.existingCopy
      if (ec.primaryText?.trim()) existingLines.push(`Primary: ${ec.primaryText.trim()}`)
      if (ec.headline?.trim()) existingLines.push(`Headline: ${ec.headline.trim()}`)
      if (ec.description?.trim()) existingLines.push(`Description: ${ec.description.trim()}`)
      if (ec.ctaLabel?.trim()) existingLines.push(`CTA: ${ec.ctaLabel.trim()}`)
    }

    const userText =
      existingLines.length > 0
        ? `Existing copy to diverge from:\n${existingLines.join("\n")}\n\nWrite 3 new variants.`
        : "Write 3 ad copy variants for this creative."

    const response = await client.messages.create({
      model: AVA_MODEL,
      max_tokens: 1500,
      system: buildAdCopySystemPrompt({
        platform: parsed.platform,
        brandName: parsed.brandName,
        clientName: parsed.clientName,
        campaignName: parsed.campaignName,
        mode: "oneshot",
      }),
      tools: [EMIT_AD_COPY_TOOL],
      tool_choice: { type: "tool", name: "emit_ad_copy" },
      messages: [
        {
          role: "user",
          content: [imageBlock, { type: "text", text: userText }],
        },
      ],
    })

    const toolUse = response.content.find((block) => block.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use" || toolUse.name !== "emit_ad_copy") {
      return NextResponse.json(
        { error: "generation_failed", message: "AVA didn't return copy variants." },
        { status: 502 },
      )
    }

    const variants = parseVariants(toolUse.input, parsed.platform)
    return NextResponse.json({ variants })
  } catch (error) {
    console.error("[api/creative-assets/ad-copy]", error)
    return NextResponse.json(
      { error: "generation_failed", message: "AVA couldn't generate copy. Try again." },
      { status: 502 },
    )
  }
}
