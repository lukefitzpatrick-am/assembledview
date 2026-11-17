/**
 * B53: the Team tab routes answer a roster refusal with a plain message
 * naming the field (one mapping, `rosterWriteRefusal`, for add and edit),
 * and GET lists initials clashes only when `roster_rules` is on. Any other
 * failure is a 500 whose body never carries the database's text (B53fix F2).
 * Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"
import { RosterRuleError } from "../rosterRules.js"

const skip = mockModuleSkip()
const D = "assembledmedia.com.au"
let nextError: unknown = null

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: { auth0: { getSession: async () => ({ user: { email: `luke@${D}`, roles: ["admin"] } }) } },
  })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/auth/getCurrentUser", {
    namedExports: { getCurrentUser: async () => ({ id: 0, email: `luke@${D}`, name: "Luke" }) },
  })
  await mock.module!("@/lib/api/auth0Management", {
    namedExports: { isAuth0ManagementClientConfigured: () => false, listAllAuth0UsersUnpaged: async () => [] },
  })
  await mock.module!("@/lib/codex/rosterRead", {
    namedExports: {
      rosterRulesOn: async () => (await import("@/lib/features/server")).isFeatureOn("roster_rules"),
      loadRosterPeople: async () => [
        { email: `samantha.murphy@${D}`, name: "Samantha Murphy", aliases: [`sm@${D}`], active: true },
        { email: `sarah.mills@${D}`, name: "Sarah Mills", aliases: [], active: true },
      ],
    },
  })
  const fail = async () => {
    const err = nextError
    nextError = null
    throw err
  }
  await mock.module!("@/lib/codex/repo", {
    namedExports: {
      createTeamMember: fail,
      updateTeamMember: fail,
      listTeamMembers: async () =>
        nextError ? fail() : { items: [], itemsTotal: 0, curPage: 1, pageTotal: 1, nextPage: null, prevPage: null },
      listRosterLoginRows: async () => [],
      listEmailAliasCollisions: async () => [],
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function withRules<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(async () => new Map([["codex_v2", row("codex_v2", true)], ["roster_rules", row("roster_rules", on)]]))
  try {
    return await fn()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

const json = (method: string, url: string, body: unknown) =>
  new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

test("add: a rule refusal is 400 naming the field", { skip }, async () => {
  nextError = new RosterRuleError([{ field: "name", message: "The name holds an email address. Use the person's name, such as Alex James." }])
  const { POST } = await import("../../../app/api/codex/team/route.js")
  const res = await withRules(true, () => POST(json("POST", "http://l/api/codex/team", { email: `a.b@${D}`, name: `a.b@${D}` })))
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.error, "roster_rule")
  assert.equal(body.field, "name")
})

test("edit: Postgres refusing a taken address is 409 with a plain message, not the database's text", { skip }, async () => {
  nextError = { message: "Failed query: update team_members params: secret", cause: { code: "23505", message: "secret" } }
  const { PATCH } = await import("../../../app/api/codex/team/[id]/route.js")
  const res = await withRules(false, () =>
    PATCH(json("PATCH", "http://l/api/codex/team/3", { email_aliases: [`sm@${D}`] }), { params: Promise.resolve({ id: "3" }) })
  )
  assert.equal(res.status, 409)
  const text = await res.text()
  assert.match(text, /alias_collision/)
  assert.doesNotMatch(text, /secret|Failed query/)
})

test("GET lists initials clashes with roster_rules on, and none with it off", { skip }, async () => {
  const { GET } = await import("../../../app/api/codex/team/route.js")
  const on = await (await withRules(true, () => GET(new Request("http://l/api/codex/team")))).json()
  assert.deepEqual(
    on.initials_gaps.map((g: { name: string; sharedWith: string[] }) => [g.name, g.sharedWith]),
    [["Sarah Mills", ["Samantha Murphy"]]]
  )
  const off = await (await withRules(false, () => GET(new Request("http://l/api/codex/team")))).json()
  assert.deepEqual(off.initials_gaps, [])
})

/** A Drizzle-shaped failure no roster refusal maps (a deadlock), holding a person's email in its SQL params. */
const drizzleDeadlock = () => ({
  name: "DrizzleQueryError",
  message: `Failed query: update "team_members" set "email_aliases" = $1 where "id" = $2\nparams: ["sk@${D}"],samantha.keah@${D}`,
  cause: { code: "40P01", message: `deadlock detected while saving samantha.keah@${D}` },
})

test("a 500 from GET, add or edit never carries the database's text or an email (F2)", { skip }, async () => {
  const { GET, POST } = await import("../../../app/api/codex/team/route.js")
  const { PATCH } = await import("../../../app/api/codex/team/[id]/route.js")
  const calls: Array<() => Promise<Response>> = [
    () => GET(new Request("http://l/api/codex/team")),
    () => POST(json("POST", "http://l/api/codex/team", { email: `samantha.keah@${D}`, name: "Samantha Keah" })),
    () => PATCH(json("PATCH", "http://l/api/codex/team/3", { active: true }), { params: Promise.resolve({ id: "3" }) }),
  ]
  const errorLog = mock.method(console, "error", () => {})
  try {
    for (const call of calls) {
      nextError = drizzleDeadlock()
      const res = await withRules(true, call)
      assert.equal(res.status, 500)
      const text = await res.text()
      assert.doesNotMatch(text, /samantha\.keah|sk@|Failed query|deadlock|team_members/)
      assert.match(text, /Nothing was changed/)
    }
  } finally {
    errorLog.mock.restore()
  }
})
