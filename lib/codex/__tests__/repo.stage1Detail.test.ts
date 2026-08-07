/**
 * Codex Stage 1 step 1 — checklist + comments data layer.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { and, eq, inArray } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  createChecklistItem,
  createComment,
  createTask,
  deleteChecklistItem,
  deleteComment,
  listChecklistItems,
  listComments,
  reorderChecklistItems,
  softDeleteTask,
  updateChecklistItem,
} from "../repo.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MIXED = "Luke.Fitzpatrick@AssembledMedia.com.au"
const NORMALISED = "luke.fitzpatrick@assembledmedia.com.au"
const CLIENT_ID = 900_090_014
const RUN = `s1d${Date.now().toString(36)}`

const taskIds: number[] = []
const checklistIds: number[] = []
const commentIds: number[] = []

async function wipe(): Promise<void> {
  if (!hasDb) return
  const database = getDb()
  if (checklistIds.length) {
    await database
      .delete(schema.codexActivity)
      .where(
        and(
          eq(schema.codexActivity.entityType, "checklist_item"),
          inArray(schema.codexActivity.entityId, checklistIds)
        )
      )
    await database
      .delete(schema.taskChecklistItems)
      .where(inArray(schema.taskChecklistItems.id, checklistIds))
  }
  if (commentIds.length) {
    await database
      .delete(schema.codexActivity)
      .where(
        and(
          eq(schema.codexActivity.entityType, "task_comment"),
          inArray(schema.codexActivity.entityId, commentIds)
        )
      )
    await database
      .delete(schema.taskComments)
      .where(inArray(schema.taskComments.id, commentIds))
  }
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
}

after(async () => {
  try {
    await wipe()
  } finally {
    if (hasDb) await closeDb()
  }
})

async function activityFor(entityType: string, entityId: number) {
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

async function seedTask() {
  const database = getDb()
  const task = await createTask(
    {
      title: `${RUN} detail panel`,
      clientId: CLIENT_ID,
      createdByEmail: MIXED,
    },
    MIXED,
    database
  )
  const id = Number(task.id)
  taskIds.push(id)
  return id
}

describe("Codex Stage 1 — checklist round-trip", { skip: !hasDb }, () => {
  it("create → list → update → reorder → delete; activity for each", async () => {
    const database = getDb()
    const taskId = await seedTask()

    const a = await createChecklistItem(
      taskId,
      { label: "First item" },
      MIXED,
      database
    )
    assert.ok(a)
    checklistIds.push(a.id)
    assert.equal(a.label, "First item")
    assert.equal(a.done, false)
    assert.equal(a.sort, 0)
    assert.equal(a.task_id, taskId)

    const b = await createChecklistItem(
      taskId,
      { label: "Second item" },
      MIXED,
      database
    )
    assert.ok(b)
    checklistIds.push(b.id)
    assert.equal(b.sort, 1)

    const listed = await listChecklistItems(taskId, database)
    assert.deepEqual(
      listed.map((i) => i.id),
      [a.id, b.id]
    )

    const createAct = (await activityFor("checklist_item", a.id)).find(
      (r) => r.action === "create"
    )
    assert.ok(createAct)
    assert.equal(createAct.actorEmail, NORMALISED)
    assert.equal(createAct.actorKind, "user")

    const updated = await updateChecklistItem(
      taskId,
      a.id,
      { label: "First done", done: true },
      MIXED,
      database
    )
    assert.ok(updated)
    assert.equal(updated.label, "First done")
    assert.equal(updated.done, true)
    const updateAct = (await activityFor("checklist_item", a.id)).find(
      (r) => r.action === "update"
    )
    assert.ok(updateAct)
    assert.ok(updateAct.before)
    assert.ok(updateAct.after)

    const reordered = await reorderChecklistItems(
      taskId,
      [b.id, a.id],
      MIXED,
      database
    )
    assert.ok(reordered)
    assert.deepEqual(
      reordered.map((i) => ({ id: i.id, sort: i.sort })),
      [
        { id: b.id, sort: 0 },
        { id: a.id, sort: 1 },
      ]
    )
    const listedAfter = await listChecklistItems(taskId, database)
    assert.deepEqual(
      listedAfter.map((i) => i.id),
      [b.id, a.id],
      "list order must follow stable sort"
    )
    const reorderAct = (await activityFor("task", taskId)).find(
      (r) => r.action === "checklist_reorder"
    )
    assert.ok(reorderAct)

    const deleted = await deleteChecklistItem(taskId, b.id, MIXED, database)
    assert.equal(deleted, true)
    const afterDelete = await listChecklistItems(taskId, database)
    assert.deepEqual(
      afterDelete.map((i) => i.id),
      [a.id]
    )
    const deleteAct = (await activityFor("checklist_item", b.id)).find(
      (r) => r.action === "delete"
    )
    assert.ok(deleteAct)
    assert.ok(deleteAct.before)
  })

  it("mutation on soft-deleted task is refused", async () => {
    const database = getDb()
    const taskId = await seedTask()
    const item = await createChecklistItem(
      taskId,
      { label: "Will orphan-attempt" },
      MIXED,
      database
    )
    assert.ok(item)
    checklistIds.push(item.id)

    await softDeleteTask(taskId, MIXED, database)

    assert.equal(
      await createChecklistItem(taskId, { label: "No" }, MIXED, database),
      null
    )
    assert.equal(
      await updateChecklistItem(
        taskId,
        item.id,
        { done: true },
        MIXED,
        database
      ),
      null
    )
    assert.equal(
      await deleteChecklistItem(taskId, item.id, MIXED, database),
      false
    )
    assert.equal(
      await reorderChecklistItems(taskId, [item.id], MIXED, database),
      null
    )
  })
})

describe("Codex Stage 1 — comments round-trip", { skip: !hasDb }, () => {
  it("create → list → delete; activity; email lowercased; author_kind user", async () => {
    const database = getDb()
    const taskId = await seedTask()

    const comment = await createComment(
      taskId,
      {
        body: "  Hello thread  ",
        authorEmail: MIXED,
        authorName: "Luke",
        authorKind: "user",
      },
      MIXED,
      database
    )
    assert.ok(comment)
    commentIds.push(comment.id)
    assert.equal(comment.body, "Hello thread")
    assert.equal(comment.author_email, NORMALISED)
    assert.equal(comment.author_name, "Luke")
    assert.equal(comment.author_kind, "user")
    assert.equal(comment.task_id, taskId)

    const listed = await listComments(taskId, database)
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.id, comment.id)

    const createAct = (await activityFor("task_comment", comment.id)).find(
      (r) => r.action === "create"
    )
    assert.ok(createAct)
    assert.equal(createAct.actorEmail, NORMALISED)
    assert.equal(createAct.actorKind, "user")

    const ok = await deleteComment(taskId, comment.id, MIXED, database)
    assert.equal(ok, true)
    assert.deepEqual(await listComments(taskId, database), [])
    const deleteAct = (await activityFor("task_comment", comment.id)).find(
      (r) => r.action === "delete"
    )
    assert.ok(deleteAct)
    assert.ok(deleteAct.before)
  })

  it("mutation on soft-deleted task is refused", async () => {
    const database = getDb()
    const taskId = await seedTask()
    const comment = await createComment(
      taskId,
      { body: "keep", authorEmail: MIXED },
      MIXED,
      database
    )
    assert.ok(comment)
    commentIds.push(comment.id)

    await softDeleteTask(taskId, MIXED, database)

    assert.equal(
      await createComment(
        taskId,
        { body: "nope", authorEmail: MIXED },
        MIXED,
        database
      ),
      null
    )
    assert.equal(
      await deleteComment(taskId, comment.id, MIXED, database),
      false
    )
  })

  it("createComment with authorKind ava stamps activity actor_kind ava (C-39)", async () => {
    const database = getDb()
    const taskId = await seedTask()
    const comment = await createComment(
      taskId,
      {
        body: "AVA preview",
        authorEmail: null,
        authorName: "Ava",
        authorKind: "ava",
      },
      null,
      database
    )
    assert.ok(comment)
    commentIds.push(comment.id)
    assert.equal(comment.author_kind, "ava")
    const createAct = (await activityFor("task_comment", comment.id)).find(
      (r) => r.action === "create"
    )
    assert.ok(createAct)
    assert.equal(createAct.actorKind, "ava")
  })
})
