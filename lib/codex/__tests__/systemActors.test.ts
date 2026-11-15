/**
 * C-264 (B43): named system actors in codex_activity (pure), and the relabel
 * auto-close passes its own name. Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { activityActor, isSystemActor, SYSTEM_ACTORS } from "../systemActors.js"

test("system actors: the three writers, each system:<writer>", () => {
  assert.deepEqual(SYSTEM_ACTORS, { relabel: "system:relabel", recurring: "system:recurring", reminders: "system:reminders" })
  for (const a of Object.values(SYSTEM_ACTORS)) assert.ok(isSystemActor(a))
  assert.equal(isSystemActor("system"), false, "a bare system is not a named actor")
  assert.equal(isSystemActor("system:"), false)
  assert.equal(isSystemActor("mia@x.au"), false)
  assert.equal(isSystemActor(null), false)
})

test("activityActor: a system actor as itself with kind system; a person lower case; no actor by the caller's kind", () => {
  assert.deepEqual(activityActor("system:relabel"), { actorEmail: "system:relabel", actorKind: "system" })
  assert.deepEqual(activityActor("system:recurring", { personKind: "ava" }), { actorEmail: "system:recurring", actorKind: "system" })
  assert.deepEqual(activityActor(" Mia@X.au "), { actorEmail: "mia@x.au", actorKind: "user" })
  assert.deepEqual(activityActor("mia@x.au", { personKind: "ava" }), { actorEmail: "mia@x.au", actorKind: "ava" })
  assert.deepEqual(activityActor(null), { actorEmail: null, actorKind: "user" })
  assert.deepEqual(activityActor("", { noActorKind: "system" }), { actorEmail: null, actorKind: "system" })
  assert.deepEqual(activityActor("mia@x.au", { noActorKind: "system" }), { actorEmail: "mia@x.au", actorKind: "user" })
})

const calls: Array<{ id: number; patch: unknown; actor: unknown }> = []

if (supportsMockModule()) {
  const rows = [
    { id: 7, avaAutoKey: "relabel:applied:1", status: "todo", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" },
  ]
  const chain = { select: () => chain, from: () => chain, where: async () => rows }
  await mock.module!("@/db", { namedExports: { getDb: () => chain, schema: { tasks: { id: "id", avaAutoKey: "k", status: "s", createdAt: "c", updatedAt: "u", deletedAt: "d" } } } })
  await mock.module!("@/lib/codex/repo", {
    namedExports: {
      updateTaskFollowingSections: async (id: number, patch: unknown, actor: unknown) => {
        calls.push({ id, patch, actor })
        return null
      },
    },
  })
}

test("the relabel auto-close closes as system:relabel, never a person called system", { skip: mockModuleSkip() }, async () => {
  const { runCloseUntouchedRelabelTasks } = await import("../../pacing/relabel/autoClose.js")
  const closed = await runCloseUntouchedRelabelTasks(new Date("2026-11-16T00:00:00Z"))
  assert.equal(closed, 1)
  assert.deepEqual(calls, [{ id: 7, patch: { status: "done" }, actor: "system:relabel" }])
})
