/**
 * B42: GET /api/codex/workload. codex_v2 and codex_projects 404 before auth,
 * session 401, staff 403, no email 401; the viewer's email and the weeks
 * reach the store; 503 before 0118; 500 without detail.
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
  await mock.module!("@/lib/codex/workloadRepo", {
    namedExports: {
      loadWorkload: async (...args: unknown[]) => {
        calls.push(args)
        if (mode === "unavailable") throw new ProjectsUnavailableError("0118")
        if (mode === "boom") throw new Error("secret detail")
        return { today: "2026-11-13", weeks: [], people: [] }
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
const get = async (qs = "") => (await import("../../../app/api/codex/workload/route.js")).GET(new Request(`http://l/api/codex/workload${qs}`))

test("switches, auth chain, the viewer and weeks, 503 and 500", { skip }, async () => {
  session = null
  for (const off of ["codex_v2", "codex_projects"]) {
    await withSwitches({ codex_v2: true, codex_projects: true, [off]: false }, async () => {
      assert.equal((await get()).status, 404, off)
    })
  }
  await withSwitches({ codex_v2: true, codex_projects: true }, async () => {
    assert.equal((await get()).status, 401)
    session = { user: { email: "x@x.au", roles: ["client"] } }
    assert.equal((await get()).status, 403)
    session = { user: { roles: ["admin"] } }
    assert.equal((await get()).status, 401)
    assert.equal(calls.length, 0)
    session = { user: { email: "Luke@X.au", roles: ["admin"] } }
    assert.equal((await get("?weeks=3")).status, 200)
    assert.deepEqual(calls[0].slice(0, 2), ["luke@x.au", 3])
    await get("?weeks=99")
    assert.equal(calls[1][1], 6, "out of range: the default")
    mode = "unavailable"
    assert.equal((await get()).status, 503)
    mode = "boom"
    const boom = await get()
    assert.equal(boom.status, 500)
    assert.ok(!JSON.stringify(await boom.json()).includes("secret"))
    mode = "ok"
  })
})
