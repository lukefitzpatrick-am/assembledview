/**
 * B42: PUT /api/codex/projects/[id]/progress-field. Gate order (codex_v2,
 * codex_projects and codex_progress_field 404 before auth; session 401;
 * staff 403; no email 401), bad ids 404, bad bodies 400 before the store,
 * the store's refusal 409, 503 before 0118, 500 without detail.
 * Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()

let session: null | { user: { email?: string; roles: string[] } } = null
const calls: unknown[][] = []
let mode = "ok"
class ProjectsUnavailableError extends Error {
  code = "PROJECTS_UNAVAILABLE"
}

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", { namedExports: { auth0: { getSession: async () => session } } })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/codex/projectsRepo", { namedExports: { ProjectsUnavailableError } })
  await mock.module!("@/lib/codex/customFieldsRepo", {
    namedExports: {
      setProgressField: async (...args: unknown[]) => {
        calls.push(args)
        if (mode === "unavailable") throw new ProjectsUnavailableError("0118")
        if (mode === "boom") throw new Error("secret detail")
        if (mode === "invalid") return { ok: false, reason: "progress_field_invalid", message: "m" }
        return { ok: true, progress_field_id: args[2] }
      },
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}
async function withSwitches<T>(on: Record<string, boolean>, run: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(async () => new Map(Object.entries(on).map(([k, v]) => [k, row(k, v)])))
  try {
    return await run()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}
const ALL = { codex_v2: true, codex_projects: true, codex_progress_field: true }
const put = async (id: string, body: unknown) => {
  const route = await import("../../../app/api/codex/projects/[id]/progress-field/route.js")
  return route.PUT(
    new Request(`http://l/api/codex/projects/${id}/progress-field`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  )
}

test("switches off: 404 before auth, store never called", { skip }, async () => {
  session = null
  for (const off of ["codex_v2", "codex_projects", "codex_progress_field"]) {
    await withSwitches({ ...ALL, [off]: false }, async () => {
      calls.length = 0
      const res = await put("5", { field_id: 3 })
      assert.equal(res.status, 404, off)
      assert.equal(calls.length, 0)
    })
  }
})

test("auth chain, ids and bodies before the store", { skip }, async () => {
  await withSwitches(ALL, async () => {
    calls.length = 0
    session = null
    assert.equal((await put("5", { field_id: 3 })).status, 401)
    session = { user: { email: "x@x.au", roles: ["client"] } }
    assert.equal((await put("5", { field_id: 3 })).status, 403)
    session = { user: { roles: ["admin"] } }
    assert.equal((await put("5", { field_id: 3 })).status, 401)
    session = { user: { email: "Luke@X.au", roles: ["admin"] } }
    assert.equal((await put("abc", { field_id: 3 })).status, 404)
    for (const body of [{}, { field_id: "3" }, { field_id: 0 }, { field_id: 1.5 }, []]) {
      assert.equal((await put("5", body)).status, 400, JSON.stringify(body))
    }
    assert.equal(calls.length, 0)
  })
})

test("store answers mapped: ok, unlink, 409, 503, 500 without detail", { skip }, async () => {
  await withSwitches(ALL, async () => {
    session = { user: { email: "Luke@X.au", roles: ["admin"] } }
    calls.length = 0
    mode = "ok"
    const ok = await put("5", { field_id: 3 })
    assert.equal(ok.status, 200)
    assert.deepEqual(await ok.json(), { progress_field_id: 3 })
    assert.deepEqual(calls[0], [5, "luke@x.au", 3])
    assert.equal((await put("5", { field_id: null })).status, 200)
    mode = "invalid"
    assert.equal((await put("5", { field_id: 3 })).status, 409)
    mode = "unavailable"
    assert.equal((await put("5", { field_id: 3 })).status, 503)
    mode = "boom"
    const boom = await put("5", { field_id: 3 })
    assert.equal(boom.status, 500)
    assert.ok(!JSON.stringify(await boom.json()).includes("secret"))
    mode = "ok"
  })
})
