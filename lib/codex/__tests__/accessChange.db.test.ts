/**
 * B43 (C-258): an access change never strands an assignee, against a real
 * Postgres with 0118 applied.
 *
 * - Removing a member of a private project who holds open tasks there is
 *   refused, 409 `open_tasks_lose_access`, naming the count; nothing changes.
 * - Making a project private while open tasks are assigned to people who are
 *   not members (subtasks and help tasks count) is refused the same way.
 * - A new owner of a private project, when the old owner holds open tasks
 *   and is not a member or the creator, is refused the same way.
 * - Done tasks, public projects, the owner and creator, and tasks already
 *   stranded before the change never block it.
 * - Aliases resolve as for any viewer (`codex_roster_aliases`).
 * - The plain assignment path holds the project row FOR SHARE, so a removal
 *   in flight and an assignment wait for each other: the assignment after a
 *   committed removal is refused, never stranded.
 *
 * Skips unless CODEX_PROJECTS_TEST_DATABASE_URL names a LOCAL database whose
 * name ends in `_codex_test`. It works in a sibling database
 * `<name>_accesschg_codex_test` (created if missing) and drops and rebuilds
 * that database's public schema. It never reads .env.local.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { after, afterEach, before, describe, it } from "node:test"

import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"

import * as schema from "@/db/schema"
import type { Db } from "@/db"
import { createDatabase, RAW_URL, siblingUrl } from "./codexTestDb.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"
import { updateTask } from "../repo.js"
import { AssigneeNoAccessError } from "../projects.js"
import {
  assigneesLoseAccessMessage,
  createProject,
  memberHasOpenTasksMessage,
  removeProjectMember,
  resetProjectsMarkerCacheForTests,
  updateProject,
} from "../projectsRepo.js"
import { PROJECT_FAILURE_STATUS } from "../projectFailureStatus.js"

const URL_ = siblingUrl(RAW_URL, "accesschg")
const skip = URL_ ? false : "set CODEX_PROJECTS_TEST_DATABASE_URL to a local database named *_codex_test"

const D = "@assembledmedia.com.au"
const OLIVE = `olive.owner${D}`
const MIA = `mia.tran${D}`
const MIA_ALIAS = `mia${D}`
const ELLIE = `ellie.ward${D}`
const OUT = `out.sider${D}`

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}
function aliases(on: boolean) {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", true)],
        ["codex_projects", row("codex_projects", true)],
        ["codex_roster_aliases", row("codex_roster_aliases", on)],
      ])
  )
}

describe("C-258: access changes never strand an assignee (Postgres, 0118 applied)", { skip }, () => {
  let client: ReturnType<typeof postgres>
  let database: Db
  const sections = [
    { name: "To do", status_category: "todo" as const },
    { name: "Done", status_category: "done" as const },
  ]

  async function project(name: string, isPrivate: boolean, members: string[], owner: string | null = null): Promise<number> {
    const res = await createProject(
      OLIVE,
      { name, kind: "ops", client_id: 42, mba_number: null, owner_email: owner, is_private: isPrivate, start_on: null, due_on: null, members, sections },
      database
    )
    assert.ok(res.ok)
    return res.project.id
  }
  async function task(projectId: number | null, assignee: string | null, extra: { status?: string; parent?: number } = {}): Promise<number> {
    const [r] = await client`INSERT INTO public.tasks (title, status, project_id, client_id, created_by_email, assignee_email, parent_task_id)
      VALUES ('Secret task', ${extra.status ?? "todo"}, ${projectId}, 42, ${OLIVE}, ${assignee}, ${extra.parent ?? null}) RETURNING id`
    return Number(r.id)
  }
  async function members(projectId: number): Promise<string[]> {
    const rows = await client`SELECT email FROM public.codex_project_members WHERE project_id = ${projectId} ORDER BY email`
    return rows.map((r) => String(r.email))
  }
  async function projectRow(projectId: number): Promise<{ isPrivate: boolean; owner: string | null }> {
    const [r] = await client`SELECT is_private, owner_email FROM public.codex_projects WHERE id = ${projectId}`
    return { isPrivate: Boolean(r.is_private), owner: r.owner_email == null ? null : String(r.owner_email) }
  }

  before(async () => {
    client = await createDatabase(URL_!)
    await client.unsafe(`INSERT INTO public.team_members (email, name, email_aliases, active) VALUES
      ('${OLIVE}', 'Olive Owner', '[]', true),
      ('${MIA}', 'Mia Tran', '["${MIA_ALIAS}"]', true),
      ('${ELLIE}', 'Ellie Ward', '[]', true),
      ('${OUT}', 'Out Sider', '[]', true)`)
    await client.unsafe(fs.readFileSync(path.join(process.cwd(), "db/migrations/0118_codex_s1_projects.sql"), "utf8"))
    resetProjectsMarkerCacheForTests()
    database = drizzle(client, { schema }) as unknown as Db
    aliases(false)
  })

  afterEach(() => aliases(false))

  after(async () => {
    setFeatureRowReaderForTests(null)
    await client?.end({ timeout: 5 })
  })

  it("the refusal is a 409 and names the count", () => {
    assert.equal(PROJECT_FAILURE_STATUS.open_tasks_lose_access, 409)
    assert.equal(
      memberHasOpenTasksMessage(MIA, 1),
      `${MIA} still has 1 open task in this private project. Reassign or close them first, then remove them.`
    )
    assert.match(memberHasOpenTasksMessage(MIA, 3), /still has 3 open tasks in this private project/)
    assert.match(assigneesLoseAccessMessage(2, "private"), /^2 open tasks in this project .* then make the project private\.$/)
    assert.match(assigneesLoseAccessMessage(1, "owner"), /^1 open task in this project .* then change the owner\.$/)
  })

  it("removing a member who holds open tasks in a private project is refused; nothing changes", async () => {
    const proj = await project("Remove refused", true, [MIA, ELLIE])
    await task(proj, MIA)
    const parent = await task(proj, ELLIE)
    await task(proj, MIA, { parent }) // a subtask counts
    await task(proj, MIA, { status: "done" }) // done never counts
    const res = await removeProjectMember(proj, OLIVE, MIA, database)
    assert.deepEqual(res, { ok: false, reason: "open_tasks_lose_access", message: memberHasOpenTasksMessage(MIA, 2) })
    assert.deepEqual(await members(proj), [ELLIE, MIA].sort(), "still a member")
    const [act] = await client`SELECT count(*)::int AS n FROM public.codex_activity WHERE entity_id = ${proj} AND action = 'members_remove'`
    assert.equal(act.n, 0, "no activity written")
  })

  it("removing a member is fine once their tasks are done or reassigned, on a public project, and for the owner or creator", async () => {
    const proj = await project("Remove fine", true, [MIA, ELLIE, OLIVE])
    const t = await task(proj, MIA)
    await client`UPDATE public.tasks SET status = 'done' WHERE id = ${t}`
    assert.equal((await removeProjectMember(proj, OLIVE, MIA, database)).ok, true, "done tasks never block")
    await task(proj, ELLIE)
    await client`UPDATE public.tasks SET assignee_email = ${OLIVE} WHERE project_id = ${proj} AND assignee_email = ${ELLIE}`
    assert.equal((await removeProjectMember(proj, OLIVE, ELLIE, database)).ok, true, "reassigned")
    await task(proj, OLIVE)
    assert.equal((await removeProjectMember(proj, OLIVE, OLIVE, database)).ok, true, "the owner and creator keeps access")
    const open = await project("Public remove", false, [MIA])
    await task(open, MIA)
    assert.equal((await removeProjectMember(open, OLIVE, MIA, database)).ok, true, "a public project: everyone still sees it")
    assert.deepEqual(await members(open), [])
  })

  it("a deleted task never blocks a removal", async () => {
    const proj = await project("Deleted task", true, [MIA])
    const t = await task(proj, MIA)
    await client`UPDATE public.tasks SET deleted_at = now() WHERE id = ${t}`
    assert.equal((await removeProjectMember(proj, OLIVE, MIA, database)).ok, true)
  })

  it("tasks already stranded before the change never block it", async () => {
    const proj = await project("Legacy stranded", true, [MIA])
    await task(proj, OUT) // assigned before C-258 (or by a writer that skipped F5)
    assert.equal((await removeProjectMember(proj, OLIVE, MIA, database)).ok, true, "Mia holds nothing; Out's task was already stranded")
    const proj2 = await project("Legacy stranded 2", true, [MIA])
    await task(proj2, OUT)
    await task(proj2, MIA)
    const res = await removeProjectMember(proj2, OLIVE, MIA, database)
    assert.equal(res.ok, false)
    assert.equal(!res.ok && res.message, memberHasOpenTasksMessage(MIA, 1), "only the task the removal strands counts")
  })

  it("making a project private with open tasks assigned to non-members is refused; nothing changes", async () => {
    const proj = await project("Going private", false, [MIA])
    await task(proj, MIA)
    const parent = await task(proj, OUT)
    await task(proj, ELLIE, { parent }) // subtask of a non-member
    await task(proj, OUT, { status: "done" })
    await task(proj, null)
    const res = await updateProject(proj, OLIVE, { is_private: true }, database)
    assert.deepEqual(res, { ok: false, reason: "open_tasks_lose_access", message: assigneesLoseAccessMessage(2, "private") })
    assert.equal((await projectRow(proj)).isPrivate, false, "still public")
    const [act] = await client`SELECT count(*)::int AS n FROM public.codex_activity WHERE entity_type = 'codex_project' AND entity_id = ${proj} AND action = 'update'`
    assert.equal(act.n, 0)
    // Add them, then it goes through.
    assert.equal((await updateProject(proj, OLIVE, { name: "Renamed while public" }, database)).ok, true, "a rename is never checked")
    const { addProjectMembers } = await import("../projectsRepo.js")
    assert.equal((await addProjectMembers(proj, OLIVE, [OUT, ELLIE], database)).ok, true)
    const ok = await updateProject(proj, OLIVE, { is_private: true }, database)
    assert.equal(ok.ok, true)
    assert.equal((await projectRow(proj)).isPrivate, true)
  })

  it("a new owner of a private project is refused while the old owner (not creator or member) holds open tasks", async () => {
    // Created by Olive, owned by Mia; Mia is not a member.
    const proj = await project("Owner change", true, [ELLIE], MIA)
    await task(proj, MIA)
    const res = await updateProject(proj, OLIVE, { owner_email: ELLIE }, database)
    assert.deepEqual(res, { ok: false, reason: "open_tasks_lose_access", message: assigneesLoseAccessMessage(1, "owner") })
    assert.equal((await projectRow(proj)).owner, MIA, "owner unchanged")
    // On a public project an owner change costs no one access.
    const open = await project("Owner change public", false, [], MIA)
    await task(open, MIA)
    assert.equal((await updateProject(open, OLIVE, { owner_email: ELLIE }, database)).ok, true)
    // Going public never strands anyone.
    assert.equal((await updateProject(proj, OLIVE, { is_private: false, owner_email: ELLIE }, database)).ok, true)
  })

  it("aliases resolve as for any viewer: a task assigned to Mia's alias counts as Mia's with codex_roster_aliases on", async () => {
    const proj = await project("Alias holder", true, [MIA])
    await task(proj, MIA_ALIAS)
    aliases(false)
    assert.equal(
      (await removeProjectMember(proj, OLIVE, MIA, database)).ok,
      true,
      "off: the alias is its own address, which could not see the project before the removal either"
    )
    const proj2 = await project("Alias holder on", true, [MIA])
    await task(proj2, MIA_ALIAS)
    aliases(true)
    const res = await removeProjectMember(proj2, OLIVE, MIA_ALIAS, database)
    assert.deepEqual(res, { ok: false, reason: "open_tasks_lose_access", message: memberHasOpenTasksMessage(MIA, 1) })
    const proj3 = await project("Alias going private", false, [MIA])
    await task(proj3, MIA_ALIAS)
    assert.equal((await updateProject(proj3, OLIVE, { is_private: true }, database)).ok, true, "on: the alias is a member")
  })

  it("an assignment waits for a removal in flight and is refused once it commits (the plain path holds the project row)", async () => {
    const proj = await project("Race", true, [MIA])
    const t = await task(proj, OLIVE)
    const remover = postgres(URL_!, { max: 1, onnotice: () => {} })
    let assign: Promise<unknown> | null = null
    try {
      await remover.begin(async (tx) => {
        // The statements removeProjectMember runs: the project row lock, then the delete.
        await tx`SELECT id FROM public.codex_projects WHERE id = ${proj} FOR UPDATE`
        await tx`DELETE FROM public.codex_project_members WHERE project_id = ${proj} AND lower(email) = ${MIA}`
        assign = updateTask(t, { assigneeEmail: MIA }, OLIVE, database)
        assign.catch(() => {})
        for (let i = 0; i < 100; i++) {
          const [w] = await client`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`
          if (w.n > 0) return
          await new Promise((r) => setTimeout(r, 20))
        }
        throw new Error("the assignment never waited on the removal")
      })
    } finally {
      await remover.end({ timeout: 5 })
    }
    await assert.rejects(assign!, (err: unknown) => err instanceof AssigneeNoAccessError)
    const [r] = await client`SELECT assignee_email FROM public.tasks WHERE id = ${t}`
    assert.equal(r.assignee_email, OLIVE, "nothing changed")
  })

  it("a removal waits for an assignment in flight and is refused once it commits", async () => {
    const proj = await project("Race 2", true, [MIA])
    const t = await task(proj, OLIVE)
    const assigner = postgres(URL_!, { max: 1, onnotice: () => {} })
    let removal: Promise<Awaited<ReturnType<typeof removeProjectMember>>> | null = null
    try {
      await assigner.begin(async (tx) => {
        // The statements the plain assignment path runs: the project row FOR SHARE, then the write.
        await tx`SELECT id FROM public.codex_projects WHERE id = ${proj} FOR SHARE`
        await tx`UPDATE public.tasks SET assignee_email = ${MIA} WHERE id = ${t}`
        removal = removeProjectMember(proj, OLIVE, MIA, database)
        removal.catch(() => {})
        for (let i = 0; i < 100; i++) {
          const [w] = await client`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`
          if (w.n > 0) return
          await new Promise((r) => setTimeout(r, 20))
        }
        throw new Error("the removal never waited on the assignment")
      })
    } finally {
      await assigner.end({ timeout: 5 })
    }
    const res = await removal!
    assert.deepEqual(res, { ok: false, reason: "open_tasks_lose_access", message: memberHasOpenTasksMessage(MIA, 1) })
    assert.deepEqual(await members(proj), [MIA])
  })
})
