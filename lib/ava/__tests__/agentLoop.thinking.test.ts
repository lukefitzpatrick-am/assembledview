import assert from "node:assert/strict"
import test from "node:test"
import type Anthropic from "@anthropic-ai/sdk"

import { runAvaAgent } from "@/lib/ava/agentLoop"
import type { AvaToolContext } from "@/lib/ava/tools/types"

const THINKING = {
  type: "thinking" as const,
  thinking: "Check the delivery snapshot before answering.",
  signature: "sig-keep",
}

function context(): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: undefined,
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: undefined,
    userEmail: "luke@assembledmedia.com.au",
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    pendingIngest: null,
    capturedLineItemsLoad: null,
    currentLineItems: null,
  }
}

function disablesThinking(body: Record<string, unknown>): boolean {
  const thinking = body.thinking
  return (
    !!thinking &&
    typeof thinking === "object" &&
    (thinking as { type?: string }).type === "disabled"
  )
}

test("agent loop replays thinking blocks and never disables thinking", async () => {
  const seen: Array<Record<string, unknown>> = []
  let step = 0
  const client = {
    messages: {
      create: async (body: Record<string, unknown>) => {
        seen.push(body)
        step += 1
        if (step === 1) {
          return {
            stop_reason: "tool_use",
            model: "claude-opus-5-5",
            usage: { input_tokens: 10, output_tokens: 20 },
            content: [
              THINKING,
              {
                type: "tool_use",
                id: "tu_1",
                name: "not_a_real_tool",
                input: {},
              },
            ],
          }
        }
        return {
          stop_reason: "end_turn",
          model: "claude-opus-5-5",
          usage: { input_tokens: 11, output_tokens: 6 },
          content: [{ type: "text", text: "Done." }],
        }
      },
      stream: () => {
        throw new Error("chat turn must not stream")
      },
    },
  }

  const result = await runAvaAgent({
    systemPrompt: "You are Ava.",
    messages: [{ role: "user", content: "Hello" }],
    context: context(),
    client: client as unknown as Anthropic,
  })

  assert.equal(result.replyText, "Done.")
  assert.equal(result.replyText.includes(THINKING.thinking), false)
  assert.equal(seen.length, 2)
  for (const body of seen) {
    assert.equal(disablesThinking(body), false)
    assert.equal("thinking" in body, false)
  }
  const second = seen[1]
  const messages = second?.messages as Array<{
    role: string
    content: unknown
  }>
  const assistant = messages.find((message) => message.role === "assistant")
  assert.ok(assistant)
  assert.deepEqual(
    (assistant.content as unknown[])[0],
    THINKING,
  )
})

test("a loaded report skill streams the rest of the turn on the report profile", async () => {
  const created: Array<Record<string, unknown>> = []
  const streamed: Array<Record<string, unknown>> = []
  const client = {
    messages: {
      create: async (body: Record<string, unknown>) => {
        created.push(body)
        return {
          stop_reason: "tool_use",
          model: "claude-opus-5-5",
          usage: { input_tokens: 3, output_tokens: 4 },
          content: [
            THINKING,
            {
              type: "tool_use",
              id: "tu_skill",
              name: "load_skill",
              input: { skillId: "assembled-insight-commentary" },
            },
          ],
        }
      },
      stream: (body: Record<string, unknown>) => {
        streamed.push(body)
        return {
          finalMessage: async () => ({
            stop_reason: "end_turn",
            model: "claude-opus-5-5",
            usage: { input_tokens: 30, output_tokens: 12 },
            content: [{ type: "text", text: "Insight, then action." }],
          }),
        }
      },
    },
  }

  const result = await runAvaAgent({
    systemPrompt: "You are Ava.",
    messages: [{ role: "user", content: "Write the commentary." }],
    context: context(),
    client: client as unknown as Anthropic,
  })

  assert.equal(result.replyText, "Insight, then action.")
  assert.equal(result.profile, "report")
  assert.equal(result.effort, "high")
  assert.equal(created.length, 1)
  assert.equal(streamed.length, 1)
  assert.equal(created[0]?.max_tokens, 16000)
  assert.deepEqual(created[0]?.output_config, { effort: "medium" })
  assert.equal(streamed[0]?.max_tokens, 32000)
  assert.deepEqual(streamed[0]?.output_config, { effort: "high" })
  assert.equal(streamed[0]?.model, "claude-opus-5-5")
  assert.equal(disablesThinking(created[0] ?? {}), false)
  assert.equal(disablesThinking(streamed[0] ?? {}), false)
  const messages = streamed[0]?.messages as Array<{
    role: string
    content: unknown
  }>
  const assistant = messages.find((message) => message.role === "assistant")
  assert.deepEqual((assistant?.content as unknown[])[0], THINKING)
})
