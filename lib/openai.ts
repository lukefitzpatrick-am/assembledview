import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import { avaBoundaries, avaIdentity } from "@/src/ava/systemPrompt"
import { avaVoiceSpec } from "@/src/ava/voiceSpec"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

type BuildSystemPromptInput = {
  pageContext?: PageContext
  xanoDataSummary?: string
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
}

export type PageContext = {
  route?: { pathname?: string; clientSlug?: string; mbaSlug?: string } | string
  fields?: PageField[]
  generatedAt?: string
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
  customInstructions,
}: BuildSystemPromptInput) {
  const hardRules = [
    "- Ava can only propose edits for field IDs present in provided PageContext and marked editable.",
    "- Do not emit any content outside the required JSON shape.",
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

  const parts = [
    avaIdentity,
    avaBoundaries,
    `Voice rules:\n${avaVoiceSpec}`,
    `Hard rules:\n${hardRules}`,
    `Response contract:\n${jsonReplyContract}`,
  ]

  if (editableFieldSummary) {
    parts.push(editableFieldSummary)
  }

  if (xanoDataSummary) {
    parts.push(`Relevant Xano data:\n${xanoDataSummary}`)
  }

  if (customInstructions) {
    parts.push(`Additional instructions:\n${customInstructions}`)
  }

  return parts.join("\n\n")
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











