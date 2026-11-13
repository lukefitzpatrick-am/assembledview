/**
 * PACK3fix: a task made from another task keeps that task's project (and so
 * its privacy, C-211), against a real Postgres with 0118 applied.
 *
 * - P3 Ask for help: a board move that puts the parent into a private project
 *   while the help request waits on the parent row cannot leave the help task
 *   outside the project (two connections, real locks). `lockTaskAndProject`
 *   holds the new project when it returns.
 *
 * Skips unless CODEX_PROJECTS_TEST_DATABASE_URL names a LOCAL database whose
 * name ends in `_codex_test`. It works in a sibling database
 * `<name>_copies_codex_test` (created if missing) and drops and rebuilds that
 * database's public schema. It never reads .env.local.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { after, before, describe, it } from "node:test"

import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { sql } from "drizzle-orm"

import * as schema from "@/db/schema"
import type { Db } from "@/db"
import { createDatabase, RAW_URL, siblingUrl } from "./codexTestDb.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"
import { CodexHelpError } from "../helpRoster.js"
import { listTasks, requestHelp } from "../repo.js"
import { createProject, resetProjectsMarkerCacheForTests } from "../projectsRepo.js"
import { lockTaskAndProject } from "../sectionSync.js"

const URL_ = siblingUrl(RAW_URL, "copies")
const skip = URL_ ? false : "set CODEX_PROJECTS_TEST_DATABASE_URL to a local database named *_codex_test"

const D = "@assembledmedia.com.au"
const OLIVE = `olive.owner${D}`
const MIA = `mia.tran${D}`
const OUT = `out.sider${D}`
const NOW = new Date("2026-11-13T01:00:00Z")

function row(key: string): FeatureRow {
  return { key, enabled: true, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}

describe("a task made from another task keeps its project (Postgres, 0118 applied)", { skip }, () => {
  let client: ReturnType<typeof postgres>
  let database: Db
  let priv = 0
  let open = 0
  const sec: Record<string, number> = {}

  const placeOf = async (id: number) => {
    const [r] = await client`SELECT project_id, section_id FROM public.tasks WHERE id = ${id}`
    return { project: r.project_id == null ? null : Number(r.project_id), section: r.section_id == null ? null : Number(r.section_id) }
  }
  const listIds = async (viewer: string) =>
    (await listTasks({ viewerEmail: viewer, perPage: 200 }, database)).items.map((t) => Number(t.id))

  before(async () => {
    client = await createDatabase(URL_!)
    await client.unsafe(`INSERT INTO public.team_members (email, name, active) VALUES
      ('${OLIVE}', 'Olive Owner', true), ('${MIA}', 'Mia Tran', true), ('${OUT}', 'Out Sider', true)`)
    await client.unsafe(fs.readFileSync(path.join(process.cwd(), "db/migrations/0118_codex_s1_projects.sql"), "utf8"))
    resetProjectsMarkerCacheForTests()
    database = drizzle(client, { schema }) as unknown as Db
    setFeatureRowReaderForTests(async () => new Map([["codex_v2", row("codex_v2")], ["codex_projects", row("codex_projects")]]))
    const a = await createProject(
      OLIVE,
      {
        name: "Secret", kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: true, start_on: null, due_on: null, members: [MIA],
        sections: [
          { name: "Doing", status_category: "in_progress" },
          { name: "To do", status_category: "todo" },
          { name: "Done", status_category: "done" },
        ],
      },
      database
    )
    const b = await createProject(
      OLIVE,
      {
        name: "Open", kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: false, start_on: null, due_on: null, members: [],
        sections: [
          { name: "Doing", status_category: "in_progress" },
          { name: "Done", status_category: "done" },
        ],
      },
      database
    )
    assert.ok(a.ok && b.ok)
    priv = a.project.id
    open = b.project.id
    for (const s of a.sections) sec[`priv:${s.name}`] = s.id
    for (const s of b.sections) sec[`open:${s.name}`] = s.id
  })

  after(async () => {
    setFeatureRowReaderForTests(null)
    await client?.end({ timeout: 5 })
  })

  describe("Ask for help", () => {
    async function noProjectParent(): Promise<number> {
      const [p] = await client`INSERT INTO public.tasks (title, status, client_id, created_by_email, assignee_email)
        VALUES ('Secret acquisition memo', 'todo', 42, ${OLIVE}, ${OLIVE}) RETURNING id`
      return Number(p.id)
    }

    /** Connection A moves `parent` onto the private board and holds it open while `start` runs and waits on a lock; then A commits. */
    async function whileMoving(parent: number, start: () => void): Promise<void> {
      const mover = postgres(URL_!, { max: 1, onnotice: () => {} })
      try {
        await mover.begin(async (tx) => {
          await tx`SELECT id FROM public.codex_projects WHERE id = ${priv} FOR UPDATE`
          await tx`SELECT id FROM public.tasks WHERE id = ${parent} FOR UPDATE`
          await tx`UPDATE public.tasks SET project_id = ${priv}, section_id = ${sec["priv:To do"]}, sort_order = 99 WHERE id = ${parent}`
          await tx`UPDATE public.tasks SET project_id = ${priv} WHERE parent_task_id = ${parent} AND project_id IS NULL`
          start()
          for (let i = 0; i < 100; i++) {
            const [w] = await client`SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE datname = current_database() AND wait_event_type = 'Lock'`
            if (w.n > 0) return
            await new Promise((r) => setTimeout(r, 20))
          }
          throw new Error("the writer never waited on the move")
        })
      } finally {
        await mover.end({ timeout: 5 })
      }
    }

    /**
     * Connection A runs a board move of the parent onto the private board (the
     * statements `moveTaskToSection` runs: the project lock, the task row lock,
     * the update and the help-task follow) and holds it open. Ask for help
     * starts and waits on the parent row; A commits; the help task must land
     * in the private project (or be refused when the helper cannot see it).
     */
    async function raceHelp(helper: string): Promise<{ parent: number; child: number | null; error: unknown }> {
      const parent = await noProjectParent()
      let help: Promise<{ child: { id: number | string } }> | null = null
      await whileMoving(parent, () => {
        help = requestHelp(parent, { assigneeEmail: helper, ask: "Can you check the numbers?" }, { email: OLIVE }, database)
        help.catch(() => {})
      })
      try {
        const res = await help!
        return { parent, child: Number(res.child.id), error: null }
      } catch (error) {
        return { parent, child: null, error }
      }
    }

    it("lockTaskAndProject: after a move committed while it waited, it holds the task's new project", async () => {
      const parent = await noProjectParent()
      let inner: Promise<{ projectId: number | null; probe: string }> | null = null
      await whileMoving(parent, () => {
        inner = database.transaction(async (tx) => {
          const locked = await lockTaskAndProject(tx, parent)
          const probe = postgres(URL_!, { max: 1, onnotice: () => {} })
          try {
            await probe`SELECT id FROM public.codex_projects WHERE id = ${priv} FOR UPDATE NOWAIT`
            return { projectId: locked.projectId, probe: "free" }
          } catch (err) {
            return { projectId: locked.projectId, probe: String((err as { code?: string }).code) }
          } finally {
            await probe.end({ timeout: 5 })
          }
        })
        inner.catch(() => {})
      })
      assert.deepEqual(await inner!, { projectId: priv, probe: "55P03" }, "the new project is locked (project, then task)")
      await database.transaction(async (tx) => {
        await tx.execute(sql`UPDATE public.tasks SET deleted_at = now() WHERE id = ${parent}`)
        assert.deepEqual(await lockTaskAndProject(tx, parent), { found: false, projectId: null }, "a deleted task is not found")
      })
    })

    it("a board move committing while the help request waits: the help task is in the parent's new project", async () => {
      const { parent, child, error } = await raceHelp(MIA)
      assert.equal(error, null)
      assert.equal((await placeOf(parent)).project, priv, "the move committed")
      assert.equal((await placeOf(child!)).project, priv, "never left in no project")
      assert.ok(!(await listIds(OUT)).includes(child!), "the help title stays private")
    })

    it("the same race with a helper outside the project: refused 409, nothing written", async () => {
      const { parent, child, error } = await raceHelp(OUT)
      assert.equal(child, null)
      assert.ok(error instanceof CodexHelpError, String(error))
      assert.equal(error.status, 409)
      const rows = await client`SELECT id FROM public.tasks WHERE parent_task_id = ${parent}`
      assert.equal(rows.length, 0)
      const [p] = await client`SELECT status FROM public.tasks WHERE id = ${parent}`
      assert.equal(p.status, "todo", "the parent is not set waiting")
    })
  })
})
