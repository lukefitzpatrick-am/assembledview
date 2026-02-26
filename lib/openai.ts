import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import { avaBoundaries, avaIdentity } from "@/src/ava/systemPrompt"
import { avaVoiceSpec } from "@/src/ava/voiceSpec"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

type BuildSystemPromptInput = {
  pageContext?: PageContext
  xanoDataSummary?: string
  snowflakeDataSummary?: string
  customInstructions?: string
}

export type PageField = {
  fieldId?: string
  id?: string
  label?: string
  value?: unknown
  editable?: boolean
  required?: boolean
  type?: string
  options?: { label: string; value: string }[] | string[]
  /**
   * Semantic hint for the model to understand what this field represents.
   * Examples: "client_name", "campaign_name", "media_type", "budget", "date", "status", "boolean_toggle"
   */
  semanticType?: string
  /**
   * Grouping hint for UI sections or logical bundles.
   * Examples: "campaign", "billing", "delivery", "search_container", "social_container"
   */
  group?: string
  /**
   * Where this value came from.
   */
  source?: "xano" | "computed" | "ui"
}

export type PageContext = {
  route?: { pathname?: string; clientSlug?: string; mbaSlug?: string } | string
  fields?: PageField[]
  generatedAt?: string
  /**
   * Structured, read-only snapshot of the current UI state.
   * Use this for "what's happening on this page?" questions (filters, sort, counts, previews).
   */
  state?: Record<string, any>
  /**
   * Optional selector to click after applying a patch (where supported).
   */
  saveSelector?: string
  entities?: {
    clientSlug?: string
    clientName?: string
    mbaNumber?: string
    campaignName?: string
    mediaTypes?: string[]
  }
  pageText?: {
    title?: string
    headings?: string[]
    breadcrumbs?: string[]
  }
}

export type FormPatchUpdate = { fieldId: string; value: unknown }
export type FormPatch = { updates: FormPatchUpdate[] }
export type ModelChatReply = { replyText: string; patch: FormPatch | null }

const jsonReplyContract = [
  "Always respond with JSON only (no prose, markdown, or fences).",
  'Response shape: {"replyText": string, "patch": FormPatch | null}.',
  'FormPatch: {"updates":[{"fieldId":string,"value":any}]}.',
  "If the user did not request a change, return patch as null.",
  "Only include updates for fields explicitly marked editable in the provided page context.",
].join("\n")

export function buildSystemPrompt({
  pageContext,
  xanoDataSummary,
  snowflakeDataSummary,
  customInstructions,
}: BuildSystemPromptInput) {
  const hardRules = [
    "- Ava can only propose edits for field IDs present in provided PageContext and marked editable.",
    "- Do not emit any content outside the required JSON shape.",
    "- If there are no editable fields in the PageContext, you must return patch as null.",
  ].join("\n")

  const editableFields =
    pageContext?.fields
      ?.map((field) => ({
        ...field,
        fieldId: field.fieldId || field.id,
      }))
      .filter((field) => field.fieldId) || []

  const editableFieldSummary = editableFields.length
    ? `Editable field IDs you may update:\n${editableFields
        .filter((field) => field.editable === true)
        .map((field) => `- ${field.fieldId}${field.label ? ` (${field.label})` : ""}`)
        .join("\n")}`
    : undefined

  const entitiesSummary =
    pageContext?.entities && typeof pageContext.entities === "object"
      ? `Page entities:\n${[
          pageContext.entities.clientName ? `- clientName: ${pageContext.entities.clientName}` : undefined,
          pageContext.entities.clientSlug ? `- clientSlug: ${pageContext.entities.clientSlug}` : undefined,
          pageContext.entities.campaignName ? `- campaignName: ${pageContext.entities.campaignName}` : undefined,
          pageContext.entities.mbaNumber ? `- mbaNumber: ${pageContext.entities.mbaNumber}` : undefined,
          Array.isArray(pageContext.entities.mediaTypes) && pageContext.entities.mediaTypes.length
            ? `- mediaTypes: ${pageContext.entities.mediaTypes.join(", ")}`
            : undefined,
        ]
          .filter(Boolean)
          .join("\n")}`
      : undefined

  const pageTextSummary =
    pageContext?.pageText && typeof pageContext.pageText === "object"
      ? `Page text:\n${[
          pageContext.pageText.title ? `- title: ${pageContext.pageText.title}` : undefined,
          Array.isArray(pageContext.pageText.breadcrumbs) && pageContext.pageText.breadcrumbs.length
            ? `- breadcrumbs: ${pageContext.pageText.breadcrumbs.join(" > ")}`
            : undefined,
          Array.isArray(pageContext.pageText.headings) && pageContext.pageText.headings.length
            ? `- headings: ${pageContext.pageText.headings.join(" | ")}`
            : undefined,
        ]
          .filter(Boolean)
          .join("\n")}`
      : undefined

  const pageStateSummary =
    pageContext?.state && typeof pageContext.state === "object"
      ? `Page state snapshot (UI):\n${stringifyAvaContext(pageContext.state, {
          maxArrayItems: 6,
          maxStringLength: 400,
          maxOutputChars: 6000,
        })}`
      : undefined

  const parts = [
    avaIdentity,
    avaBoundaries,
    `Voice rules:\n${avaVoiceSpec}`,
    `Hard rules:\n${hardRules}`,
    `Response contract:\n${jsonReplyContract}`,
  ]

  if (entitiesSummary) {
    parts.push(entitiesSummary)
  }

  if (pageTextSummary) {
    parts.push(pageTextSummary)
  }

  if (pageStateSummary) {
    parts.push(pageStateSummary)
  }

  if (editableFieldSummary) {
    parts.push(editableFieldSummary)
  }

  if (xanoDataSummary) {
    parts.push(`Relevant Xano data:\n${xanoDataSummary}`)
  }

  if (snowflakeDataSummary) {
    parts.push(`Relevant Snowflake delivery data:\n${snowflakeDataSummary}`)
  }

  if (customInstructions) {
    parts.push(`Additional instructions:\n${customInstructions}`)
  }

  return parts.join("\n\n")
}

function stringifyAvaContext(
  value: unknown,
  {
    maxArrayItems,
    maxStringLength,
    maxOutputChars,
  }: { maxArrayItems: number; maxStringLength: number; maxOutputChars: number }
): string {
  const seen = new WeakSet<object>()

  const coerce = (input: any, depth: number): any => {
    if (input === null || input === undefined) return input
    if (typeof input === "number" || typeof input === "boolean") return input
    if (typeof input === "string") {
      if (input.length <= maxStringLength) return input
      return `${input.slice(0, maxStringLength)}…`
    }
    if (input instanceof Date) return input.toISOString()
    if (Array.isArray(input)) {
      const head = input.slice(0, maxArrayItems).map((v) => coerce(v, depth + 1))
      return input.length > maxArrayItems ? [...head, `… (${input.length - maxArrayItems} more)`] : head
    }
    if (typeof input === "object") {
      if (seen.has(input)) return "[Circular]"
      seen.add(input)
      if (depth > 6) return "[MaxDepth]"
      const out: Record<string, any> = {}
      for (const [k, v] of Object.entries(input)) {
        out[k] = coerce(v, depth + 1)
      }
      return out
    }
    return String(input)
  }

  let raw = ""
  try {
    raw = JSON.stringify(coerce(value, 0), null, 2)
  } catch {
    raw = "Unserializable page state."
  }
  if (raw.length <= maxOutputChars) return raw
  return `${raw.slice(0, maxOutputChars)}\n… (truncated)`
}

function getClient() {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set")
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY })
}

export type ChatCallOptions = {
  model?: string
  temperature?: number
  responseFormat?: "json_object" | "text"
}

export async function callOpenAIChat(
  messages: ChatCompletionMessageParam[],
  { model = DEFAULT_MODEL, temperature = 0.2, responseFormat }: ChatCallOptions = {}
) {
  const openai = getClient()
  const completion = await openai.chat.completions.create({
    model,
    temperature,
    messages,
    response_format: responseFormat ? { type: responseFormat } : undefined,
  })

  const reply = completion.choices[0]?.message?.content || ""
  return { reply, completion }
}

export function summarizeData(data: unknown) {
  if (!data) return "No data provided."
  if (typeof data === "string") return data
  try {
    return JSON.stringify(data, null, 2)
  } catch (error) {
    console.error("Failed to stringify data for summary", error)
    return "Unserializable data."
  }
}











