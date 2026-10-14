import assert from "node:assert/strict"
import test from "node:test"

import {
  generateDeckContent,
  type DeckContentClient,
  type DeckContentParseParams,
} from "@/lib/reports/deckContent/generateDeckContent"

const payload = {
  summary: { spend: "$1,200.00", expected: "$1,000.00" },
  audiences: [{ name: "Alpha", spend: "$300.00", impressions: "10,000" }],
}

const validContent = {
  slides: [
    {
      type: "cover",
      variant: "sand",
      title: 'The flight is {i:"on track"}.',
      subtitle: "summary.spend",
    },
    {
      type: "summary",
      variant: "statement",
      title: 'This is the {i:"breaker"}.',
      support: "Spend sits with the plan.",
    },
    {
      type: "summary",
      variant: "stat-row",
      title: 'Spend is {i:"where it should be"}.',
      stats: [{ label: "Spend", key: "summary.spend" }],
      outcome: "Delivery matches the plan.",
    },
    {
      type: "channel",
      variant: "bars",
      title: 'Meta held {i:"its share"}.',
      spend: "audiences.0.spend",
      expected: "summary.expected",
      delivery: [{ label: "Impressions", key: "audiences.0.impressions" }],
      insight: "The audience list matches the payload.",
    },
    {
      type: "iao",
      variant: "rows",
      title: 'Next we {i:"keep the mix"}.',
      rows: [
        { tag: "action", text: "One. Hold the current Meta mix." },
        { tag: "action", text: "Two. Keep TikTok in the plan." },
      ],
    },
    {
      type: "close",
      variant: "thank-you",
      title: 'Thanks for {i:"the brief"}.',
    },
  ],
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

async function withPythonFlag<T>(fn: () => Promise<T>): Promise<T> {
  const renderer = process.env.DECK_RENDERER
  const model = process.env.DECK_CONTENT_MODEL
  const effort = process.env.DECK_CONTENT_EFFORT
  process.env.DECK_RENDERER = "python"
  delete process.env.DECK_CONTENT_MODEL
  delete process.env.DECK_CONTENT_EFFORT
  try {
    return await fn()
  } finally {
    restore("DECK_RENDERER", renderer)
    restore("DECK_CONTENT_MODEL", model)
    restore("DECK_CONTENT_EFFORT", effort)
  }
}

function clientReturning(content: unknown): { client: DeckContentClient; calls: DeckContentParseParams[] } {
  const calls: DeckContentParseParams[] = []
  const client: DeckContentClient = {
    messages: {
      parse: async (params) => {
        calls.push(params)
        return {
          parsed_output: content,
          usage: {
            input_tokens: 250_000,
            output_tokens: 100_000,
            cache_creation_input_tokens: 10_000,
            cache_read_input_tokens: 50_000,
          },
        }
      },
    },
  }
  return { client, calls }
}

test("a valid mocked response passes and logs tokens and cost", async () => {
  const { client, calls } = clientReturning(validContent)
  const logs: unknown[][] = []
  const original = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args)
  }
  try {
    const result = await withPythonFlag(() => generateDeckContent(payload, client))
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.model, "claude-opus-5-5")
    assert.equal(calls[0]?.output_config.effort, "high")
    assert.equal(calls[0]?.output_config.format.type, "json_schema")
    assert.equal("tools" in calls[0]!, false)
    assert.equal(calls[0]?.messages.length, 1)
    assert.deepEqual(result?.content, validContent)
    assert.equal(result?.usage.inputTokens, 250_000)
    assert.equal(result?.usage.outputTokens, 100_000)
    assert.equal(result?.usage.cacheWriteTokens, 10_000)
    assert.equal(result?.usage.cacheReadTokens, 50_000)
    assert.equal(result?.usage.costUsd, 3.06)
    const logged = JSON.stringify(logs)
    assert.match(logged, /\[deck-content\]/)
    assert.match(logged, /3\.06/)
    assert.equal(logged.includes("$1,200.00"), false)
    assert.equal(logged.includes("Australian English"), false)
  } finally {
    console.log = original
  }
})

test("a number that is not in the payload fails validation", async () => {
  const invented = structuredClone(validContent)
  invented.slides[3]!.insight = "Reach was 999."
  const { client } = clientReturning(invented)
  await withPythonFlag(async () => {
    await assert.rejects(() => generateDeckContent(payload, client), /999 is not in the payload/)
  })
})

test("missing fields fail validation", async () => {
  const missing = structuredClone(validContent)
  delete (missing.slides[0] as { title?: string }).title
  const { client } = clientReturning(missing)
  await withPythonFlag(async () => {
    await assert.rejects(() => generateDeckContent(payload, client), /missing title/)
  })
})

test("the flag defaults off and does not call the SDK", async () => {
  const renderer = process.env.DECK_RENDERER
  delete process.env.DECK_RENDERER
  let called = false
  const client: DeckContentClient = {
    messages: {
      parse: async () => {
        called = true
        return { parsed_output: validContent }
      },
    },
  }
  try {
    const result = await generateDeckContent(payload, client)
    assert.equal(result, null)
    assert.equal(called, false)
  } finally {
    restore("DECK_RENDERER", renderer)
  }
})
