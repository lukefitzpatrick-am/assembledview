import { NextRequest, NextResponse } from "next/server"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import { buildSystemPrompt, callOpenAIChat, summarizeData } from "@/lib/openai"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const XANO_BASE_URL =
  process.env.XANO_ASSISTANT_ENDPOINT ||
  process.env.XANO_BASE_URL ||
  process.env.XANO_MEDIA_PLANS_BASE_URL ||
  ""
const XANO_API_KEY = process.env.XANO_API_KEY || ""

type ChatRequestBody = {
  messages?: ChatCompletionMessageParam[]
  pageDataSummary?: string
  systemInstructions?: string
}

export async function POST(req: NextRequest) {
  try {
    const { messages = [], pageDataSummary, systemInstructions }: ChatRequestBody = await req.json()
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")
    const userQuestion = typeof lastUserMessage?.content === "string" ? lastUserMessage.content : ""

    const xanoData = await maybeFetchXanoData(userQuestion)
    const systemPrompt = buildSystemPrompt({
      pageDataSummary,
      xanoDataSummary: xanoData ? summarizeData(xanoData) : undefined,
      customInstructions: systemInstructions,
    })

    const completion = await callOpenAIChat([{ role: "system", content: systemPrompt }, ...messages])

    return NextResponse.json({
      reply: completion.reply,
      meta: {
        usedXano: Boolean(xanoData),
      },
    })
  } catch (error) {
    console.error("Chat API error", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
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













