/**
 * GET /api/codex/search (F8, B37): gate order and query handling.
 * codex_v2 off 404, codex_search off 404, no session 401, not staff 403,
 * short query 400, then the repo with the normalised query and limit.
 * Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

let session: null | { user: { email: string; roles: string[] } } = null
const searchCalls: Array<{ q: string; limit: number }> = []
let searchThrows = false

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: { auth0: { getSession: async () => session } },
  })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/codex/searchRepo", {
    namedExports: {
      searchCodex: async (q: string, limit: number) => {
        searchCalls.push({ q, limit })
        if (searchThrows) throw new Error("boom: secret detail")
        const empty = { items: [], more: false }
        return { q, tasks: empty, inbox: empty, meetings: empty }
      },
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function call(switches: { codex: boolean; search: boolean }, url: string) {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", switches.codex)],
        ["codex_search", row("codex_search", switches.search)],
      ]),
  )
  try {
    const { GET } = await import("../../../app/api/codex/search/route.js")
    return await GET(new Request(url))
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

const URL_OK = "http://l/api/codex/search?q=%20brand%20%20report%20&limit=50"

test("codex_v2 off: 404 before auth, repo not called", { skip }, async () => {
  searchCalls.length = 0
  session = null
  const res = await call({ codex: false, search: true }, URL_OK)
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: "not_found" })
  assert.equal(searchCalls.length, 0)
})

test("codex_search off: 404 before auth, repo not called", { skip }, async () => {
  searchCalls.length = 0
  session = { user: { email: "luke@x.au", roles: ["admin"] } }
  const res = await call({ codex: true, search: false }, URL_OK)
  assert.equal(res.status, 404)
  assert.equal(searchCalls.length, 0)
})

test("no session: 401", { skip }, async () => {
  session = null
  const res = await call({ codex: true, search: true }, URL_OK)
  assert.equal(res.status, 401)
})

test("client role: 403, repo not called", { skip }, async () => {
  searchCalls.length = 0
  session = { user: { email: "c@client.com", roles: ["client"] } }
  const res = await call({ codex: true, search: true }, URL_OK)
  assert.equal(res.status, 403)
  assert.equal(searchCalls.length, 0)
})

test("staff, query under 2 characters: 400, repo not called", { skip }, async () => {
  searchCalls.length = 0
  session = { user: { email: "luke@x.au", roles: ["admin"] } }
  const res = await call({ codex: true, search: true }, "http://l/api/codex/search?q=%20a%20")
  assert.equal(res.status, 400)
  assert.equal(((await res.json()) as { error: string }).error, "query_too_short")
  assert.equal(searchCalls.length, 0)
})

test("staff: 200 with the normalised query and the clamped limit", { skip }, async () => {
  searchCalls.length = 0
  session = { user: { email: "luke@x.au", roles: ["admin"] } }
  const res = await call({ codex: true, search: true }, URL_OK)
  assert.equal(res.status, 200)
  assert.deepEqual(searchCalls, [{ q: "brand report", limit: 25 }])
  const body = (await res.json()) as { q: string }
  assert.equal(body.q, "brand report")
})

test("a repo failure is a 500 without the error detail", { skip }, async () => {
  session = { user: { email: "luke@x.au", roles: ["admin"] } }
  searchThrows = true
  const errors = mock.method(console, "error", () => {})
  try {
    const res = await call({ codex: true, search: true }, URL_OK)
    assert.equal(res.status, 500)
    const text = await res.text()
    assert.doesNotMatch(text, /secret detail/)
  } finally {
    searchThrows = false
    errors.mock.restore()
  }
})
