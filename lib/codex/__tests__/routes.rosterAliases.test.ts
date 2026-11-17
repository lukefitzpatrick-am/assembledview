/**
 * F16 (B36): task assignee writes and Ask for help resolve people by alias
 * behind `codex_roster_aliases`. Off: the address passes through as before.
 * Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"

const skip = mockModuleSkip()
const D = "assembledmedia.com.au"

const createTaskCalls: Array<Record<string, unknown>> = []
const updateTaskCalls: Array<Record<string, unknown>> = []
const bulkCalls: Array<Record<string, unknown>> = []
const helpCalls: Array<{ assigneeEmail: string }> = []
let rosterLoads = 0

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: { auth0: { getSession: async () => ({ user: { email: `luke@${D}`, roles: ["admin"] } }) } },
  })
  await mock.module!("@/lib/rbac", { namedExports: { getUserRoles: (u: { roles?: string[] }) => u.roles ?? [] } })
  await mock.module!("@/lib/auth/getCurrentUser", {
    namedExports: { getCurrentUser: async () => ({ id: 0, email: `luke@${D}`, name: "Luke" }) },
  })
  await mock.module!("@/lib/codex/clientExists", { namedExports: { codexClientExists: async () => true } })
  await mock.module!("@/lib/codex/rosterRead", {
    namedExports: {
      loadRosterPeople: async () => {
        rosterLoads += 1
        return [
          { email: `alex.james@${D}`, name: `alex.james@${D}`, aliases: [`alex@${D}`], active: true },
          { email: `samantha.keah@${D}`, name: "Samantha Keah", aliases: [`samantha@${D}`], active: true },
          { email: `samantha.murphy@${D}`, name: "Samantha Murphy", aliases: [`samantha@${D}`], active: true },
        ]
      },
    },
  })
  await mock.module!("@/lib/codex/repo", {
    namedExports: {
      listTasks: async () => ({ items: [], itemsTotal: 0, curPage: 1, pageTotal: 1, nextPage: null, prevPage: null }),
      parseStatusFilter: () => undefined,
      getTask: async () => ({ id: 1 }),
      softDeleteTask: async () => false,
      createTask: async (input: Record<string, unknown>) => {
        createTaskCalls.push(input)
        return { id: 99 }
      },
      updateTask: async (_id: number, patch: Record<string, unknown>) => {
        updateTaskCalls.push(patch)
        return { id: 1, ...patch }
      },
      bulkUpdateTasks: async (_ids: number[], patch: Record<string, unknown>) => {
        bulkCalls.push(patch)
        return []
      },
      bulkSoftDeleteTasks: async () => [],
      CodexBulkError: class CodexBulkError extends Error {},
      HELP_ON_DONE_MESSAGE: "Reopen the task before asking for help",
      requestHelp: async (_id: number, input: { assigneeEmail: string }) => {
        helpCalls.push(input)
        return { parent: { id: 1 }, child: { id: 2 } }
      },
    },
  })
}

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

async function withSwitch<T>(aliasesOn: boolean, fn: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", true)],
        ["codex_roster_aliases", row("codex_roster_aliases", aliasesOn)],
      ]),
  )
  try {
    return await fn()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

function json(method: string, url: string, body: unknown) {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

test("switch off: an alias passes through unchanged and the roster is not read", { skip }, async () => {
  createTaskCalls.length = 0
  rosterLoads = 0
  await withSwitch(false, async () => {
    const { POST } = await import("../../../app/api/codex/tasks/route.js")
    const res = await POST(json("POST", "http://l/api/codex/tasks", { title: "t", client_id: 2, assignee_email: `Alex@${D}`, assignee_name: "x" }))
    assert.equal(res.status, 201)
  })
  assert.equal(createTaskCalls[0]?.assigneeEmail, `Alex@${D}`)
  assert.equal(createTaskCalls[0]?.assigneeName, "x")
  assert.equal(rosterLoads, 0)
})

test("switch on: create with an alias stores the main email and display name", { skip }, async () => {
  createTaskCalls.length = 0
  await withSwitch(true, async () => {
    const { POST } = await import("../../../app/api/codex/tasks/route.js")
    const res = await POST(json("POST", "http://l/api/codex/tasks", { title: "t", client_id: 2, assignee_email: `ALEX@${D}` }))
    assert.equal(res.status, 201)
  })
  assert.equal(createTaskCalls[0]?.assigneeEmail, `alex.james@${D}`)
  assert.equal(createTaskCalls[0]?.assigneeName, "Alex James")
})

test("switch on: a shared alias is refused with both names and nothing is written", { skip }, async () => {
  createTaskCalls.length = 0
  updateTaskCalls.length = 0
  bulkCalls.length = 0
  helpCalls.length = 0
  await withSwitch(true, async () => {
    const tasks = await import("../../../app/api/codex/tasks/route.js")
    const one = await import("../../../app/api/codex/tasks/[id]/route.js")
    const bulk = await import("../../../app/api/codex/tasks/bulk/route.js")
    const help = await import("../../../app/api/codex/tasks/[id]/help/route.js")
    const shared = `samantha@${D}`
    const responses = [
      await tasks.POST(json("POST", "http://l/api/codex/tasks", { title: "t", client_id: 2, assignee_email: shared })),
      await one.PATCH(json("PATCH", "http://l/api/codex/tasks/1", { assignee_email: shared }), params("1")),
      await bulk.POST(json("POST", "http://l/api/codex/tasks/bulk", { ids: [1, 2], patch: { assignee_email: shared } })),
      await help.POST(json("POST", "http://l/api/codex/tasks/1/help", { assignee_email: shared, ask: "Can you look?" }), params("1")),
    ]
    for (const res of responses) {
      assert.equal(res.status, 409)
      const body = (await res.json()) as { error: string; message: string; holders: Array<{ name: string }> }
      assert.equal(body.error, "ambiguous_assignee")
      assert.match(body.message, /Samantha Keah and Samantha Murphy/)
      assert.equal(body.holders.length, 2)
    }
  })
  assert.equal(createTaskCalls.length + updateTaskCalls.length + bulkCalls.length + helpCalls.length, 0)
})

test("switch on: PATCH, bulk and Ask for help take an alias to the main email", { skip }, async () => {
  updateTaskCalls.length = 0
  bulkCalls.length = 0
  helpCalls.length = 0
  await withSwitch(true, async () => {
    const one = await import("../../../app/api/codex/tasks/[id]/route.js")
    const bulk = await import("../../../app/api/codex/tasks/bulk/route.js")
    const help = await import("../../../app/api/codex/tasks/[id]/help/route.js")
    assert.equal((await one.PATCH(json("PATCH", "http://l/api/codex/tasks/1", { assignee_email: `alex@${D}` }), params("1"))).status, 200)
    assert.equal((await bulk.POST(json("POST", "http://l/api/codex/tasks/bulk", { ids: [1], patch: { assignee_email: `alex@${D}` } }))).status, 200)
    assert.equal((await help.POST(json("POST", "http://l/api/codex/tasks/1/help", { assignee_email: `alex@${D}`, ask: "Look?" }), params("1"))).status, 201)
  })
  assert.deepEqual(updateTaskCalls[0], { assigneeEmail: `alex.james@${D}`, assigneeName: "Alex James" })
  assert.deepEqual(bulkCalls[0], { assigneeEmail: `alex.james@${D}`, assigneeName: "Alex James" })
  assert.equal(helpCalls[0]?.assigneeEmail, `alex.james@${D}`)
})

test("switch on: an address no one holds saves as sent; clearing the assignee is untouched", { skip }, async () => {
  updateTaskCalls.length = 0
  await withSwitch(true, async () => {
    const one = await import("../../../app/api/codex/tasks/[id]/route.js")
    await one.PATCH(json("PATCH", "http://l/api/codex/tasks/1", { assignee_email: "Contractor@Other.example", assignee_name: "C" }), params("1"))
    await one.PATCH(json("PATCH", "http://l/api/codex/tasks/1", { assignee_email: null, assignee_name: null }), params("1"))
  })
  assert.deepEqual(updateTaskCalls[0], { assigneeEmail: "Contractor@Other.example", assigneeName: "C" })
  assert.deepEqual(updateTaskCalls[1], { assigneeEmail: null, assigneeName: null })
})

test("the alias switch needs codex_v2: aliases on with Codex off reads as off", { skip }, async () => {
  const { isFeatureOn } = await import("../../features/server.js")
  const isCodexRosterAliasesEnabled = () => isFeatureOn("codex_roster_aliases")
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", false)],
        ["codex_roster_aliases", row("codex_roster_aliases", true)],
      ]),
  )
  try {
    assert.equal(await isCodexRosterAliasesEnabled(), false)
  } finally {
    setFeatureRowReaderForTests(null)
  }
  await withSwitch(true, async () => assert.equal(await isCodexRosterAliasesEnabled(), true))
})
