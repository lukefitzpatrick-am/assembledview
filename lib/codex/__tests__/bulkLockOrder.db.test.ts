/**
 * R1 and R7 (B43fix): the plain assignment path's project locks, against a
 * real Postgres with 0118 applied.
 *
 * - R1: a plain bulk `{ assignee }` over tasks C and D in project P, where
 *   C's assignee is unchanged and D's changes, against a board move (P held
 *   FOR UPDATE, then C written). Before B43fix the bulk wrote C and then
 *   asked for P: a lock cycle, Postgres stopped one side, and the bulk
 *   answered 400 with the SQL text. Now the bulk takes every batch project
 *   FOR SHARE first, in id order, so it waits for the move and both commit.
 * - R1: a task that joins a project after the batch locked its projects is
 *   refused (409 `task_changed`, the whole batch rolled back), never locked
 *   late.
 * - R1: a database error inside the batch never carries its SQL.
 * - R7: on the single-task path, a task that joined a project between
 *   `shareTaskProject`'s lock and its read has that project locked too.
 *
 * Skips unless CODEX_PROJECTS_TEST_DATABASE_URL names a LOCAL database whose
 * name ends in `_codex_test`. It works in a sibling database
 * `<name>_bulklock_codex_test` (created if missing) and drops and rebuilds
 * that database's public schema. It never reads .env.local.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { after, before, describe, it, test } from "node:test"

import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

import * as schema from "@/db/schema"
import type { Db } from "@/db"
import { createDatabase, RAW_URL, siblingUrl } from "./codexTestDb.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"
import { bulkFailure, bulkUpdateTasks, CodexBulkError } from "../repo.js"
import { assertAssigneeCanSeeTask, TaskJoinedBatchProjectError } from "../taskVisibility.js"
import { createProject, resetProjectsMarkerCacheForTests } from "../projectsRepo.js"
import { DATABASE_ERROR_MESSAGE, LOCK_CONFLICT_MESSAGE } from "../dbErrors.js"

const URL_ = siblingUrl(RAW_URL, "bulklock")
const skip = URL_ ? false : "set CODEX_PROJECTS_TEST_DATABASE_URL to a local database named *_codex_test"

const D = "@assembledmedia.com.au"
const OLIVE = `olive.owner${D}`
const MIA = `mia.tran${D}`

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

test("R1: bulkFailure maps a lock conflict to 409 try_again, a late join to 409 task_changed, and hides database text", () => {
  for (const code of ["40P01", "55P03"]) {
    const cause = Object.assign(new Error("deadlock detected"), { name: "PostgresError", code })
    const err = bulkFailure(5, Object.assign(new Error("Failed query: SELECT 1\nparams: "), { name: "DrizzleQueryError", cause }))
    assert.deepEqual([err.statusCode, err.code, err.taskId, err.message], [409, "try_again", 5, LOCK_CONFLICT_MESSAGE], code)
  }
  const joined = bulkFailure(6, new TaskJoinedBatchProjectError(6))
  assert.deepEqual([joined.statusCode, joined.code], [409, "task_changed"])
  const other = bulkFailure(7, Object.assign(new Error("Failed query: UPDATE tasks"), { cause: { code: "22007" } }))
  assert.deepEqual([other.statusCode, other.code, other.message], [400, undefined, `Task 7: ${DATABASE_ERROR_MESSAGE}`])
  const app = bulkFailure(8, new Error("Invalid recurring_rule"))
  assert.deepEqual([app.statusCode, app.message], [400, "Invalid recurring_rule"], "an app error keeps its text, as before")
})

describe("R1 and R7: the plain path's project locks (Postgres, 0118 applied)", { skip }, () => {
  let client: ReturnType<typeof postgres>
  let database: Db
  const sections = [
    { name: "To do", status_category: "todo" as const },
    { name: "Done", status_category: "done" as const },
  ]

  async function project(name: string): Promise<number> {
    const res = await createProject(
      OLIVE,
      { name, kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: false, start_on: null, due_on: null, members: [], sections },
      database
    )
    assert.ok(res.ok)
    return res.project.id
  }
  async function task(projectId: number | null, assignee: string | null): Promise<number> {
    const [r] = await client`INSERT INTO public.tasks (title, status, project_id, client_id, created_by_email, assignee_email)
      VALUES ('Task', 'todo', ${projectId}, 42, ${OLIVE}, ${assignee}) RETURNING id`
    return Number(r.id)
  }
  async function assignees(ids: number[]): Promise<Array<string | null>> {
    const rows = await client`SELECT id, assignee_email FROM public.tasks WHERE id IN ${client(ids)} ORDER BY id`
    return rows.map((r) => (r.assignee_email == null ? null : String(r.assignee_email)))
  }
  /** Resolves once some session in this database is waiting on a lock. */
  async function someoneWaits(what: string): Promise<void> {
    for (let i = 0; i < 150; i++) {
      const [w] = await client`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`
      if (w.n > 0) return
      await new Promise((r) => setTimeout(r, 20))
    }
    throw new Error(`${what} never waited`)
  }

  before(async () => {
    client = await createDatabase(URL_!)
    await client.unsafe(`INSERT INTO public.team_members (email, name, email_aliases, active) VALUES
      ('${OLIVE}', 'Olive Owner', '[]', true), ('${MIA}', 'Mia Tran', '[]', true)`)
    await client.unsafe(fs.readFileSync(path.join(process.cwd(), "db/migrations/0118_codex_s1_projects.sql"), "utf8"))
    resetProjectsMarkerCacheForTests()
    database = drizzle(client, { schema }) as unknown as Db
    setFeatureRowReaderForTests(
      async () =>
        new Map([
          ["codex_v2", row("codex_v2", true)],
          ["codex_projects", row("codex_projects", true)],
          ["codex_roster_aliases", row("codex_roster_aliases", false)],
        ])
    )
  })

  after(async () => {
    setFeatureRowReaderForTests(null)
    await client?.end({ timeout: 5 })
  })

  it("R1: a plain bulk assignment and a board move on the same project queue; both commit, no deadlock", async () => {
    const proj = await project("Bulk against a board move")
    const c = await task(proj, MIA) // unchanged by the bulk: no check, but its row is written
    const d = await task(proj, OLIVE) // changes: the F5 check holds the project
    const mover = postgres(URL_!, { max: 1, onnotice: () => {} })
    let bulk: Promise<unknown> | null = null
    try {
      await mover.begin(async (tx) => {
        // The statements a board move runs: the project row FOR UPDATE, then the task.
        await tx`SELECT id FROM public.codex_projects WHERE id = ${proj} FOR UPDATE`
        bulk = bulkUpdateTasks([c, d], { assigneeEmail: MIA }, OLIVE, database)
        bulk.catch(() => {})
        await someoneWaits("the bulk")
        await tx`UPDATE public.tasks SET title = 'Moved on the board' WHERE id = ${c}`
      })
    } finally {
      await mover.end({ timeout: 5 })
    }
    const done = (await bulk!) as Array<{ id: number }>
    assert.deepEqual(done.map((t) => t.id), [c, d])
    assert.deepEqual(await assignees([c, d]), [MIA, MIA])
    const [r] = await client`SELECT title FROM public.tasks WHERE id = ${c}`
    assert.equal(r.title, "Moved on the board", "the move committed too")
  })

  it("R1: a task that joined a project after the batch locked its projects is refused (409 task_changed); nothing changes", async () => {
    const proj = await project("Batch project")
    const late = await project("Joined mid-batch")
    const c = await task(proj, OLIVE)
    const e = await task(null, OLIVE)
    const blocker = postgres(URL_!, { max: 1, onnotice: () => {} })
    let bulk: Promise<unknown> | null = null
    try {
      await blocker.begin(async (tx) => {
        // Hold C so the batch stops there, after its first lock and before E.
        await tx`SELECT id FROM public.tasks WHERE id = ${c} FOR UPDATE`
        bulk = bulkUpdateTasks([c, e], { assigneeEmail: MIA }, OLIVE, database)
        bulk.catch(() => {})
        await someoneWaits("the bulk")
        await client`UPDATE public.tasks SET project_id = ${late} WHERE id = ${e}`
      })
    } finally {
      await blocker.end({ timeout: 5 })
    }
    await assert.rejects(bulk!, (err: unknown) => {
      assert.ok(err instanceof CodexBulkError)
      assert.equal(err.statusCode, 409)
      assert.equal(err.code, "task_changed")
      assert.equal(err.taskId, e)
      assert.match(err.message, /moved project while saving/)
      return true
    })
    assert.deepEqual(await assignees([c, e]), [OLIVE, OLIVE], "the whole batch rolled back")
  })

  it("R1: a database error inside the batch is a 400 naming the task, never the SQL", async () => {
    const proj = await project("Bad value")
    const c = await task(proj, OLIVE)
    // A due date the route would refuse, sent straight to the store: Postgres rejects the cast.
    await assert.rejects(bulkUpdateTasks([c], { dueDate: "not a date" }, OLIVE, database), (err: unknown) => {
      assert.ok(err instanceof CodexBulkError)
      assert.equal(err.statusCode, 400)
      assert.equal(err.message, `Task ${c}: ${DATABASE_ERROR_MESSAGE}`)
      assert.doesNotMatch(err.message, /Failed query|public\.tasks|params/)
      return true
    })
  })

  it("R7: a task that joins a project between the lock and the read has that project locked too", async () => {
    const proj = await project("Joined between lock and read")
    const e = await task(null, OLIVE)
    const dialect = new PgDialect()
    let joined = false
    await database.transaction(async (tx) => {
      const watched = new Proxy(tx, {
        get(target, prop) {
          if (prop === "execute") {
            return async (query: SQL) => {
              const result = await target.execute(query)
              const text = dialect.sqlToQuery(query).sql
              if (!joined && /FOR SHARE OF p/.test(text) && /SELECT t\.project_id FROM public\.tasks t/.test(text)) {
                joined = true
                // The first lock found no project; the task joins one before the read.
                await client`UPDATE public.tasks SET project_id = ${proj} WHERE id = ${e}`
              }
              return result
            }
          }
          const value = Reflect.get(target, prop)
          return typeof value === "function" ? value.bind(target) : value
        },
      })
      await assertAssigneeCanSeeTask(watched as typeof tx, e, MIA)
      assert.equal(joined, true, "the task joined between the lock and the read")
      await assert.rejects(
        client`SELECT id FROM public.codex_projects WHERE id = ${proj} FOR UPDATE NOWAIT`,
        (err: unknown) => (err as { code?: string }).code === "55P03",
        "the joined project is held by the assignment"
      )
    })
  })
})
