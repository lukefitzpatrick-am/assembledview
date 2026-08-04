/**
 * Codex Stage 0 guarantees — permanent pin of the 4 Aug live-SQL smoke checks.
 * Requires DATABASE_URL. Skips when unset.
 *
 * FINDING (activity atomicity): createTask / updateTask / softDeleteTask /
 * createTeamMember / updateTeamMember call appendActivity AFTER the mutation
 * with no shared transaction. A failure in appendActivity can leave the
 * mutation committed without an activity row. The inverse cannot happen
 * (activity is second). Early refusals (deleted update, double soft-delete)
 * never call appendActivity — those cases are asserted below.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { and, eq, inArray } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  createTask,
  createTeamMember,
  getTask,
  listTasks,
  softDeleteTask,
  updateTask,
  updateTeamMember,
} from "../repo.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MIXED = " Luke.Fitzpatrick@Assembled.com.au "
const NORMALISED = "luke.fitzpatrick@assembled.com.au"
/** Sentinel client_id — no FK on tasks.client_id. */
const CLIENT_ID = 900_090_004
const RUN = `s0g${Date.now().toString(36)}`

const taskIds: number[] = []
const teamIds: number[] = []

async function wipe(): Promise<void> {
  if (!hasDb) return
  const database = getDb()
  if (taskIds.length) {
    await database
      .delete(schema.codexActivity)
      .where(
        and(
          eq(schema.codexActivity.entityType, "task"),
          inArray(schema.codexActivity.entityId, taskIds)
        )
      )
    await database.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds))
  }
  if (teamIds.length) {
    await database
      .delete(schema.codexActivity)
      .where(
        and(
          eq(schema.codexActivity.entityType, "team_member"),
          inArray(schema.codexActivity.entityId, teamIds)
        )
      )
    await database
      .delete(schema.teamMembers)
      .where(inArray(schema.teamMembers.id, teamIds))
  }
}

after(async () => {
  try {
    await wipe()
  } finally {
    if (hasDb) await closeDb()
  }
})

async function activityFor(
  entityType: string,
  entityId: number
): Promise<(typeof schema.codexActivity.$inferSelect)[]> {
  const database = getDb()
  return database
    .select()
    .from(schema.codexActivity)
    .where(
      and(
        eq(schema.codexActivity.entityType, entityType),
        eq(schema.codexActivity.entityId, entityId)
      )
    )
}

describe("Codex Stage 0 — email normalisation", { skip: !hasDb }, () => {
  it("createTask lowercases+trims created_by_email; null assignee stays null", async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} create null assignee`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        assigneeEmail: null,
      },
      MIXED,
      database
    )
    taskIds.push(Number(task.id))
    assert.equal(task.created_by_email, NORMALISED)
    assert.equal(task.assignee_email, null)
  })

  it("createTask lowercases+trims populated assignee_email", async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} create with assignee`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        assigneeEmail: MIXED,
      },
      MIXED,
      database
    )
    taskIds.push(Number(task.id))
    assert.equal(task.assignee_email, NORMALISED)
    assert.equal(task.created_by_email, NORMALISED)
  })

  it("updateTask lowercases+trims assignee_email on PATCH (null and populated)", async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} patch assignee`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        assigneeEmail: null,
      },
      MIXED,
      database
    )
    const id = Number(task.id)
    taskIds.push(id)

    const withAssignee = await updateTask(
      id,
      { assigneeEmail: MIXED },
      MIXED,
      database
    )
    assert.ok(withAssignee)
    assert.equal(withAssignee.assignee_email, NORMALISED)

    const cleared = await updateTask(
      id,
      { assigneeEmail: null },
      MIXED,
      database
    )
    assert.ok(cleared)
    assert.equal(cleared.assignee_email, null)
  })

  it("createTeamMember and updateTeamMember lowercase+trim email", async () => {
    const database = getDb()
    const emailA = `s0g-a-${RUN}@example.com`
    const emailBMixed = ` S0g-B-${RUN}@Example.COM `
    const emailBNorm = `s0g-b-${RUN}@example.com`

    const member = await createTeamMember(
      { email: ` ${emailA.toUpperCase()} `, name: "Stage0 A" },
      MIXED,
      database
    )
    teamIds.push(member.id)
    assert.equal(member.email, emailA)

    const updated = await updateTeamMember(
      member.id,
      { email: emailBMixed },
      MIXED,
      database
    )
    assert.ok(updated)
    assert.equal(updated.email, emailBNorm)
  })
})

describe("Codex Stage 0 — soft delete", { skip: !hasDb }, () => {
  it("softDeleteTask sets deleted_at; row remains via includeDeleted", async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} soft-delete keep`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
      },
      MIXED,
      database
    )
    const id = Number(task.id)
    taskIds.push(id)

    const ok = await softDeleteTask(id, MIXED, database)
    assert.equal(ok, true)

    const gone = await getTask(id, database)
    assert.equal(gone, null)

    const listedDefault = await listTasks(
      { clientId: CLIENT_ID, perPage: 100 },
      database
    )
    assert.equal(
      listedDefault.items.some((t) => Number(t.id) === id),
      false
    )

    const listedIncl = await listTasks(
      { clientId: CLIENT_ID, includeDeleted: true, perPage: 100 },
      database
    )
    const found = listedIncl.items.find((t) => Number(t.id) === id)
    assert.ok(found, "deleted row must remain selectable with includeDeleted")
    assert.ok(found.deleted_at, "deleted_at must be set")
  })

  it("updateTask refuses a deleted row", async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} refuse update deleted`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
      },
      MIXED,
      database
    )
    const id = Number(task.id)
    taskIds.push(id)
    await softDeleteTask(id, MIXED, database)

    const beforeCount = (await activityFor("task", id)).length
    const result = await updateTask(id, { title: "nope" }, MIXED, database)
    assert.equal(result, null)
    const afterCount = (await activityFor("task", id)).length
    assert.equal(afterCount, beforeCount, "refused update must not append activity")
  })

  it("double soft-delete is a no-op (false), not an error", async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} double soft-delete`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
      },
      MIXED,
      database
    )
    const id = Number(task.id)
    taskIds.push(id)

    assert.equal(await softDeleteTask(id, MIXED, database), true)
    const beforeCount = (await activityFor("task", id)).filter(
      (r) => r.action === "soft_delete"
    ).length

    assert.equal(await softDeleteTask(id, MIXED, database), false)
    const afterCount = (await activityFor("task", id)).filter(
      (r) => r.action === "soft_delete"
    ).length
    assert.equal(afterCount, beforeCount, "second soft-delete must not log again")
  })
})

describe("Codex Stage 0 — activity log", { skip: !hasDb }, () => {
  it('create logs action "create" with after and no before; actor lowercased + kind user', async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} activity create`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
      },
      MIXED,
      database
    )
    const id = Number(task.id)
    taskIds.push(id)

    const rows = await activityFor("task", id)
    const createRow = rows.find((r) => r.action === "create")
    assert.ok(createRow)
    assert.equal(createRow.before, null)
    assert.ok(createRow.after)
    assert.equal(createRow.actorEmail, MIXED.toLowerCase())
    assert.equal(createRow.actorKind, "user")
  })

  it('update logs "update" with BOTH before and after', async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} activity update before`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
      },
      MIXED,
      database
    )
    const id = Number(task.id)
    taskIds.push(id)

    await updateTask(id, { title: `${RUN} activity update after` }, MIXED, database)
    const rows = await activityFor("task", id)
    const updateRow = rows.find((r) => r.action === "update")
    assert.ok(updateRow)
    assert.ok(updateRow.before, "update must record before")
    assert.ok(updateRow.after, "update must record after")
    assert.equal(updateRow.actorEmail, MIXED.toLowerCase())
    assert.equal(updateRow.actorKind, "user")
  })

  it('softDeleteTask logs "soft_delete" with BOTH before and after', async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} activity soft_delete`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
      },
      MIXED,
      database
    )
    const id = Number(task.id)
    taskIds.push(id)

    await softDeleteTask(id, MIXED, database)
    const rows = await activityFor("task", id)
    const del = rows.find((r) => r.action === "soft_delete")
    assert.ok(del)
    assert.ok(del.before, "soft_delete must record before")
    assert.ok(del.after, "soft_delete must record after")
    const after = del.after as { deleted_at?: string | null }
    assert.ok(after.deleted_at, "soft_delete after.deleted_at must be set")
    assert.equal(del.actorEmail, MIXED.toLowerCase())
    assert.equal(del.actorKind, "user")
  })
})
