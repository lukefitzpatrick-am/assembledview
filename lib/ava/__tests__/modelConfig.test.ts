import assert from "node:assert/strict"
import test from "node:test"

import {
  anthropicParamsFor,
  autopopulateAnthropicParams,
  completeClaudeMessage,
  messagesUseReportProfile,
  profiles,
  resetAvaModelConfigWarningsForTests,
  resolveTurnProfile,
} from "@/lib/ava/modelConfig"

const PROFILE_ENV = [
  "AVA_CHAT_MODEL",
  "AVA_CHAT_EFFORT",
  "AVA_CHAT_MAX_TOKENS",
  "AVA_REPORT_MODEL",
  "AVA_REPORT_EFFORT",
  "AVA_REPORT_MAX_TOKENS",
  "ANTHROPIC_MODEL",
  "AVA_MAX_TOKENS",
  "INGEST_AUDIT_MODEL",
] as const

function withEnv(
  vars: Partial<Record<(typeof PROFILE_ENV)[number], string | undefined>>,
  fn: () => void | Promise<void>,
): Promise<void> | void {
  const prev: Partial<Record<(typeof PROFILE_ENV)[number], string | undefined>> = {}
  for (const key of PROFILE_ENV) {
    prev[key] = process.env[key]
    const next = key in vars ? vars[key] : undefined
    if (next === undefined) delete process.env[key]
    else process.env[key] = next
  }
  resetAvaModelConfigWarningsForTests()
  const restore = () => {
    for (const key of PROFILE_ENV) {
      const value = prev[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    resetAvaModelConfigWarningsForTests()
  }
  try {
    const result = fn()
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).finally(restore)
    }
    restore()
  } catch (err) {
    restore()
    throw err
  }
}

test("profiles use Opus 5.5 defaults", () => {
  withEnv({}, () => {
    const resolved = profiles()
    assert.deepEqual(resolved.chat, {
      model: "claude-opus-5-5",
      effort: "medium",
      maxTokens: 16000,
    })
    assert.deepEqual(resolved.report, {
      model: "claude-opus-5-5",
      effort: "high",
      maxTokens: 32000,
    })
    assert.deepEqual(anthropicParamsFor("chat"), {
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
    })
    assert.equal(anthropicParamsFor("chat").output_config.effort, "medium")
    assert.equal("thinking" in anthropicParamsFor("report"), false)
  })
})

test("env overrides model, effort and max tokens", () => {
  withEnv(
    {
      AVA_CHAT_MODEL: "claude-opus-5-5-custom",
      AVA_CHAT_EFFORT: "low",
      AVA_CHAT_MAX_TOKENS: "4000",
      AVA_REPORT_MODEL: "claude-opus-5-5-report",
      AVA_REPORT_EFFORT: "max",
      AVA_REPORT_MAX_TOKENS: "8000",
    },
    () => {
      const resolved = profiles()
      assert.equal(resolved.chat.model, "claude-opus-5-5-custom")
      assert.equal(resolved.chat.effort, "low")
      assert.equal(resolved.chat.maxTokens, 4000)
      assert.equal(resolved.report.model, "claude-opus-5-5-report")
      assert.equal(resolved.report.effort, "max")
      assert.equal(resolved.report.maxTokens, 8000)
    },
  )
})

test("invalid effort falls back and warns once", () => {
  withEnv({ AVA_CHAT_EFFORT: "turbo", AVA_REPORT_EFFORT: "nope" }, () => {
    const warnings: string[] = []
    const original = console.warn
    console.warn = (message?: unknown) => {
      warnings.push(String(message))
    }
    try {
      const first = profiles()
      const second = profiles()
      assert.equal(first.chat.effort, "medium")
      assert.equal(first.report.effort, "high")
      assert.equal(second.chat.effort, "medium")
      assert.equal(
        warnings.filter((line) => line.includes("AVA_CHAT_EFFORT")).length,
        1,
      )
      assert.equal(
        warnings.filter((line) => line.includes("AVA_REPORT_EFFORT")).length,
        1,
      )
    } finally {
      console.warn = original
    }
  })
})

test("ANTHROPIC_MODEL warns once and is ignored", () => {
  withEnv({ ANTHROPIC_MODEL: "claude-sonnet-4-5" }, () => {
    const warnings: string[] = []
    const original = console.warn
    console.warn = (message?: unknown) => {
      warnings.push(String(message))
    }
    try {
      assert.equal(profiles().chat.model, "claude-opus-5-5")
      profiles()
      assert.equal(warnings.length, 1)
      assert.match(warnings[0] ?? "", /ANTHROPIC_MODEL is ignored/)
    } finally {
      console.warn = original
    }
  })
})

test("autopopulate uses the report model at medium and 64000 tokens", () => {
  withEnv({ AVA_REPORT_MODEL: "claude-opus-5-5" }, () => {
    assert.deepEqual(autopopulateAnthropicParams(), {
      model: "claude-opus-5-5",
      max_tokens: 64000,
      output_config: { effort: "medium" },
    })
  })
})

test("a loaded report skill switches the turn to report", () => {
  const plain = [{ role: "user" as const, content: "What is pacing?" }]
  assert.equal(messagesUseReportProfile(plain), false)
  assert.equal(resolveTurnProfile(plain), "chat")
  assert.equal(
    messagesUseReportProfile([
      {
        role: "user",
        content: "Please use assembled-performance-review-report",
      },
    ]),
    false,
  )

  const loaded = [
    {
      role: "user" as const,
      content: [
        {
          type: "tool_result" as const,
          tool_use_id: "tu_1",
          content: "skillId: assembled-campaign-read\nversion: 1.4.0\n",
        },
      ],
    },
  ]
  assert.equal(messagesUseReportProfile(loaded), true)
  assert.equal(resolveTurnProfile(loaded), "report")
  assert.equal(resolveTurnProfile(plain, "report"), "report")

  const requested = [
    {
      role: "assistant" as const,
      content: [
        {
          type: "tool_use" as const,
          id: "tu_2",
          name: "load_skill",
          input: { skillId: "assembled-brand" },
        },
      ],
    },
  ]
  assert.equal(messagesUseReportProfile(requested), true)
})

test("completeClaudeMessage never sends thinking disabled", async () => {
  await withEnv({}, async () => {
    const seen: Array<Record<string, unknown>> = []
    const client = {
      messages: {
        create: async (body: Record<string, unknown>) => {
          seen.push(body)
          return {
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 4, output_tokens: 5 },
            model: body.model,
          }
        },
        stream: () => {
          throw new Error("chat profile under the token ceiling must not stream")
        },
      },
    }
    const logs: unknown[] = []
    const original = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args)
    }
    try {
      await completeClaudeMessage(
        client as never,
        "chat",
        {
          messages: [{ role: "user", content: "hello" }],
          thinking: { type: "disabled" },
        },
      )
    } finally {
      console.log = original
    }
    assert.equal(seen.length, 1)
    assert.equal("thinking" in (seen[0] ?? {}), false)
    assert.equal(seen[0]?.model, "claude-opus-5-5")
    assert.deepEqual(seen[0]?.output_config, { effort: "medium" })
    const line = logs.find(
      (entry) => Array.isArray(entry) && entry[0] === "[ava] claude",
    ) as unknown[] | undefined
    assert.ok(line)
    assert.deepEqual(line?.[1], {
      profile: "chat",
      model: "claude-opus-5-5",
      effort: "medium",
      input_tokens: 4,
      output_tokens: 5,
      duration_ms: (line?.[1] as { duration_ms: number }).duration_ms,
    })
    assert.equal(
      JSON.stringify(line).includes("hello"),
      false,
    )
  })
})
