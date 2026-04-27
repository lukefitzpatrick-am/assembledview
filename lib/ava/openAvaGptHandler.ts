import { NextResponse } from "next/server"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import { getModeInstructions, type ChatMode } from "@/src/ava/modes"
import {
  buildSystemPrompt,
  callOpenAIChat,
  type FormPatch,
  type ModelChatReply,
  type PageContext,
} from "@/lib/openai"
import { getAvaXanoSummary } from "@/lib/xano/ava"
import { getAvaSnowflakeSummary } from "@/lib/avaSnowflake"

class AvaGptValidationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export type AvaOpenGptBody = {
  messages?: ChatCompletionMessageParam[]
  pageContext?: PageContext
  mode?: ChatMode
}

/**
 * OpenAI (GPT) AVA path — extracted from the former `/api/chat` route.
 */
export async function handleOpenAvaGptChat(roles: string[], body: AvaOpenGptBody) {
  const { messages, pageContext, mode } = body
  const incomingMessages = Array.isArray(messages) ? messages : []
  const resolvedMode = resolveMode(mode)
  const safeMessages = sanitiseMessages(incomingMessages)

  const { clientSlug, mbaNumber } = deriveAvaIdentifiers(pageContext)
  const xanoDataSummary = await getAvaXanoSummary({ clientSlug, mbaNumber }).catch((error) => {
    console.warn("[AVA] Xano summary fetch failed", {
      mbaNumber,
      clientSlug,
      error: error instanceof Error ? error.message : String(error),
    })
    return ""
  })

  const dateRange = deriveAvaDateRange(pageContext)
  const snowflakeDataSummary =
    mbaNumber && roles.includes("admin")
      ? await getAvaSnowflakeSummary({
          mbaNumber,
          dateFrom: dateRange?.dateFrom,
          dateTo: dateRange?.dateTo,
        }).catch((error) => {
          console.warn("[AVA] Snowflake summary fetch failed", {
            mbaNumber,
            error: error instanceof Error ? error.message : String(error),
          })
          return ""
        })
      : ""

  const customInstructions = getModeInstructions(resolvedMode, pageContext)
  const systemPrompt = buildSystemPrompt({
    pageContext,
    xanoDataSummary: xanoDataSummary || undefined,
    snowflakeDataSummary: snowflakeDataSummary || undefined,
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
      usedXano: Boolean(xanoDataSummary),
    },
  })
}

function stripJsonFences(raw: string) {
  return raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
}

function parseModelReply(raw: string): ModelChatReply {
  const cleaned = stripJsonFences(raw)
  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new AvaGptValidationError("Model reply was not valid JSON")
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AvaGptValidationError("Model reply must be a JSON object")
  }

  if (typeof parsed.replyText !== "string") {
    throw new AvaGptValidationError("replyText must be a string")
  }

  const patch = parsed.patch ?? null
  if (patch !== null && (typeof patch !== "object" || Array.isArray(patch))) {
    throw new AvaGptValidationError("patch must be an object or null")
  }

  if (patch !== null && !Array.isArray(patch.updates)) {
    throw new AvaGptValidationError("patch.updates must be an array")
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
    throw new AvaGptValidationError("patch.updates must be an array")
  }

  const fields = pageContext?.fields || []
  if (!fields.length) {
    return null
  }

  const editableFieldCount = fields.filter((f: any) => f?.editable === true).length
  if (editableFieldCount === 0) {
    return null
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
      throw new AvaGptValidationError(`patch.updates[${index}] is missing a valid fieldId`)
    }

    const field = allowedFields.get(update.fieldId)
    if (!field) {
      throw new AvaGptValidationError(`fieldId "${update.fieldId}" is not present in pageContext.fields`)
    }

    if (field.editable !== true) {
      throw new AvaGptValidationError(`fieldId "${update.fieldId}" is not editable`)
    }

    return { fieldId: update.fieldId, value: update.value }
  })

  return { updates: validatedUpdates }
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

function deriveAvaDateRange(pageContext?: PageContext): { dateFrom?: string; dateTo?: string } | null {
  const fields = Array.isArray(pageContext?.fields) ? pageContext?.fields : []
  const getFieldValue = (fieldId: string) => {
    const match = fields.find((f: any) => (f?.fieldId || f?.id) === fieldId)
    return match?.value
  }

  const startRaw = getFieldValue("mp_campaigndates_start")
  const endRaw = getFieldValue("mp_campaigndates_end")

  const toISO = (v: any): string | undefined => {
    if (!v) return undefined
    if (typeof v === "string") {
      const dt = new Date(v)
      if (Number.isNaN(dt.getTime())) return undefined
      return dt.toISOString().slice(0, 10)
    }
    const dt = new Date(String(v))
    if (Number.isNaN(dt.getTime())) return undefined
    return dt.toISOString().slice(0, 10)
  }

  const dateFrom = toISO(startRaw)
  const dateTo = toISO(endRaw)
  if (!dateFrom && !dateTo) return null
  return { dateFrom, dateTo }
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

export function isAvaGptValidationError(error: unknown): error is AvaGptValidationError {
  return error instanceof AvaGptValidationError
}

export function avaGptErrorResponse(error: AvaGptValidationError) {
  return NextResponse.json({ error: error.message }, { status: error.status })
}
