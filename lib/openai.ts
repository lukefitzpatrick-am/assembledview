import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"

/**
 * OpenAI helper retained for media-plan extraction (`lib/planParser.ts`) only.
 * Ava chat uses Anthropic via `lib/ava/agentLoop.ts`.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

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
  { model = DEFAULT_MODEL, temperature = 0.2, responseFormat }: ChatCallOptions = {},
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
