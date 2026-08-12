/**
 * Codex Stage 1 addendum — MBA/client deep-link helpers + countTasksByMba.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { and, eq, inArray } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  parseMbaNumbersQuery,
  parseTasksDeepLinkParams,
} from "../queryHelpers.js"
import {
  countTasksByMba,
  createTask,
  softDeleteTask,
  updateTask,
} from "../repo.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MIXED = "Luke.Fitzpatrick@AssembledMedia.com.au"
const CLIENT_ID = 900_090_015
const RUN = `s1s${Date.now().toString(36)}`
const MBA_A = `S1S${RUN.slice(-6)}A`.toUpperCase()
const MBA_B = `S1S${RUN.slice(-6)}B`.toUpperCase()

const taskIds: number[] = []

async function wipe(): Promise<void> {
  if (!hasDb || taskIds.length === 0) return
  const database = getDb()
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

after(async () => {
  try {
    await wipe()
  } finally {
    if (hasDb) await closeDb()
  }
})

describe("parseTasksDeepLinkParams", () => {
  it("reads mba and client without requiring both", () => {
    assert.deepEqual(
      parseTasksDeepLinkParams(new URLSearchParams("mba=FOO001")),
      { mbaNumber: "FOO001", clientId: null }
    )
    assert.deepEqual(
      parseTasksDeepLinkParams(new URLSearchParams("client=42")),
      { mbaNumber: null, clientId: "42" }
    )
    assert.deepEqual(
      parseTasksDeepLinkParams(new URLSearchParams("mba=BAR&client=9")),
      { mbaNumber: "BAR", clientId: "9" }
    )
  })

  it("rejects non-numeric client and empty mba", () => {
    assert.deepEqual(
      parseTasksDeepLinkParams(new URLSearchParams("client=abc&mba=%20")),
      { mbaNumber: null, clientId: null }
    )
  })

  it("parseMbaNumbersQuery de-dupes CSV", () => {
    assert.deepEqual(parseMbaNumbersQuery(" A,B, A ,"), ["A", "B"])
    assert.deepEqual(parseMbaNumbersQuery(""), [])
    assert.deepEqual(parseMbaNumbersQuery(null), [])
  })
})

describe("countTasksByMba", { skip: !hasDb }, () => {
  it("returns open and overdue counts; soft-deleted and done excluded", async () => {
    const database = getDb()
    // Pin "now" so overdue is deterministic: Sydney 2026-08-11.
    const now = new Date("2026-08-10T20:00:00.000Z") // 06:00 Sydney Aug 11

    const openOk = await createTask(
      {
        title: `${RUN} open ok`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: MBA_A,
        status: "todo",
        dueDate: "2026-08-20",
      },
      MIXED,
      database
    )
    taskIds.push(Number(openOk.id))

    const overdue = await createTask(
      {
        title: `${RUN} overdue`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: MBA_A,
        status: "in_progress",
        dueDate: "2026-08-01",
      },
      MIXED,
      database
    )
    taskIds.push(Number(overdue.id))

    const done = await createTask(
      {
        title: `${RUN} done`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: MBA_A,
        status: "done",
        dueDate: "2026-07-01",
      },
      MIXED,
      database
    )
    taskIds.push(Number(done.id))

    const soft = await createTask(
      {
        title: `${RUN} soft`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: MBA_A,
        status: "todo",
        dueDate: "2026-07-01",
      },
      MIXED,
      database
    )
    taskIds.push(Number(soft.id))
    await softDeleteTask(Number(soft.id), MIXED, database)

    const other = await createTask(
      {
        title: `${RUN} other mba`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: MBA_B,
        status: "waiting",
        dueDate: "2026-08-05",
      },
      MIXED,
      database
    )
    taskIds.push(Number(other.id))

    const counts = await countTasksByMba([MBA_A, MBA_B, "MISSING999"], database, now)
    assert.deepEqual(counts, [
      { mba_number: MBA_A, open: 2, overdue: 1 },
      { mba_number: MBA_B, open: 1, overdue: 1 },
      { mba_number: "MISSING999", open: 0, overdue: 0 },
    ])

    // Moving overdue to done drops both open and overdue.
    await updateTask(Number(overdue.id), { status: "done" }, MIXED, database)
    const after = await countTasksByMba([MBA_A], database, now)
    assert.deepEqual(after, [{ mba_number: MBA_A, open: 1, overdue: 0 }])
  })
})
