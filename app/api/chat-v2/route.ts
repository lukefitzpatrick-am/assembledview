/**
 * Canonical AVA chat API — Anthropic Claude agent loop only.
 * Optional kill-switch: AVA_ENGINE=off → 503.
 * Streaming is a later phase; maxDuration mitigates Vercel timeout risk for multi-tool turns.
 */

import { NextRequest, NextResponse } from "next/server"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import type Anthropic from "@anthropic-ai/sdk"
import { type ChatMode } from "@/src/ava/modes"
import { auth0 } from "@/lib/auth0"
import { getUserClientSlugs, getUserMbaNumbers, getUserRoles } from "@/lib/rbac"
import type { PageContext } from "@/lib/ava/types"
import { buildAvaSystemPrompt } from "@/lib/ava/buildAvaSystemPrompt"
import { runAvaAgent } from "@/lib/ava/agentLoop"
import type { AvaToolContext } from "@/lib/ava/tools/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** Multi-tool Claude turns can exceed the default serverless limit; streaming is a later phase. */
export const maxDuration = 60

const AVA_V2_APPENDIX = `
You are AVA, the AssembledView AI assistant. Respond in Australian English with short, direct sentences.

Tool discipline — prefer one well-chosen tool call over guessing:
- get_client_details — client fees, brand colour, platform ID populated y/n
- get_campaign_context — MBA master/version summary + compact line items
- get_media_plan_summary — lighter plan text summary when full line items are not needed
- get_saved_audiences — saved planning audiences by client or MBA
- get_best_practice — media container best-practice copy by channel
- get_naming_rules — template element order + composed name preview
- get_creative_assets — creative files for an MBA
- get_methodology — planning methodology title/formula/source (e.g. affinity, DFII)
- get_pacing_snapshot — pacing/delivery story for a client or MBA (cached channel rows)
- apply_form_patch — only when the user explicitly asks to change editable field values

Never return JSON reply contracts in prose. After apply_form_patch, confirm changes in plain English.
`.trim()

type ChatRequestBody = {
  messages?: ChatCompletionMessageParam[]
  pageContext?: PageContext
  mode?: ChatMode
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession(req)
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    const roles = getUserRoles(session.user)
    const clientSlugs = getUserClientSlugs(session.user)
    const mbaNumbers = getUserMbaNumbers(session.user)
    if (!roles.includes("admin")) {
      console.warn("[AVA v2] /api/chat-v2 denied (not admin)", {
        sub: (session.user as any)?.sub,
        email: (session.user as any)?.email,
        roles,
      })
      return NextResponse.json({ error: "AVA is available to Admin users only." }, { status: 403 })
    }

    if (process.env.AVA_ENGINE === "off") {
      return NextResponse.json(
        {
          error:
            "AVA is temporarily disabled on this deployment. Ask an admin to re-enable it (unset AVA_ENGINE=off).",
        },
        { status: 503 },
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error:
            "ANTHROPIC_API_KEY is not configured. AVA cannot start. Ask an admin to set it in the deployment environment.",
        },
        { status: 503 },
      )
    }

    const body = ((await req.json()) ?? {}) as ChatRequestBody

    if (!Array.isArray(body.messages)) {
      throw new ValidationError("'messages' must be an array")
    }

    const { messages: incomingMessages, pageContext, mode } = body
    const resolvedMode = resolveMode(mode)
    const safeMessages = sanitiseMessages(incomingMessages)
    const anthropicMessages = toAnthropicMessages(safeMessages)

    const { clientSlug, mbaNumber } = deriveAvaIdentifiers(pageContext)

    const systemPrompt = buildAvaSystemPrompt(resolvedMode, pageContext, AVA_V2_APPENDIX)

    const user = session.user as { sub?: string; email?: string }
    const context: AvaToolContext = {
      pageContext,
      clientSlug,
      mbaNumber,
      userSub: typeof user.sub === "string" ? user.sub : undefined,
      userEmail: typeof user.email === "string" ? user.email : undefined,
      roles,
      clientSlugs,
      mbaNumbers,
      capturedPatch: null,
    }

    const result = await runAvaAgent({
      systemPrompt,
      messages: anthropicMessages,
      context,
    })

    return NextResponse.json({
      replyText: result.replyText,
      patch: result.patch,
      meta: {
        engine: "claude",
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
        toolCalls: result.toolCalls.map((tc) => ({ name: tc.name })),
        usage: result.usage,
      },
    })
  } catch (error) {
    console.error("[AVA v2]", error)
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

class ValidationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function deriveAvaIdentifiers(pageContext?: PageContext): { clientSlug?: string; mbaNumber?: string } {
  const entities = pageContext?.entities
  const fromEntities = {
    clientSlug: typeof entities?.clientSlug === "string" ? entities.clientSlug : undefined,
    mbaNumber: typeof entities?.mbaNumber === "string" ? entities.mbaNumber : undefined,
  }

  const route = pageContext?.route
  if (route && typeof route === "object") {
    const clientSlug = typeof (route as any).clientSlug === "string" ? (route as any).clientSlug : undefined
    const mbaNumber = typeof (route as any).mbaSlug === "string" ? (route as any).mbaSlug : undefined
    return { clientSlug: clientSlug || fromEntities.clientSlug, mbaNumber: mbaNumber || fromEntities.mbaNumber }
  }

  if (typeof route === "string" && route) {
    const decoded = decodeURIComponent(route)
    const mbaMatch = decoded.match(/\/mba\/([^/?#]+)/i)
    const mbaNumber = mbaMatch?.[1] ? String(mbaMatch[1]).trim() : undefined
    return { clientSlug: fromEntities.clientSlug, mbaNumber: mbaNumber || fromEntities.mbaNumber }
  }

  return fromEntities
}

function sanitiseMessages(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  if (!Array.isArray(messages)) return []
  return messages.filter((message) => {
    const role = message?.role
    return role !== "system" && role !== "developer"
  })
}

function extractOpenAiMessageText(msg: ChatCompletionMessageParam): string {
  const raw = msg as { content?: unknown }
  const c = raw.content
  if (typeof c === "string") return c
  if (c == null) return ""
  if (!Array.isArray(c)) return ""
  const parts: string[] = []
  for (const part of c) {
    if (
      part &&
      typeof part === "object" &&
      !Array.isArray(part) &&
      (part as { type?: string }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      parts.push((part as { text: string }).text)
    }
  }
  return parts.join("")
}

function toAnthropicMessages(messages: ChatCompletionMessageParam[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = []
  for (const msg of messages) {
    const role = msg.role
    if (role !== "user" && role !== "assistant") continue

    const text = extractOpenAiMessageText(msg).trim()
    if (!text) continue

    out.push({
      role,
      content: text,
    })
  }
  return out
}

function resolveMode(mode?: ChatMode | string): ChatMode {
  if (mode === "mediaplan_create" || mode === "mediaplan_edit") {
    return mode
  }
  return "general"
}
