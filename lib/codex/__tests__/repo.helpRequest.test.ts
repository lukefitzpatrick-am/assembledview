/**
 * Codex ask-for-help — parent/child + restore.
 * Requires DATABASE_URL and migration 0078. Skips when unset or unapplied.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { and, eq, inArray } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  createComment,
  createTask,
  createTeamMember,
  getTask,
  listComments,
  listTaskActivity,
  requestHelp,
  updateTask,
} from "../repo.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MIXED = "Luke.Fitzpatrick@AssembledMedia.com.au"
const CLIENT_ID = 900_090_078
const RUN = `help${Date.now().toString(36)}`

const taskIds: number[] = []
const commentIds: number[] = []
const memberIds: number[] = []

async function hasHelpColumns(): Promise<boolean> {
  if (!hasDb) return false
  const database = getDb()
  try {
    await database
      .select({ parent: schema.tasks.parentTaskId })
      .from(schema.tasks)
      .limit(1)
    return true
  } catch {
    return false
  }
}

const ready = await hasHelpColumns()

async function wipe(): Promise<void> {
  if (!hasDb) return
  const database = getDb()
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
  if (memberIds.length) {
    await database
      .delete(schema.teamMembers)
      .where(inArray(schema.teamMembers.id, memberIds))
  }
}

after(async () => {
  try {
    await wipe()
  } finally {
    if (hasDb) await closeDb()
  }
})

async function seedHelper(name: string) {
  const database = getDb()
  const member = await createTeamMember(
    {
      email: `${name}.${RUN}@assembledmedia.com.au`,
      name,
    },
    MIXED,
    database
  )
  memberIds.push(member.id)
  return member
}

describe("Codex ask-for-help", { skip: !ready }, () => {
  it("creates a child, waits, keeps waiting on a second ask, restores on last done", async () => {
    const database = getDb()
    const helperA = await seedHelper("Ada")
    const helperB = await seedHelper("Bea")

    const parent = await createTask(
      {
        title: `${RUN} parent`,
        clientId: CLIENT_ID,
        status: "todo",
        createdByEmail: MIXED,
        dueDate: "2026-09-30T00:00:00.000Z",
        mbaNumber: "HELP001",
      },
      MIXED,
      database
    )
    const parentId = Number(parent.id)
    taskIds.push(parentId)

    const first = await requestHelp(
      parentId,
      { assigneeEmail: helperA.email, ask: "Can you take a look?" },
      { email: MIXED, name: "Luke" },
      database
    )
    const childAId = Number(first.child.id)
    taskIds.push(childAId)

    assert.equal(first.parent.status, "waiting")
    assert.equal(first.parent.help_prior_status, "todo")
    assert.equal(first.parent.help_requested_by_email, MIXED.toLowerCase())
    assert.equal(first.child.title, `Help: ${RUN} parent`)
    assert.equal(first.child.assignee_email, helperA.email)
    assert.equal(first.child.parent_task_id, parentId)
    assert.equal(first.child.status, "backlog")
    assert.equal(first.child.mba_number, "HELP001")

    const childComments = await listComments(childAId, database)
    assert.equal(childComments.length, 1)
    assert.equal(childComments[0]?.body, "Can you take a look?")
    commentIds.push(childComments[0]!.id)

    const activity = await listTaskActivity(parentId, database)
    assert.ok(
      activity.some((row) => row.action === "asked Ada for help"),
      "parent activity names the helper"
    )

    const second = await requestHelp(
      parentId,
      { assigneeEmail: helperB.email, ask: "Second pair of eyes" },
      { email: MIXED, name: "Luke" },
      database
    )
    const childBId = Number(second.child.id)
    taskIds.push(childBId)
    const secondAsk = (await listComments(childBId, database))[0]
    if (secondAsk) commentIds.push(secondAsk.id)

    assert.equal(second.parent.status, "waiting")
    assert.equal(second.parent.help_prior_status, "todo")
    assert.equal(second.parent.children?.length, 2)

    const afterFirstDone = await updateTask(
      childAId,
      { status: "done" },
      helperA.email,
      database
    )
    assert.equal(afterFirstDone?.status, "done")

    const stillWaiting = await getTask(parentId, database)
    assert.equal(stillWaiting?.status, "waiting")
    assert.equal(stillWaiting?.help_prior_status, "todo")

    const extra = await createComment(
      childBId,
      {
        body: "Fixed the checklist",
        authorEmail: helperB.email,
        authorName: helperB.name,
      },
      helperB.email,
      database
    )
    if (extra) commentIds.push(extra.id)

    await updateTask(childBId, { status: "done" }, helperB.email, database)

    const restored = await getTask(parentId, database)
    assert.equal(restored?.status, "todo")
    assert.equal(restored?.help_prior_status, null)

    const parentComments = await listComments(parentId, database)
    for (const c of parentComments) commentIds.push(c.id)
    assert.ok(
      parentComments.some((c) => c.body === "Bea: Fixed the checklist"),
      "last child comment copied onto the parent"
    )

    const doneActivity = await listTaskActivity(parentId, database)
    assert.ok(
      doneActivity.some((row) => row.action === "help from Bea done"),
      "parent activity records help done"
    )
  })
})
