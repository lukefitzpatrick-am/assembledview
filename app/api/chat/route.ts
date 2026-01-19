import { NextRequest, NextResponse } from "next/server"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import { getModeInstructions, type ChatMode } from "@/src/ava/modes"
import {
  buildSystemPrompt,
  callOpenAIChat,
  summarizeData,
  type FormPatch,
  type ModelChatReply,
  type PageContext,
} from "@/lib/openai"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const XANO_BASE_URL = process.env.XANO_ASSISTANT_ENDPOINT || process.env.XANO_BASE_URL || ""
const XANO_API_KEY = process.env.XANO_API_KEY || ""

type ChatRequestBody = {
  messages?: ChatCompletionMessageParam[]
  pageContext?: PageContext
  mode?: ChatMode
}

export async function POST(req: NextRequest) {
  try {
    const { messages, pageContext, mode } = ((await req.json()) ?? {}) as ChatRequestBody
    const incomingMessages = Array.isArray(messages) ? messages : []
    const resolvedMode = resolveMode(mode)
    const safeMessages = sanitiseMessages(incomingMessages)
    const lastUserMessage = [...safeMessages].reverse().find((m) => m.role === "user")
    const userQuestion = typeof lastUserMessage?.content === "string" ? lastUserMessage.content : ""

    const xanoData = await maybeFetchXanoData(userQuestion)
    const customInstructions = getModeInstructions(resolvedMode, pageContext)
    const systemPrompt = buildSystemPrompt({
      pageContext,
      xanoDataSummary: xanoData ? summarizeData(xanoData) : undefined,
      customInstructions,
    })

    const completion = await callOpenAIChat(
      [{ role: "system", content: systemPrompt }, ...safeMessages],
      { responseFormat: "json_object" }
    )

    const parsed = parseModelReply(completion.reply)
    const validatedPatch = validatePatchAgainstPageContext(parsed.patch, pageContext)

    return NextResponse.json({
      replyText: parsed.replyText,
      patch: validatedPatch,
      meta: {
        usedXano: Boolean(xanoData),
      },
    })
  } catch (error) {
    console.error("Chat API error", error)
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

function stripJsonFences(raw: string) {
  return raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
}

function parseModelReply(raw: string): ModelChatReply {
  const cleaned = stripJsonFences(raw)
  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch (error) {
    throw new ValidationError("Model reply was not valid JSON")
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError("Model reply must be a JSON object")
  }

  if (typeof parsed.replyText !== "string") {
    throw new ValidationError("replyText must be a string")
  }

  const patch = parsed.patch ?? null
  if (patch !== null && (typeof patch !== "object" || Array.isArray(patch))) {
    throw new ValidationError("patch must be an object or null")
  }

  if (patch !== null && !Array.isArray(patch.updates)) {
    throw new ValidationError("patch.updates must be an array")
  }

  const updates = patch?.updates
    ? patch.updates.map((update: any) => ({
        fieldId: update?.fieldId,
        value: update?.value,
      }))
    : []

  return {
    replyText: parsed.replyText,
    patch: patch === null ? null : { updates },
  }
}

function validatePatchAgainstPageContext(patch: FormPatch | null, pageContext?: PageContext): FormPatch | null {
  if (patch === null) return null

  if (!Array.isArray(patch.updates)) {
    throw new ValidationError("patch.updates must be an array")
  }

  const fields = pageContext?.fields || []
  if (!fields.length) {
    throw new ValidationError("pageContext.fields is required when proposing a patch")
  }

  const allowedFields = new Map(
    fields
      .map((field) => ({
        ...field,
        fieldId: field.fieldId || (field as any).id,
      }))
      .filter((field) => field.fieldId)
      .map((field) => [field.fieldId as string, field])
  )

  const validatedUpdates = patch.updates.map((update, index) => {
    if (!update || typeof update.fieldId !== "string") {
      throw new ValidationError(`patch.updates[${index}] is missing a valid fieldId`)
    }

    const field = allowedFields.get(update.fieldId)
    if (!field) {
      throw new ValidationError(`fieldId "${update.fieldId}" is not present in pageContext.fields`)
    }

    if (field.editable !== true) {
      throw new ValidationError(`fieldId "${update.fieldId}" is not editable`)
    }

    return { fieldId: update.fieldId, value: update.value }
  })

  return { updates: validatedUpdates }
}

async function maybeFetchXanoData(question: string) {
  if (!XANO_BASE_URL) return null
  if (!question) return null

  const shouldFetch = /xano|database|stat|kpi|metric|report/i.test(question)
  if (!shouldFetch) return null

  try {
    const response = await fetch(XANO_BASE_URL, {
      headers: {
        Authorization: XANO_API_KEY ? `Bearer ${XANO_API_KEY}` : "",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      console.warn("Xano fetch failed", await response.text())
      return null
    }

    return await response.json()
  } catch (error) {
    console.error("Failed to fetch Xano data", error)
    return null
  }
}

function sanitiseMessages(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  if (!Array.isArray(messages)) return []
  return messages.filter((message) => {
    const role = message?.role
    return role !== "system" && role !== "developer"
  })
}

function resolveMode(mode?: ChatMode | string): ChatMode {
  if (mode === "mediaplan_create" || mode === "mediaplan_edit") {
    return mode
  }
  return "general"
}
























