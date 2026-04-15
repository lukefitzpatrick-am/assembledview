/**
 * AVA Phase 1: Claude-powered chat route. Runs in parallel with /api/chat. Gated by AVA_ENGINE env var and admin role. Do not delete /api/chat until Phase 1 validation is complete.
 */

import { NextRequest, NextResponse } from "next/server"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import type Anthropic from "@anthropic-ai/sdk"
import { getModeInstructions, type ChatMode } from "@/src/ava/modes"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import {
  buildSystemPrompt,
  type FormPatch,
  type PageContext,
} from "@/lib/openai"
import { runAvaAgent } from "@/lib/ava/agentLoop"
import type { AvaToolContext } from "@/lib/ava/tools/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AVA_V2_APPENDIX =
  "\n\nYou are AVA, the AssembledView AI assistant. You respond in Australian English with short, direct sentences. You can call tools to fetch data and apply form edits. Only call get_media_plan_summary if the user's question actually needs plan details. Only call apply_form_patch if the user explicitly asks you to change field values. When you call apply_form_patch, confirm the changes in your reply in plain English."

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
    if (!roles.includes("admin")) {
      console.warn("[AVA v2] /api/chat-v2 denied (not admin)", {
        sub: (session.user as any)?.sub,
        email: (session.user as any)?.email,
        roles,
      })
      return NextResponse.json({ error: "AVA is available to Admin users only." }, { status: 403 })
    }

    if (process.env.AVA_ENGINE !== "claude") {
      return NextResponse.json(
        { error: "AVA Claude engine is not enabled on this deployment." },
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

    const customInstructions = getModeInstructions(resolvedMode, pageContext)
    const systemPrompt =
      buildSystemPrompt({
        pageContext,
        customInstructions,
      }) + AVA_V2_APPENDIX

    const user = session.user as { sub?: string; email?: string }
    const context: AvaToolContext = {
      pageContext,
      clientSlug,
      mbaNumber,
      userSub: typeof user.sub === "string" ? user.sub : undefined,
      userEmail: typeof user.email === "string" ? user.email : undefined,
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
