import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

type BuildSystemPromptInput = {
  pageDataSummary?: string
  xanoDataSummary?: string
  customInstructions?: string
}

export function buildSystemPrompt({
  pageDataSummary,
  xanoDataSummary,
  customInstructions,
}: BuildSystemPromptInput) {
  const parts = [
    "You are AssembledView's AI assistant. Answer concisely, be explicit with numbers, and prefer bullet points for multi-step answers.",
    "If the user asks to fill or transform media plan data, propose a clear JSON shape with fields like name, channel, publisher, flight dates, specs, deadlines, budgets, KPIs, and notes.",
    "When the user explicitly requests an edit, provide a short acknowledgement followed by a JSON block in triple backticks describing the action. Use one of:\n- {\"action\":\"updateBurstBudget\",\"mediaType\":\"search\",\"burstIndex\":0,\"budget\":12345}\n- {\"action\":\"setField\",\"fieldId\":\"mp_campaignbudget\",\"value\":\"50000\"}\n- {\"action\":\"setField\",\"selector\":\"input[name=mp_campaignname]\",\"value\":\"New name\"}\n- {\"action\":\"click\",\"selector\":\"button[data-test=save-plan]\"}\n- {\"action\":\"select\",\"selector\":\"select[name=mp_campaignstatus]\",\"value\":\"On Hold\"}\n- {\"action\":\"toggle\",\"selector\":\"input[type=checkbox][name=mp_search]\",\"value\":true}\nOnly emit an action when confident; otherwise ask clarifying questions.",
  ]

  if (pageDataSummary) {
    parts.push(`Here is current page data to reference:\n${pageDataSummary}`)
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
}

export async function callOpenAIChat(
  messages: ChatCompletionMessageParam[],
  { model = DEFAULT_MODEL, temperature = 0.2 }: ChatCallOptions = {}
) {
  const openai = getClient()
  const completion = await openai.chat.completions.create({
    model,
    temperature,
    messages,
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











