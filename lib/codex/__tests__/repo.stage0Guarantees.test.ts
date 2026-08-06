/**
 * Codex Stage 0 guarantees — permanent pin of the 4 Aug live-SQL smoke checks.
 * Requires DATABASE_URL. Skips when unset.
 *
 * Activity atomicity: createTask / updateTask / softDeleteTask /
 * createTeamMember / updateTeamMember wrap mutation + appendActivity in one
 * db.transaction. A failure in appendActivity rolls the mutation back.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { and, eq, inArray } from "drizzle-orm"

import { getDb, schema, closeDb, type Db } from "@/db"
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

/** Exact casing from Stage 0 hardening brief — AssembledMedia.com.au. */
const MIXED = "Luke.Fitzpatrick@AssembledMedia.com.au"
const NORMALISED = "luke.fitzpatrick@assembledmedia.com.au"
/** Sentinel client_id — no FK on tasks.client_id (repo tests bypass API exists-check). */
const CLIENT_ID = 900_090_004
const RUN = `s0g${Date.now().toString(36)}`

const taskIds: number[] = []
const teamIds: number[] = []

/**
 * Db proxy: real transaction + queries, but insert into codex_activity throws.
 * Forces appendActivity failure so we can assert mutation rollback.
 */
function dbThatFailsActivityWrite(database: Db): Db {
  return new Proxy(database as object, {
    get(target, prop, receiver) {
      if (prop === "transaction") {
        return (fn: (tx: Db) => Promise<unknown>) =>
          (target as Db).transaction(async (innerTx) =>
            fn(dbThatFailsActivityWrite(innerTx as unknown as Db))
          )
      }
      if (prop === "insert") {
        return (table: unknown) => {
          if (table === schema.codexActivity) {
            return {
              values: () => {
                throw new Error("forced appendActivity failure")
              },
            }
          }
          return (target as Db).insert(table as never)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as Db
}

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
  it('createTask stores assignee_email lowercased from "Luke.Fitzpatrick@AssembledMedia.com.au"', async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} create with assignee`,
        clientId: CLIENT_ID,
        createdByEmail: "creator@example.com",
        assigneeEmail: MIXED,
      },
      "creator@example.com",
      database
    )
    taskIds.push(Number(task.id))
    assert.equal(task.assignee_email, NORMALISED)
  })

  it("createTask null assignee stays null", async () => {
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

  it("updateTask lowercases mixed-case assignee_email; null clears it", async () => {
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

describe("Codex Stage 0 — mutation+activity atomicity", { skip: !hasDb }, () => {
  it("createTask rolls back when appendActivity throws — no task row left", async () => {
    const database = getDb()
    const title = `${RUN} atomicity create fail`
    const failing = dbThatFailsActivityWrite(database)

    await assert.rejects(
      () =>
        createTask(
          {
            title,
            clientId: CLIENT_ID,
            createdByEmail: MIXED,
          },
          MIXED,
          failing
        ),
      /forced appendActivity failure/
    )

    const [row] = await database
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.title, title))
      .limit(1)
    assert.equal(row, undefined, "mutation must roll back when activity write fails")
  })

  it("updateTask rolls back title change when appendActivity throws", async () => {
    const database = getDb()
    const task = await createTask(
      {
        title: `${RUN} atomicity update base`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
      },
      MIXED,
      database
    )
    const id = Number(task.id)
    taskIds.push(id)
    const beforeTitle = task.title

    const failing = dbThatFailsActivityWrite(database)
    await assert.rejects(
      () =>
        updateTask(
          id,
          { title: `${RUN} atomicity update SHOULD NOT STICK` },
          MIXED,
          failing
        ),
      /forced appendActivity failure/
    )

    const after = await getTask(id, database)
    assert.ok(after)
    assert.equal(after.title, beforeTitle)
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
    assert.equal(createRow.actorEmail, NORMALISED)
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
    assert.equal(updateRow.actorEmail, NORMALISED)
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
    assert.equal(del.actorEmail, NORMALISED)
    assert.equal(del.actorKind, "user")
  })
})
