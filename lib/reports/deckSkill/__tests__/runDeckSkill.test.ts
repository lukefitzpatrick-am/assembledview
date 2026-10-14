import assert from "node:assert/strict"
import test from "node:test"

import Anthropic from "@anthropic-ai/sdk"
import JSZip from "jszip"

import { buildDeckForRun } from "@/lib/reports/deckJobs/runOnDemandDeck"
import {
  createDeckSkillClient,
  runDeckSkill,
  type DeckSkillClient,
  type DeckSkillMessage,
} from "@/lib/reports/deckSkill/runDeckSkill"
import {
  assertDeckSkillPaidConfirm,
  deckSkillOnceReportInput,
  runDeckSkillOnce,
} from "../../../../scripts/reports/run-deck-skill-once"

const savedKey = process.env.ANTHROPIC_API_KEY
delete process.env.ANTHROPIC_API_KEY

const RUN = { mbaNumber: "curatif004", periodStart: "2026-09-01", periodEnd: "2026-09-30" }
const NODE_BUFFER = Buffer.from("node-deck")
const FILE_NAME = "curatif-spring-report-campaign-to-date-2026-09-30.pptx"

const report = {
  mbaNumber: "curatif004",
  clientName: "Curatif",
  campaignName: "Spring",
  versionNumber: 1,
  asOf: "2026-09-30",
  period: { kind: "campaign_to_date", label: "Campaign to date" },
  totals: { spend: 1200, expected: 1000 },
  channels: [
    {
      group: "social_meta",
      label: "Meta",
      notLive: false,
      spend: 1000,
      adSets: [
        { name: "Parents", spend: 600, impressions: 10000, results: 40, clicks: 100, resultLabel: "Results" },
        { name: "Lookalikes", spend: 400, impressions: 8000, results: 20, clicks: 80, resultLabel: "Results" },
      ],
    },
  ],
  kpis: [],
  commentary: null,
}

const kit = {
  template: Buffer.from("potx"),
  photos: [
    { filename: "family-1.jpg", bytes: Buffer.from("a") },
    { filename: "travel-1.jpg", bytes: Buffer.from("b") },
    { filename: "family-2.jpg", bytes: Buffer.from("c") },
  ],
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

async function pptx(slides: number): Promise<Buffer> {
  const zip = new JSZip()
  zip.file("ppt/presentation.xml", "<p:presentation></p:presentation>")
  for (let i = 1; i <= slides; i += 1) zip.file(`ppt/slides/slide${i}.xml`, "<p:sld></p:sld>")
  return zip.generateAsync({ type: "nodebuffer" })
}

function skillContent(fileId: string): unknown[] {
  return [
    {
      type: "server_tool_use",
      id: "tool_1",
      name: "bash_code_execution",
      input: { command: "python /skills/av-campaign-report-v5/scripts/check_deck.py" },
    },
    {
      type: "bash_code_execution_tool_result",
      tool_use_id: "tool_1",
      content: {
        type: "bash_code_execution_result",
        stdout: "OK\n",
        stderr: "",
        return_code: 0,
        content: [{ type: "bash_code_execution_output", file_id: fileId }],
      },
    },
  ]
}

type MockState = {
  creates: Record<string, unknown>[]
  uploads: { id: string; filename: string; bytes: Buffer }[]
  deleted: string[]
  downloads: string[]
}

function mockClient(options: {
  respond: (call: number) => DeckSkillMessage | Promise<DeckSkillMessage>
  pptx?: Buffer
}): { client: DeckSkillClient; state: MockState } {
  const state: MockState = { creates: [], uploads: [], deleted: [], downloads: [] }
  let uploadCount = 0
  const client: DeckSkillClient = {
    beta: {
      files: {
        async upload(params) {
          uploadCount += 1
          const id = `up_${uploadCount}`
          const file = params.file as { name?: string; arrayBuffer?: () => Promise<ArrayBuffer> }
          const bytes = file.arrayBuffer ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0)
          state.uploads.push({ id, filename: file.name ?? "", bytes })
          return { id, filename: file.name }
        },
        async download(fileId) {
          state.downloads.push(fileId)
          const bytes = options.pptx ?? Buffer.from("not-a-deck")
          return { arrayBuffer: async () => Uint8Array.from(bytes).buffer }
        },
        async delete(fileId) {
          state.deleted.push(fileId)
          return { id: fileId }
        },
        async retrieveMetadata(fileId) {
          return { filename: fileId === "file_out" ? "curatif004.pptx" : "note.txt" }
        },
      },
      messages: {
        async create(body) {
          state.creates.push(body)
          return options.respond(state.creates.length)
        },
      },
    },
  }
  return { client, state }
}

function loadReport() {
  return Promise.resolve({ report, fileName: FILE_NAME, skipped: null })
}

function nodeGenerate() {
  return Promise.resolve({
    buffer: NODE_BUFFER,
    fileName: FILE_NAME,
    commentaryGenerated: false,
    commentary: null,
    periodMonth: "2026-09",
  })
}

test.after(() => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = savedKey
})

test("flag off builds the node deck and does not call the SDK", async () => {
  const renderer = process.env.DECK_RENDERER
  const { client, state } = mockClient({ respond: () => { throw new Error("SDK called") } })
  try {
    for (const value of [undefined, "python"] as const) {
      if (value === undefined) delete process.env.DECK_RENDERER
      else process.env.DECK_RENDERER = value
      const built = await buildDeckForRun(RUN, {
        generate: nodeGenerate,
        loadReport: () => { throw new Error("skill load called") },
        runSkill: () => { throw new Error("SDK called") },
        skill: { client, kit },
      })
      assert.equal(built.buffer.toString(), "node-deck")
      assert.equal(built.note, undefined)
    }
    assert.equal(state.creates.length, 0)
    assert.equal(state.uploads.length, 0)
  } finally {
    restore("DECK_RENDERER", renderer)
  }
})

test("flag skill success returns the pptx and deletes uploaded and output files", async () => {
  const renderer = process.env.DECK_RENDERER
  const skillId = process.env.DECK_SKILL_ID
  const model = process.env.DECK_SKILL_MODEL
  const effort = process.env.DECK_SKILL_EFFORT
  process.env.DECK_RENDERER = "skill"
  process.env.DECK_SKILL_ID = "skill_test_id"
  delete process.env.DECK_SKILL_MODEL
  delete process.env.DECK_SKILL_EFFORT
  const deck = await pptx(4)
  const logs: unknown[][] = []
  const original = console.log
  console.log = (...args: unknown[]) => { logs.push(args) }
  const { client, state } = mockClient({
    pptx: deck,
    respond: () => ({
      stop_reason: "end_turn",
      container: { id: "cont_1" },
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 5 },
      content: skillContent("file_out"),
    }),
  })
  try {
    const built = await buildDeckForRun(RUN, {
      generate: () => { throw new Error("node deck called") },
      loadReport,
      skill: { client, kit },
    })
    assert.equal(built.buffer.equals(deck), true)
    assert.equal(built.fileName, FILE_NAME)
    assert.equal(built.note, undefined)
    assert.equal(state.creates.length, 1)
    const body = state.creates[0] as {
      model: string
      output_config: { effort: string }
      tools: { type: string; name: string }[]
      container: { skills: { type: string; skill_id: string; version: string }[] }
      messages: { content: { type: string; text?: string }[] }[]
    }
    assert.equal(body.model, "claude-opus-5-5")
    assert.equal(body.output_config.effort, "high")
    assert.equal(body.tools[0].name, "code_execution")
    assert.equal(body.container.skills[0].skill_id, "skill_test_id")
    assert.equal(body.container.skills[0].type, "custom")
    const text = body.messages[0].content.find((block) => block.type === "text")?.text ?? ""
    assert.match(text, /Do not view or open images/)
    assert.match(text, /Do not read the skill scripts/)
    assert.match(text, /Do not write your own build script/)
    assert.match(text, /check_deck\.py/)
    const reportUpload = state.uploads.find((file) => file.filename === "report-data.json")
    assert.ok(reportUpload)
    const slim = JSON.parse(reportUpload.bytes.toString()) as { audiences?: { name: string }[] }
    assert.equal(slim.audiences?.length, 2)
    assert.equal(state.uploads.some((file) => file.filename === "Assembled-Media-Template-v5.potx"), true)
    assert.equal(state.uploads.length, 5)
    assert.deepEqual(state.deleted.sort(), ["file_out", "up_1", "up_2", "up_3", "up_4", "up_5"])
    const usage = logs.find((line) => line[0] === "[deck-skill]")?.[1] as {
      input_tokens: number
      output_tokens: number
      cache_read_tokens: number
      cache_write_tokens: number
      cost_usd: number
      wall_ms: number
      steps: { tool: string }[]
    }
    assert.equal(usage.input_tokens, 100)
    assert.equal(usage.output_tokens, 50)
    assert.equal(usage.cache_read_tokens, 5)
    assert.equal(usage.cache_write_tokens, 10)
    assert.equal(usage.cost_usd > 0, true)
    assert.equal(typeof usage.wall_ms, "number")
    assert.equal(usage.steps[0].tool, "bash_code_execution")
  } finally {
    console.log = original
    restore("DECK_RENDERER", renderer)
    restore("DECK_SKILL_ID", skillId)
    restore("DECK_SKILL_MODEL", model)
    restore("DECK_SKILL_EFFORT", effort)
  }
})

test("skill error falls back to the node deck and deletes files", async () => {
  const renderer = process.env.DECK_RENDERER
  const skillId = process.env.DECK_SKILL_ID
  process.env.DECK_RENDERER = "skill"
  process.env.DECK_SKILL_ID = "skill_test_id"
  const { client, state } = mockClient({
    respond: () => { throw new Error("skill exploded") },
  })
  try {
    const built = await buildDeckForRun(RUN, {
      generate: nodeGenerate,
      loadReport,
      skill: { client, kit },
    })
    assert.equal(built.buffer.toString(), "node-deck")
    assert.equal(built.note, "Basic layout: skill exploded")
    assert.equal(state.creates.length, 1)
    assert.deepEqual(state.deleted.sort(), ["up_1", "up_2", "up_3", "up_4", "up_5"])
  } finally {
    restore("DECK_RENDERER", renderer)
    restore("DECK_SKILL_ID", skillId)
  }
})

test("cost cap stops the skill and falls back to the node deck", async () => {
  const renderer = process.env.DECK_RENDERER
  const skillId = process.env.DECK_SKILL_ID
  process.env.DECK_RENDERER = "skill"
  process.env.DECK_SKILL_ID = "skill_test_id"
  const deck = await pptx(4)
  const { client, state } = mockClient({
    pptx: deck,
    respond: () => ({
      stop_reason: "pause_turn",
      container: { id: "cont_1" },
      usage: { input_tokens: 0, output_tokens: 30_001, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      content: skillContent("file_out"),
    }),
  })
  try {
    const built = await buildDeckForRun(RUN, {
      generate: nodeGenerate,
      loadReport,
      skill: { client, kit },
    })
    assert.equal(state.creates.length, 1)
    assert.equal(built.buffer.toString(), "node-deck")
    assert.equal(built.note, "Basic layout: Cost cap of $0.60")
    assert.equal(state.deleted.includes("file_out"), true)
    assert.equal(state.uploads.every((file) => state.deleted.includes(file.id)), true)
  } finally {
    restore("DECK_RENDERER", renderer)
    restore("DECK_SKILL_ID", skillId)
  }
})

test("pause_turn continues on the same container while under the cap", async () => {
  const skillId = process.env.DECK_SKILL_ID
  process.env.DECK_SKILL_ID = "skill_test_id"
  const deck = await pptx(4)
  const { client, state } = mockClient({
    pptx: deck,
    respond: (call) => call === 1
      ? {
          stop_reason: "pause_turn",
          container: { id: "cont_1" },
          usage: { input_tokens: 10, output_tokens: 10 },
          content: [],
        }
      : {
          stop_reason: "end_turn",
          container: { id: "cont_1" },
          usage: { input_tokens: 10, output_tokens: 10 },
          content: skillContent("file_out"),
        },
  })
  try {
    const built = await runDeckSkill(
      { mbaNumber: "curatif004", report, fileName: FILE_NAME },
      { client, kit },
    )
    assert.equal(built.buffer.equals(deck), true)
    assert.equal(state.creates.length, 2)
    const second = state.creates[1] as { container: { id?: string }; messages: { role: string }[] }
    assert.equal(second.container.id, "cont_1")
    assert.equal(second.messages.some((message) => message.role === "assistant"), true)
  } finally {
    restore("DECK_SKILL_ID", skillId)
  }
})

test("wall time stops the skill and falls back", async () => {
  const renderer = process.env.DECK_RENDERER
  const skillId = process.env.DECK_SKILL_ID
  process.env.DECK_RENDERER = "skill"
  process.env.DECK_SKILL_ID = "skill_test_id"
  let nowMs = 0
  const deck = await pptx(4)
  const { client, state } = mockClient({
    pptx: deck,
    respond: () => {
      nowMs = 240_000
      return {
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 10 },
        content: skillContent("file_out"),
      }
    },
  })
  try {
    const built = await buildDeckForRun(RUN, {
      generate: nodeGenerate,
      loadReport,
      skill: { client, kit, now: () => nowMs },
    })
    assert.equal(state.creates.length, 1)
    assert.equal(built.note, "Basic layout: Wall time of 240 seconds")
    assert.equal(built.buffer.toString(), "node-deck")
    assert.equal(state.deleted.includes("file_out"), true)
  } finally {
    restore("DECK_RENDERER", renderer)
    restore("DECK_SKILL_ID", skillId)
  }
})

test("the once-script refuses without --confirm-paid", async () => {
  assert.throws(() => assertDeckSkillPaidConfirm(["curatif004"]), /--confirm-paid/)
  await assert.rejects(() => runDeckSkillOnce(["curatif004"]), /Refusing to run without --confirm-paid/)
})

test("the client used has a client-level timeout", async () => {
  const base = new Anthropic({ apiKey: "sk-test-not-used" })
  const client = createDeckSkillClient(base) as unknown as Anthropic
  assert.equal(client.timeout, 300_000)
  assert.equal(client.maxRetries, 1)
  const options = (client as unknown as { _options: { timeout?: number; maxRetries?: number } })._options
  assert.equal(options.timeout, 300_000)
  assert.equal(options.maxRetries, 1)

  const bare = new Anthropic({
    apiKey: "sk-test-not-used",
    fetch: async () => {
      throw new Error("fetch should not run")
    },
  })
  assert.throws(
    () => bare.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 32_000,
      messages: [{ role: "user", content: "ping" }],
    }),
    /Streaming is required/,
  )

  let fetched = false
  const guarded = createDeckSkillClient(new Anthropic({
    apiKey: "sk-test-not-used",
    fetch: async () => {
      fetched = true
      return new Response(JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        model: "claude-opus-5-5",
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    },
  })) as unknown as Anthropic
  try {
    await guarded.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 32_000,
      messages: [{ role: "user", content: "ping" }],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    assert.equal(/Streaming is required/.test(message), false, message)
  }
  assert.equal(fetched, true)

  const fallback = createDeckSkillClient({ apiKey: "sk-fallback" }) as unknown as Anthropic
  assert.equal(fallback.timeout, 300_000)
  assert.equal(fallback.maxRetries, 1)
  assert.equal(fallback.apiKey, "sk-fallback")
  assert.equal(
    (fallback as unknown as { _options: { timeout?: number } })._options.timeout,
    300_000,
  )
})

test("skill path loads without commentary and the fallback rebuilds with it", async () => {
  const renderer = process.env.DECK_RENDERER
  const skillId = process.env.DECK_SKILL_ID
  process.env.DECK_RENDERER = "skill"
  process.env.DECK_SKILL_ID = "skill_test_id"
  const deck = await pptx(4)
  const loads: { withCommentary: boolean }[] = []
  const generates: { withCommentary: boolean; commentary?: unknown }[] = []
  const { client } = mockClient({
    pptx: deck,
    respond: () => ({
      stop_reason: "end_turn",
      container: { id: "cont_1" },
      usage: { input_tokens: 1, output_tokens: 1 },
      content: skillContent("file_out"),
    }),
  })
  try {
    const built = await buildDeckForRun(RUN, {
      generate: (input) => {
        generates.push(input)
        return nodeGenerate()
      },
      loadReport: (input) => {
        loads.push(input)
        return loadReport()
      },
      skill: { client, kit },
    })
    assert.equal(built.buffer.equals(deck), true)
    assert.equal(loads.length, 1)
    assert.equal(loads[0]?.withCommentary, false)
    assert.equal(generates.length, 0)

    generates.length = 0
    const failed = mockClient({
      respond: () => { throw new Error("skill exploded") },
    })
    const fallback = await buildDeckForRun(RUN, {
      generate: (input) => {
        generates.push(input)
        return nodeGenerate()
      },
      loadReport: (input) => {
        assert.equal(input.withCommentary, false)
        return loadReport()
      },
      skill: { client: failed.client, kit },
    })
    assert.equal(fallback.buffer.toString(), "node-deck")
    assert.equal(generates.length, 1)
    assert.equal(generates[0]?.withCommentary, true)
    assert.equal(generates[0]?.commentary, undefined)
    assert.equal(deckSkillOnceReportInput("curatif004").withCommentary, false)
  } finally {
    restore("DECK_RENDERER", renderer)
    restore("DECK_SKILL_ID", skillId)
  }
})

test("a skill error log includes the error name and message", async () => {
  const skillId = process.env.DECK_SKILL_ID
  process.env.DECK_SKILL_ID = "skill_test_id"
  const message = `boom ${"x".repeat(400)}`
  const logs: unknown[][] = []
  const original = console.log
  console.log = (...args: unknown[]) => { logs.push(args) }
  const { client } = mockClient({
    respond: () => {
      const err = new Error(message)
      err.name = "BoomError"
      throw err
    },
  })
  try {
    await assert.rejects(
      () => runDeckSkill(
        { mbaNumber: "curatif004", report, fileName: FILE_NAME },
        { client, kit },
      ),
      /boom /,
    )
    const row = logs.find((line) => line[0] === "[deck-skill]")?.[1] as {
      outcome?: string
      error_name?: string
      error_message?: string
    }
    assert.equal(row.outcome, "error")
    assert.equal(row.error_name, "BoomError")
    assert.equal(row.error_message, message.slice(0, 300))
    assert.equal(row.error_message?.length, 300)
  } finally {
    console.log = original
    restore("DECK_SKILL_ID", skillId)
  }
})
