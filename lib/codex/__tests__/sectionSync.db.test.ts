/**
 * C-220 (B42): the status writers outside PATCH, bulk and the boards follow
 * the section rule for a task in a project, on Postgres with 0118 applied:
 * Ask for help, a help child done and reopened, and the relabel auto-close.
 * A project without a section for the status keeps the task's section (these
 * writers never refuse). A private project's activity names no section.
 *
 * Skips unless CODEX_PROJECTS_TEST_DATABASE_URL names a LOCAL database whose
 * name ends in `_codex_test` (sibling `<name>_sections_codex_test`).
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { after, before, describe, it } from "node:test"

import type postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"

import * as schema from "@/db/schema"
import type { Db } from "@/db"
import { createDatabase, RAW_URL, siblingUrl } from "./codexTestDb.js"
import { requestHelp, updateTask, updateTaskFollowingSections } from "../repo.js"
import { createProject, resetProjectsMarkerCacheForTests } from "../projectsRepo.js"

const URL_ = siblingUrl(RAW_URL, "sections")
const skip = URL_ ? false : "set CODEX_PROJECTS_TEST_DATABASE_URL to a local database named *_codex_test"

const OWNER = "olive.owner@assembledmedia.com.au"
const HELPER = "mia.tran@assembledmedia.com.au"

describe("C-220: other status writers follow the section rule (Postgres, 0118 applied)", { skip }, () => {
  let client: ReturnType<typeof postgres>
  let database: Db
  const sec: Record<string, number> = {}
  let seo = 0
  let plain = 0
  let secret = 0
  let plainTodo = 0
  let secretTodo = 0
  let secretWaiting = 0

  async function project(name: string, sections: Array<{ name: string; status_category: "todo" | "in_progress" | "waiting" | "done" }>, isPrivate = false) {
    const r = await createProject(
      OWNER,
      { name, kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: isPrivate, start_on: null, due_on: null, members: [], sections },
      database
    )
    assert.ok(r.ok)
    return { id: r.project.id, sec: Object.fromEntries(r.sections.map((s) => [s.name, s.id])) as Record<string, number> }
  }
  async function task(title: string, projectId: number, sectionId: number, status = "todo") {
    const [row] = await client`INSERT INTO public.tasks (title, status, client_id, project_id, section_id, sort_order, created_by_email, assignee_email)
      VALUES (${title}, ${status}, 42, ${projectId}, ${sectionId}, 0, ${OWNER}, ${OWNER}) RETURNING id`
    return Number(row.id)
  }
  async function where(id: number) {
    const [r] = await client`SELECT status, section_id::int AS section_id FROM public.tasks WHERE id = ${id}`
    return `${r.status}@${r.section_id}`
  }
  async function moves(id: number) {
    return client`SELECT before, after, actor_kind FROM public.codex_activity WHERE entity_type = 'task' AND entity_id = ${id} AND action = 'move_section' ORDER BY id`
  }

  before(async () => {
    client = await createDatabase(URL_!)
    await client.unsafe(`INSERT INTO public.team_members (email, name) VALUES ('${OWNER}', 'Olive Owner'), ('${HELPER}', 'Mia Tran')`)
    await client.unsafe(fs.readFileSync(path.join(process.cwd(), "db/migrations/0118_codex_s1_projects.sql"), "utf8"))
    resetProjectsMarkerCacheForTests()
    database = drizzle(client, { schema }) as unknown as Db
    const a = await project("SEO", [
      { name: "To do", status_category: "todo" },
      { name: "This week", status_category: "in_progress" },
      { name: "Support needed", status_category: "waiting" },
      { name: "Done", status_category: "done" },
    ])
    seo = a.id
    Object.assign(sec, a.sec)
    const b = await project("Plain", [
      { name: "To do", status_category: "todo" },
      { name: "Done", status_category: "done" },
    ])
    plain = b.id
    plainTodo = b.sec["To do"]
    const c = await project(
      "Secret",
      [
        { name: "Backlog", status_category: "todo" },
        { name: "Awaiting", status_category: "waiting" },
        { name: "Done", status_category: "done" },
      ],
      true
    )
    secret = c.id
    secretTodo = c.sec["Backlog"]
    secretWaiting = c.sec["Awaiting"]
  })

  after(async () => {
    await client?.end({ timeout: 5 })
  })

  it("Ask for help moves the parent to the Waiting section; the helper finishing brings it back; reopening waits again", async () => {
    const id = await task("Audit", seo, sec["This week"], "in_progress")
    const { child } = await requestHelp(id, { assigneeEmail: HELPER, ask: "Check the crawl" }, { email: OWNER }, database)
    assert.equal(await where(id), `waiting@${sec["Support needed"]}`)
    const [m1] = await moves(id)
    assert.deepEqual(m1.before, { project_id: seo, section: "This week", section_id: sec["This week"] })
    assert.deepEqual(m1.after, { project_id: seo, section: "Support needed", section_id: sec["Support needed"] })
    await updateTask(Number(child.id), { status: "done" }, HELPER, database)
    assert.equal(await where(id), `in_progress@${sec["This week"]}`, "back to its prior status and that section")
    await updateTask(Number(child.id), { status: "todo" }, HELPER, database)
    assert.equal(await where(id), `waiting@${sec["Support needed"]}`, "reopened: waits again")
    assert.equal((await moves(id)).length, 3)
  })

  it("C-230 (B42): with trackAssignedBy the helper's task records the asker as assigned by; without, nothing", async () => {
    const id = await task("Assigned by", seo, sec["To do"])
    const { child } = await requestHelp(id, { assigneeEmail: HELPER, ask: "Look" }, { email: OWNER }, database, { trackAssignedBy: true })
    const [c] = await client`SELECT assigned_by_email FROM public.tasks WHERE id = ${Number(child.id)}`
    assert.equal(c.assigned_by_email, OWNER)
    const id2 = await task("Not tracked", seo, sec["To do"])
    const r2 = await requestHelp(id2, { assigneeEmail: HELPER, ask: "Look" }, { email: OWNER }, database)
    const [c2] = await client`SELECT assigned_by_email FROM public.tasks WHERE id = ${Number(r2.child.id)}`
    assert.equal(c2.assigned_by_email, null)
  })

  it("no section with the status: the writer is not refused and the task keeps its section", async () => {
    const id = await task("No waiting lane", plain, plainTodo)
    const { child } = await requestHelp(id, { assigneeEmail: HELPER, ask: "Help" }, { email: OWNER }, database)
    assert.equal(await where(id), `waiting@${plainTodo}`)
    assert.equal((await moves(id)).length, 0)
    await updateTask(Number(child.id), { status: "done" }, HELPER, database)
    assert.equal(await where(id), `todo@${plainTodo}`)
  })

  it("relabel auto-close: a project task goes to the first done section, last in it", async () => {
    const other = await task("Already done", seo, sec["Done"], "done")
    const id = await task("Relabel BVOD", seo, sec["To do"])
    await updateTaskFollowingSections(id, { status: "done" }, "system", database)
    assert.equal(await where(id), `done@${sec["Done"]}`)
    const [r] = await client`SELECT sort_order, completed_at FROM public.tasks WHERE id = ${id}`
    const [o] = await client`SELECT sort_order FROM public.tasks WHERE id = ${other}`
    assert.ok(Number(r.sort_order) > Number(o.sort_order))
    assert.ok(r.completed_at)
    const loose = (await client`INSERT INTO public.tasks (title, status, created_by_email) VALUES ('loose', 'todo', ${OWNER}) RETURNING id`)[0]
    const res = await updateTaskFollowingSections(Number(loose.id), { status: "done" }, "system", database)
    assert.equal(res?.status, "done", "a task in no project: the plain update")
  })

  it("a private project's move rows name no section", async () => {
    const id = await task("Secret audit", secret, secretTodo)
    await requestHelp(id, { assigneeEmail: HELPER, ask: "Help" }, { email: OWNER }, database)
    assert.equal(await where(id), `waiting@${secretWaiting}`)
    const [m] = await moves(id)
    assert.deepEqual(m.after, { project_id: secret, section_id: secretWaiting })
    assert.ok(!JSON.stringify(m).includes("Awaiting"))
  })

  it("a help parent whose project row is busy keeps its section instead of waiting (NOWAIT inside the child's write)", async () => {
    const id = await task("Busy", seo, sec["This week"], "in_progress")
    const { child } = await requestHelp(id, { assigneeEmail: HELPER, ask: "Help" }, { email: OWNER }, database)
    assert.equal(await where(id), `waiting@${sec["Support needed"]}`)
    await client.begin(async (holder) => {
      await holder`SELECT id FROM public.codex_projects WHERE id = ${seo} FOR UPDATE`
      // A second connection finishes the help child while the project row is held.
      await updateTask(Number(child.id), { status: "done" }, HELPER, database)
    })
    assert.equal(await where(id), `in_progress@${sec["Support needed"]}`, "status restored, section left (no deadlock, no wait)")
  })
})
