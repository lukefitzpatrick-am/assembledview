/**
 * /api/codex/saved-views (F8, B37): gate order on every method, fail soft
 * before migration 0117, owner-only writes. Requires
 * --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

let session: null | { user: { email?: string; roles: string[] } } = null
const calls: Array<{ fn: string; args: unknown[] }> = []
let mode: "ok" | "unavailable" | "limit" | "not_owner" | "not_found" = "ok"

class SavedViewsUnavailableError extends Error {}
class SavedViewsLimitError extends Error {}

const VIEW = { id: 3, owner_email: "luke@x.au", name: "Mine", mine: true }

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", { namedExports: { auth0: { getSession: async () => session } } })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  const result = () => {
    if (mode === "unavailable") throw new SavedViewsUnavailableError("not set up")
    if (mode === "limit") throw new SavedViewsLimitError("limit")
    if (mode === "not_owner" || mode === "not_found") return { ok: false, reason: mode }
    return null
  }
  await mock.module!("@/lib/codex/savedViewsRepo", {
    namedExports: {
      SavedViewsUnavailableError,
      SavedViewsLimitError,
      listSavedViews: async (...args: unknown[]) => {
        calls.push({ fn: "list", args })
        result()
        return [VIEW]
      },
      createSavedView: async (...args: unknown[]) => {
        calls.push({ fn: "create", args })
        result()
        return VIEW
      },
      updateSavedView: async (...args: unknown[]) => {
        calls.push({ fn: "update", args })
        return result() ?? { ok: true, view: { ...VIEW, name: "B" } }
      },
      deleteSavedView: async (...args: unknown[]) => {
        calls.push({ fn: "delete", args })
        return result() ?? { ok: true }
      },
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function withSwitches<T>(codex: boolean, views: boolean, fn: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", codex)],
        ["codex_saved_views", row("codex_saved_views", views)],
      ]),
  )
  try {
    return await fn()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

const json = (method: string, body: unknown) =>
  new Request("http://l/api/codex/saved-views", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const STAFF = { user: { email: "Luke@X.au", roles: ["admin"] } }

async function allMethods() {
  const list = await import("../../../app/api/codex/saved-views/route.js")
  const one = await import("../../../app/api/codex/saved-views/[id]/route.js")
  return [
    await list.GET(new Request("http://l/api/codex/saved-views")),
    await list.POST(json("POST", { name: "A" })),
    await one.PATCH(json("PATCH", { name: "B" }), params("3")),
    await one.DELETE(new Request("http://l/api/codex/saved-views/3", { method: "DELETE" }), params("3")),
  ]
}

test("gate order on every method: codex_v2 off 404, saved views off 404, no session 401, client 403", { skip }, async () => {
  calls.length = 0
  session = STAFF
  for (const res of await withSwitches(false, true, allMethods)) assert.equal(res.status, 404)
  for (const res of await withSwitches(true, false, allMethods)) assert.equal(res.status, 404)
  session = null
  for (const res of await withSwitches(true, true, allMethods)) assert.equal(res.status, 401)
  session = { user: { email: "c@client.com", roles: ["client"] } }
  for (const res of await withSwitches(true, true, allMethods)) assert.equal(res.status, 403)
  session = { user: { roles: ["admin"] } }
  for (const res of await withSwitches(true, true, allMethods)) assert.equal(res.status, 401, "no email, no owner")
  assert.equal(calls.length, 0, "the store is never reached")
})

test("staff: list, create, rename, delete reach the store with the lower-case email", { skip }, async () => {
  calls.length = 0
  mode = "ok"
  session = STAFF
  const [list, create, patch, del] = await withSwitches(true, true, allMethods)
  assert.equal(list.status, 200)
  assert.deepEqual(await list.json(), { available: true, items: [VIEW] })
  assert.equal(create.status, 201)
  assert.equal(patch.status, 200)
  assert.equal(del.status, 200)
  assert.deepEqual(calls.map((c) => c.fn), ["list", "create", "update", "delete"])
  assert.equal(calls[0].args[0], "luke@x.au")
  assert.equal(calls[1].args[0], "luke@x.au")
  assert.deepEqual(calls[2].args.slice(0, 3), [3, "luke@x.au", { name: "B" }])
  assert.deepEqual(calls[3].args.slice(0, 2), [3, "luke@x.au"])
})

test("before migration 0117: list is 200 available false; writes are 503", { skip }, async () => {
  mode = "unavailable"
  session = STAFF
  const [list, create, patch, del] = await withSwitches(true, true, allMethods)
  assert.equal(list.status, 200)
  assert.deepEqual(await list.json(), { available: false, items: [] })
  assert.equal(create.status, 503)
  assert.equal(((await create.json()) as { error: string }).error, "saved_views_unavailable")
  assert.equal(patch.status, 503)
  assert.equal(del.status, 503)
  mode = "ok"
})

test("someone else's shared view: 403 not_owner; private or missing: 404", { skip }, async () => {
  session = STAFF
  mode = "not_owner"
  let [, , patch, del] = await withSwitches(true, true, allMethods)
  assert.equal(patch.status, 403)
  assert.equal(((await patch.json()) as { error: string }).error, "not_owner")
  assert.equal(del.status, 403)
  mode = "not_found"
  ;[, , patch, del] = await withSwitches(true, true, allMethods)
  assert.equal(patch.status, 404)
  assert.equal(del.status, 404)
  mode = "ok"
})

test("bad bodies and ids: 400 and 404 before the store; limit is 409", { skip }, async () => {
  calls.length = 0
  session = STAFF
  mode = "ok"
  await withSwitches(true, true, async () => {
    const list = await import("../../../app/api/codex/saved-views/route.js")
    const one = await import("../../../app/api/codex/saved-views/[id]/route.js")
    assert.equal((await list.POST(json("POST", { name: "" }))).status, 400)
    assert.equal((await list.POST(json("POST", { name: "a", layout: "gantt" }))).status, 400)
    assert.equal((await list.GET(new Request("http://l/api/codex/saved-views?screen=projects"))).status, 400)
    assert.equal((await one.PATCH(json("PATCH", {}), params("3"))).status, 400)
    assert.equal((await one.PATCH(json("PATCH", { name: "B" }), params("abc"))).status, 404)
    assert.equal((await one.DELETE(new Request("http://l/x", { method: "DELETE" }), params("0"))).status, 404)
  })
  assert.equal(calls.length, 0)
  mode = "limit"
  await withSwitches(true, true, async () => {
    const list = await import("../../../app/api/codex/saved-views/route.js")
    assert.equal((await list.POST(json("POST", { name: "a" }))).status, 409)
  })
  mode = "ok"
})
