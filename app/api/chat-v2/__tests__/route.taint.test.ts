/**
 * F14 (B36): /api/chat-v2 wiring for the taint rule. The agent loop is
 * mocked; this pins what the route sends it and what it returns.
 * Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../../lib/test/mockModuleHarness.js"
import { AVA_TAINT_NOTICE } from "../../../../lib/ava/taintRules.js"

const skip = mockModuleSkip()
const SECRET = "s".repeat(40)
const CID = "conv-0001-aaaa"

type AgentCall = { tainted?: boolean; clientRoute?: string; routeUnknown?: boolean }
const agentCalls: AgentCall[] = []
let agentResult: Record<string, unknown> = {}

function baseResult(overrides: Record<string, unknown> = {}) {
  return {
    replyText: "Reply with https://evil.example/x link.",
    patch: null,
    lineItemsLoad: null,
    attachments: null,
    questions: null,
    toolCalls: [],
    usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    tainted: false,
    taintedThisTurn: false,
    profile: "chat",
    model: "claude-opus-5-5",
    effort: "medium",
    ...overrides,
  }
}

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: async () => ({ user: { sub: "auth0|luke", email: "luke@example.com", roles: ["admin"] } }) },
    },
  })
  await mock.module!("@/lib/rbac", {
    namedExports: {
      getUserRoles: () => ["admin"],
      getUserClientSlugs: () => [],
      getUserMbaNumbers: () => [],
    },
  })
  await mock.module!("@/lib/ava/agentLoop", {
    namedExports: {
      runAvaAgent: async (input: AgentCall) => {
        agentCalls.push({ tainted: input.tainted, clientRoute: input.clientRoute, routeUnknown: input.routeUnknown })
        return agentResult
      },
    },
  })
}

async function post(body: Record<string, unknown>) {
  const prevKey = process.env.ANTHROPIC_API_KEY
  const prevSecret = process.env.APP_SIGNING_SECRET
  process.env.ANTHROPIC_API_KEY = "test"
  process.env.APP_SIGNING_SECRET = SECRET
  try {
    const { POST } = await import("../route.js")
    const res = await POST(
      new Request("http://localhost/api/chat-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }) as never,
    )
    return { status: res.status, json: (await res.json()) as { replyText: string; meta: Record<string, unknown> } }
  } finally {
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prevKey
    if (prevSecret === undefined) delete process.env.APP_SIGNING_SECRET
    else process.env.APP_SIGNING_SECRET = prevSecret
  }
}

const userTurn = [{ role: "user", content: "hello" }]

test("a clean turn: not tainted, no marker, reply unchanged, route passed through", { skip }, async () => {
  agentCalls.length = 0
  agentResult = baseResult()
  const { status, json } = await post({ messages: userTurn, route: "/tasks/12?x=1", conversationId: CID })
  assert.equal(status, 200)
  assert.deepEqual(agentCalls[0], { tainted: false, clientRoute: "/tasks/12", routeUnknown: false })
  assert.equal(json.meta.taintMarker, undefined)
  assert.equal(json.meta.tainted, undefined)
  assert.match(json.replyText, /evil\.example/)
})

test("a capture tool taints the turn: marker issued, notice added, links stripped", { skip }, async () => {
  agentCalls.length = 0
  agentResult = baseResult({ tainted: true, taintedThisTurn: true })
  const { json } = await post({ messages: userTurn, route: "/tasks", conversationId: CID })
  assert.equal(json.meta.tainted, true)
  assert.match(String(json.meta.taintMarker), /^t1\./)
  assert.ok(json.replyText.endsWith(AVA_TAINT_NOTICE))
  assert.doesNotMatch(json.replyText, /evil\.example/)
})

test("the marker sent back taints the next turn on another page", { skip }, async () => {
  agentResult = baseResult({ tainted: true, taintedThisTurn: true })
  const first = await post({ messages: userTurn, route: "/tasks", conversationId: CID })
  agentCalls.length = 0
  agentResult = baseResult({ tainted: true })
  await post({
    messages: [...userTurn, { role: "assistant", content: "ok" }, { role: "user", content: "edit the plan" }],
    route: "/mediaplans/mba/abc001/edit",
    conversationId: CID,
    taintMarker: first.json.meta.taintMarker,
  })
  assert.equal(agentCalls[0]?.tainted, true)
})

test("missing marker on a tainted history still fails closed", { skip }, async () => {
  agentCalls.length = 0
  agentResult = baseResult({ tainted: true })
  const { json } = await post({
    messages: [...userTurn, { role: "assistant", content: `Done.\n\n${AVA_TAINT_NOTICE}` }, { role: "user", content: "now edit" }],
    route: "/mediaplans/create",
    conversationId: CID,
  })
  assert.equal(agentCalls[0]?.tainted, true)
  // The history already has the notice: not added again.
  assert.equal(json.replyText.includes(AVA_TAINT_NOTICE), false)
  assert.match(String(json.meta.taintMarker), /^t1\./)
})

test("a forged marker fails closed", { skip }, async () => {
  agentCalls.length = 0
  agentResult = baseResult({ tainted: true })
  const { json } = await post({ messages: userTurn, route: "/clients", conversationId: CID, taintMarker: "t1.e30.forged" })
  assert.equal(agentCalls[0]?.tainted, true)
  // Tainted by marker only, so the notice is put into the history now.
  assert.ok(json.replyText.endsWith(AVA_TAINT_NOTICE))
})

test("a request with no route, or an unusable one, is an unknown route (L1)", { skip }, async () => {
  agentResult = baseResult()
  for (const route of [undefined, "", "tasks", 42, "/".padEnd(600, "x")]) {
    agentCalls.length = 0
    const body: Record<string, unknown> = { messages: userTurn, conversationId: CID }
    if (route !== undefined) body.route = route
    await post(body)
    assert.equal(agentCalls[0]?.routeUnknown, true, String(route))
    assert.equal(agentCalls[0]?.clientRoute, undefined, String(route))
  }
})
