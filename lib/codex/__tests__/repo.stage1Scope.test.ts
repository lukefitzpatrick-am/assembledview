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
  parseTaskSort,
  parseTasksDeepLinkParams,
} from "../queryHelpers.js"
import {
  countTasksByMba,
  createTask,
  listTasks,
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

describe("listTasks q", { skip: !hasDb }, () => {
  it("matches description, MBA case-insensitively, a literal percent, and the count", async () => {
    const database = getDb()
    const needle = `qn${RUN}`

    const byDescription = await createTask(
      {
        title: `${needle} plain title`,
        description: `${needle} hidden in the body`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: `${needle}X`,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(byDescription.id))

    const byMba = await createTask(
      {
        title: `${needle} other title`,
        description: "no description hit",
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: `zz${needle}mba`,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(byMba.id))

    const literalPercent = await createTask(
      {
        title: `${needle} 100% done`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: `${needle}P`,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(literalPercent.id))

    const wildcardDecoy = await createTask(
      {
        title: `${needle} 1000 done`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: `${needle}D`,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(wildcardDecoy.id))

    const descriptionHits = await listTasks(
      { q: `${needle} hidden`, clientId: CLIENT_ID, perPage: 100 },
      database
    )
    assert.deepEqual(
      descriptionHits.items.map((t) => Number(t.id)),
      [Number(byDescription.id)]
    )
    assert.equal(descriptionHits.itemsTotal, descriptionHits.items.length)

    const mbaHits = await listTasks(
      { q: `ZZ${needle}MBA`, clientId: CLIENT_ID, perPage: 100 },
      database
    )
    assert.deepEqual(
      mbaHits.items.map((t) => Number(t.id)),
      [Number(byMba.id)]
    )
    assert.equal(mbaHits.itemsTotal, mbaHits.items.length)

    const percentHits = await listTasks(
      { q: `${needle} 100%`, clientId: CLIENT_ID, perPage: 100 },
      database
    )
    assert.deepEqual(
      percentHits.items.map((t) => Number(t.id)),
      [Number(literalPercent.id)]
    )
    assert.equal(percentHits.itemsTotal, percentHits.items.length)
  })
})

describe("task sort", () => {
  it("accepts the old route sort values as aliases", () => {
    assert.equal(parseTaskSort("due_date_asc"), "due_asc")
    assert.equal(parseTaskSort("due_date_desc"), "due_desc")
    assert.equal(parseTaskSort("created_at_desc"), "created_desc")
    assert.equal(parseTaskSort("due_asc"), "due_asc")
    assert.equal(parseTaskSort("priority_desc"), "priority_desc")
    assert.equal(parseTaskSort(null), "due_asc")
    assert.equal(parseTaskSort("nope"), "due_asc")
  })
})

describe("listTasks sort", { skip: !hasDb }, () => {
  it("puts undated tasks last for both due directions and breaks ties by id desc", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}S`.toUpperCase()

    const undated = await createTask(
      {
        title: `${RUN} sort undated`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        dueDate: null,
      },
      MIXED,
      database
    )
    taskIds.push(Number(undated.id))

    const early = await createTask(
      {
        title: `${RUN} sort early`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        dueDate: "2026-01-02",
      },
      MIXED,
      database
    )
    taskIds.push(Number(early.id))

    const midFirst = await createTask(
      {
        title: `${RUN} sort mid first`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        dueDate: "2026-06-01",
      },
      MIXED,
      database
    )
    taskIds.push(Number(midFirst.id))

    const midLater = await createTask(
      {
        title: `${RUN} sort mid later`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        dueDate: "2026-06-01",
      },
      MIXED,
      database
    )
    taskIds.push(Number(midLater.id))

    const late = await createTask(
      {
        title: `${RUN} sort late`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        dueDate: "2026-12-31",
      },
      MIXED,
      database
    )
    taskIds.push(Number(late.id))

    const soonest = [
      Number(early.id),
      Number(midLater.id),
      Number(midFirst.id),
      Number(late.id),
      Number(undated.id),
    ]
    const latest = [
      Number(late.id),
      Number(midLater.id),
      Number(midFirst.id),
      Number(early.id),
      Number(undated.id),
    ]

    const asc = await listTasks(
      { mbaNumber: mba, sort: "due_asc", perPage: 20 },
      database
    )
    assert.deepEqual(
      asc.items.map((t) => Number(t.id)),
      soonest
    )

    const desc = await listTasks(
      { mbaNumber: mba, sort: "due_desc", perPage: 20 },
      database
    )
    assert.deepEqual(
      desc.items.map((t) => Number(t.id)),
      latest
    )

    const aliasAsc = await listTasks(
      { mbaNumber: mba, sort: "due_date_asc", perPage: 20 },
      database
    )
    assert.deepEqual(
      aliasAsc.items.map((t) => Number(t.id)),
      soonest
    )

    const aliasDesc = await listTasks(
      { mbaNumber: mba, sort: "due_date_desc", perPage: 20 },
      database
    )
    assert.deepEqual(
      aliasDesc.items.map((t) => Number(t.id)),
      latest
    )
  })

  it("orders high, then normal, then low, ahead of due date", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}P`.toUpperCase()

    const high = await createTask(
      {
        title: `${RUN} pri high`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        priority: "high",
        dueDate: "2026-12-01",
      },
      MIXED,
      database
    )
    taskIds.push(Number(high.id))

    const normal = await createTask(
      {
        title: `${RUN} pri normal`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        priority: "normal",
        dueDate: "2026-01-01",
      },
      MIXED,
      database
    )
    taskIds.push(Number(normal.id))

    const low = await createTask(
      {
        title: `${RUN} pri low`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        priority: "low",
        dueDate: null,
      },
      MIXED,
      database
    )
    taskIds.push(Number(low.id))

    const listed = await listTasks(
      { mbaNumber: mba, sort: "priority_desc", perPage: 20 },
      database
    )
    assert.deepEqual(
      listed.items.map((t) => Number(t.id)),
      [Number(high.id), Number(normal.id), Number(low.id)]
    )
  })
})

function idsOf(result: { items: { id: number | string }[]; itemsTotal: number }): number[] {
  return result.items.map((task) => Number(task.id))
}

describe("listTasks filters", { skip: !hasDb }, () => {
  it("filters priority to the requested values and counts the same rows", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}H`.toUpperCase()
    const high = await createTask(
      {
        title: `${RUN} filter high`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        priority: "high",
      },
      MIXED,
      database
    )
    taskIds.push(Number(high.id))
    const low = await createTask(
      {
        title: `${RUN} filter low`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        priority: "low",
      },
      MIXED,
      database
    )
    taskIds.push(Number(low.id))
    const normal = await createTask(
      {
        title: `${RUN} filter normal`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        priority: "normal",
      },
      MIXED,
      database
    )
    taskIds.push(Number(normal.id))

    const listed = await listTasks(
      { mbaNumber: mba, priority: "high,low,bogus", perPage: 20 },
      database
    )
    assert.deepEqual(idsOf(listed).toSorted((a, b) => a - b), [
      Number(high.id),
      Number(low.id),
    ].toSorted((a, b) => a - b))
    assert.equal(listed.itemsTotal, 2)
  })

  it("overdue is due before Sydney today and excludes done", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}O`.toUpperCase()
    const now = new Date("2026-08-14T02:00:00.000Z")
    const late = await createTask(
      {
        title: `${RUN} overdue open`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        dueDate: "2026-08-13",
      },
      MIXED,
      database
    )
    taskIds.push(Number(late.id))
    const finished = await createTask(
      {
        title: `${RUN} overdue done`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "done",
        dueDate: "2026-08-13",
      },
      MIXED,
      database
    )
    taskIds.push(Number(finished.id))
    const today = await createTask(
      {
        title: `${RUN} overdue today`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        dueDate: "2026-08-14",
      },
      MIXED,
      database
    )
    taskIds.push(Number(today.id))

    const listed = await listTasks(
      { mbaNumber: mba, overdue: true, now, perPage: 20 },
      database
    )
    assert.deepEqual(idsOf(listed), [Number(late.id)])
    assert.equal(listed.itemsTotal, 1)
  })

  it("unassigned matches a null assignee only", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}U`.toUpperCase()
    const open = await createTask(
      {
        title: `${RUN} unassigned`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(open.id))
    const owned = await createTask(
      {
        title: `${RUN} assigned`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        assigneeEmail: MIXED,
      },
      MIXED,
      database
    )
    taskIds.push(Number(owned.id))

    const listed = await listTasks(
      { mbaNumber: mba, unassigned: true, perPage: 20 },
      database
    )
    assert.deepEqual(idsOf(listed), [Number(open.id)])
    assert.equal(listed.itemsTotal, 1)
  })

  it("no_client matches a null client and excludes a client row", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}N`.toUpperCase()
    const bare = await createTask(
      {
        title: `${RUN} no client`,
        clientId: null as unknown as number,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(bare.id))
    const owned = await createTask(
      {
        title: `${RUN} has client`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(owned.id))

    const listed = await listTasks(
      { mbaNumber: mba, noClient: true, perPage: 20 },
      database
    )
    assert.deepEqual(idsOf(listed), [Number(bare.id)])
    assert.equal(listed.itemsTotal, 1)
  })

  it("created_by matches the creator case-insensitively", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}C`.toUpperCase()
    const mine = await createTask(
      {
        title: `${RUN} created by me`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(mine.id))
    const other = await createTask(
      {
        title: `${RUN} created by other`,
        clientId: CLIENT_ID,
        createdByEmail: "other.person@assembledmedia.com.au",
        mbaNumber: mba,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(other.id))

    const listed = await listTasks(
      {
        mbaNumber: mba,
        createdByEmail: "LUKE.FITZPATRICK@assembledmedia.com.au",
        perPage: 20,
      },
      database
    )
    assert.deepEqual(idsOf(listed), [Number(mine.id)])
    assert.equal(listed.itemsTotal, 1)
  })

  it("due_after and due_before are inclusive Sydney civil bounds", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}R`.toUpperCase()
    const ids: Record<string, number> = {}
    for (const due of ["2026-08-09", "2026-08-10", "2026-08-12", "2026-08-13"]) {
      const row = await createTask(
        {
          title: `${RUN} due ${due}`,
          clientId: CLIENT_ID,
          createdByEmail: MIXED,
          mbaNumber: mba,
          status: "todo",
          dueDate: due,
        },
        MIXED,
        database
      )
      taskIds.push(Number(row.id))
      ids[due] = Number(row.id)
    }

    const listed = await listTasks(
      {
        mbaNumber: mba,
        dueAfter: "2026-08-10",
        dueBefore: "2026-08-12",
        perPage: 20,
      },
      database
    )
    assert.deepEqual(idsOf(listed).toSorted((a, b) => a - b), [
      ids["2026-08-10"],
      ids["2026-08-12"],
    ].toSorted((a, b) => a - b))
    assert.equal(listed.itemsTotal, 2)
  })

  it("source matches the list, and profile matches profile: values", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}X`.toUpperCase()
    const manual = await createTask(
      {
        title: `${RUN} source manual`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        source: "manual",
      },
      MIXED,
      database
    )
    taskIds.push(Number(manual.id))
    const profile = await createTask(
      {
        title: `${RUN} source profile`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        source: "profile:seed",
      },
      MIXED,
      database
    )
    taskIds.push(Number(profile.id))
    const ava = await createTask(
      {
        title: `${RUN} source ava`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        source: "ava",
      },
      MIXED,
      database
    )
    taskIds.push(Number(ava.id))

    const listed = await listTasks(
      { mbaNumber: mba, source: "manual,profile", perPage: 20 },
      database
    )
    assert.deepEqual(idsOf(listed).toSorted((a, b) => a - b), [
      Number(manual.id),
      Number(profile.id),
    ].toSorted((a, b) => a - b))
    assert.equal(listed.itemsTotal, 2)
  })

  it("category=none matches a null category", async () => {
    const database = getDb()
    const mba = `S1S${RUN.slice(-6)}G`.toUpperCase()
    const blank = await createTask(
      {
        title: `${RUN} no category`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        category: null,
      },
      MIXED,
      database
    )
    taskIds.push(Number(blank.id))
    const reporting = await createTask(
      {
        title: `${RUN} reporting`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
        category: "reporting",
      },
      MIXED,
      database
    )
    taskIds.push(Number(reporting.id))

    const listed = await listTasks(
      { mbaNumber: mba, category: "none", perPage: 20 },
      database
    )
    assert.deepEqual(idsOf(listed), [Number(blank.id)])
    assert.equal(listed.itemsTotal, 1)
  })

  it("matches mba_number case-insensitively", async () => {
    const database = getDb()
    const mba = `AbC${RUN.slice(-6)}`
    const row = await createTask(
      {
        title: `${RUN} mba case`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        mbaNumber: mba,
        status: "todo",
      },
      MIXED,
      database
    )
    taskIds.push(Number(row.id))

    const lower = await listTasks(
      { mbaNumber: mba.toLowerCase(), perPage: 20 },
      database
    )
    const upper = await listTasks(
      { mbaNumber: mba.toUpperCase(), perPage: 20 },
      database
    )
    const miss = await listTasks(
      { mbaNumber: `abx${RUN.slice(-6)}`, perPage: 20 },
      database
    )
    assert.deepEqual(idsOf(lower), [Number(row.id)])
    assert.deepEqual(idsOf(upper), [Number(row.id)])
    assert.equal(lower.itemsTotal, 1)
    assert.equal(upper.itemsTotal, 1)
    assert.equal(miss.itemsTotal, 0)
  })
})
