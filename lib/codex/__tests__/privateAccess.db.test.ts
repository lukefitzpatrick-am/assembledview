/**
 * B42fix: private project access, against a real Postgres with 0118 applied.
 *
 * - F4: the viewer and every stored owner, creator and member address
 *   compare as their roster primary email when `codex_roster_aliases` is on
 *   (an ambiguous or inactive alias grants nothing); member writes store the
 *   primary; off, addresses compare as stored.
 * - F5: a task in a private project is never assigned to someone who cannot
 *   see the project (PATCH paths, bulk, subtasks, a task joining a project).
 * - F1: Ask for help on a private project's task: the helper must see the
 *   project, and the help task lives in the parent's project, so its title
 *   and ask stay private on every surface (list, search, counts, MBA counts,
 *   workload, Team tab, bell). A help task follows its parent into a project.
 * - F2: the Inbox accept answer never flags a duplicate against a task the
 *   person accepting cannot see.
 * - R8: a hidden help child is not listed under its visible parent.
 *
 * Skips unless CODEX_PROJECTS_TEST_DATABASE_URL names a LOCAL database whose
 * name ends in `_codex_test`. It works in a sibling database
 * `<name>_access_codex_test` (created if missing) and drops and rebuilds that
 * database's public schema. It never reads .env.local.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { after, afterEach, before, describe, it } from "node:test"

import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { sql } from "drizzle-orm"

import * as schema from "@/db/schema"
import type { Db } from "@/db"
import { createDatabase, RAW_URL, siblingUrl } from "./codexTestDb.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"
import {
  bulkUpdateTasks,
  countTasksByMba,
  countTasksByStatus,
  getTask,
  listTasks,
  requestHelp,
  updateTask,
} from "../repo.js"
import {
  addProjectMembers,
  bulkUpdateTasksThroughSections,
  createProject,
  getProject,
  listProjects,
  moveTaskToSection,
  removeProjectMember,
  resetProjectsMarkerCacheForTests,
  updateTaskThroughSections,
} from "../projectsRepo.js"
import { createSubtask } from "../taskDetailRepo.js"
import { buildAccessIdentity, canSeeProject } from "../projects.js"
import { hiddenTaskIds, loadAccessIdentity, taskVisibleSql } from "../taskVisibility.js"
import { loadRosterPeople } from "../rosterRead.js"
import { searchCodex } from "../searchRepo.js"
import { listBell, loadDigestBatch } from "../notificationsRepo.js"
import { loadWorkload } from "../workloadRepo.js"
import { getTeamWeekTimeSummary } from "../../myhours/timeSummary.js"
import { acceptProposal } from "../../fireflies/proposalRepo.js"

const URL_ = siblingUrl(RAW_URL, "access")
const skip = URL_ ? false : "set CODEX_PROJECTS_TEST_DATABASE_URL to a local database named *_codex_test"

const D = "@assembledmedia.com.au"
const OLIVE = `olive.owner${D}`
const MIA = `mia.tran${D}`
const MIA_ALIAS = `mia${D}`
const ELLIE = `ellie.ward${D}`
const ELLIE_ALIAS = `ellie${D}`
const JOSH = `josh.patel${D}`
const JOSH_ALIAS = `josh${D}`
const OUT = `out.sider${D}`
const SHARED = `team${D}`
const GONE = `gone.person${D}`
const GONE_ALIAS = `gone${D}`
const MBA = "zz777"
const NOW = new Date("2026-11-13T01:00:00Z")

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}
function aliases(on: boolean) {
  setFeatureRowReaderForTests(
    async () => new Map([["codex_v2", row("codex_v2", true)], ["codex_projects", row("codex_projects", true)], ["codex_roster_aliases", row("codex_roster_aliases", on)]])
  )
}

describe("private project access (Postgres, 0118 applied)", { skip }, () => {
  let client: ReturnType<typeof postgres>
  let database: Db
  let priv = 0
  let legacy = 0
  let pub = 0
  const sec: Record<string, number> = {}

  async function task(title: string, project: number | null, extra: { assignee?: string | null; section?: number; parent?: number } = {}) {
    const [r] = await client`INSERT INTO public.tasks
      (title, status, project_id, section_id, client_id, mba_number, created_by_email, assignee_email, due_date, estimated_minutes, parent_task_id)
      VALUES (${title}, 'todo', ${project}, ${extra.section ?? null}, 42, ${MBA}, ${OLIVE}, ${extra.assignee === undefined ? OLIVE : extra.assignee},
              '2026-11-01T00:00:00Z', 30, ${extra.parent ?? null})
      RETURNING id`
    return Number(r.id)
  }
  const listIds = async (viewer: string) =>
    (await listTasks({ viewerEmail: viewer, perPage: 200 }, database)).items.map((t) => Number(t.id))
  const projectOf = async (id: number) => {
    const [r] = await client`SELECT project_id, section_id FROM public.tasks WHERE id = ${id}`
    return { project: r.project_id == null ? null : Number(r.project_id), section: r.section_id == null ? null : Number(r.section_id) }
  }

  before(async () => {
    client = await createDatabase(URL_!)
    await client.unsafe(`INSERT INTO public.team_members (email, name, email_aliases, active) VALUES
      ('${OLIVE}', 'Olive Owner', '[]', true),
      ('${MIA}', 'Mia Tran', '["${MIA_ALIAS}", "${SHARED}"]', true),
      ('${ELLIE}', 'Ellie Ward', '["${ELLIE_ALIAS}"]', true),
      ('${JOSH}', 'Josh Patel', '["${JOSH_ALIAS}", "${SHARED}"]', true),
      ('${OUT}', 'Out Sider', '[]', true),
      ('${GONE}', 'Gone Person', '["${GONE_ALIAS}"]', false)`)
    await client.unsafe(fs.readFileSync(path.join(process.cwd(), "db/migrations/0118_codex_s1_projects.sql"), "utf8"))
    resetProjectsMarkerCacheForTests()
    database = drizzle(client, { schema }) as unknown as Db
    aliases(false)
    const sections = [
      { name: "To do", status_category: "todo" as const },
      { name: "Done", status_category: "done" as const },
    ]
    const a = await createProject(
      OLIVE,
      { name: "Secret", kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: true, start_on: null, due_on: null, members: [MIA, ELLIE], sections },
      database
    )
    const b = await createProject(
      OLIVE,
      { name: "Legacy", kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: true, start_on: null, due_on: null, members: [], sections },
      database
    )
    const c = await createProject(
      OLIVE,
      { name: "Open", kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: false, start_on: null, due_on: null, members: [], sections },
      database
    )
    assert.ok(a.ok && b.ok && c.ok)
    priv = a.project.id
    legacy = b.project.id
    pub = c.project.id
    for (const s of a.sections) sec[`priv:${s.name}`] = s.id
    for (const s of c.sections) sec[`pub:${s.name}`] = s.id
    // Member rows stored by an alias (written before F4, or with the switch off).
    await client`INSERT INTO public.codex_project_members (project_id, email) VALUES
      (${legacy}, ${JOSH_ALIAS}), (${legacy}, ${SHARED}), (${legacy}, ${GONE_ALIAS})`
  })

  afterEach(() => aliases(false))

  after(async () => {
    setFeatureRowReaderForTests(null)
    await client?.end({ timeout: 5 })
  })

  // -------------------------------------------------------------------------
  // F4
  // -------------------------------------------------------------------------

  it("F4: an alias login sees a private project's task only with codex_roster_aliases on", async () => {
    const id = await task("alias login", priv, { section: sec["priv:To do"] })
    assert.ok(!(await listIds(MIA_ALIAS)).includes(id), "off: the alias is its own address")
    assert.deepEqual([...(await hiddenTaskIds(database, [id], MIA_ALIAS))], [id])
    assert.equal((await getProject(priv, MIA_ALIAS, database)).ok, false)
    aliases(true)
    assert.ok((await listIds(MIA_ALIAS)).includes(id), "on: the alias is Mia")
    assert.deepEqual([...(await hiddenTaskIds(database, [id], MIA_ALIAS))], [])
    assert.equal((await getProject(priv, MIA_ALIAS, database)).ok, true)
    assert.ok((await listProjects(MIA_ALIAS, {}, database)).some((p) => p.id === priv))
    assert.ok(!(await listIds(OUT)).includes(id), "an outsider still sees nothing")
  })

  it("F4: a member stored by an alias keeps access for their primary login; a shared or inactive alias grants nothing", async () => {
    const id = await task("legacy member", legacy)
    aliases(true)
    assert.ok((await listIds(JOSH)).includes(id), "Josh's alias row is Josh")
    assert.ok(!(await listIds(MIA)).includes(id), "team@ is held by two people: it is no one")
    assert.ok(!(await listIds(GONE)).includes(id), "an inactive member's alias resolves to no one")
    assert.ok(!(await listIds(OUT)).includes(id))
    aliases(false)
    assert.ok(!(await listIds(JOSH)).includes(id), "off: compared as stored")
    assert.ok((await listIds(JOSH_ALIAS)).includes(id), "off: the stored alias itself still matches")
  })

  it("F4: the SQL rule and canSeeProject agree, aliases on and off", async () => {
    const projects = await client`SELECT id, is_private, owner_email, created_by_email FROM public.codex_projects`
    const members = await client`SELECT project_id, email FROM public.codex_project_members`
    const roster = await loadRosterPeople(database)
    for (const on of [false, true]) {
      const identity = buildAccessIdentity(roster, on)
      assert.deepEqual(identity, await loadAccessIdentity(database, on))
      for (const viewer of [OLIVE, MIA, MIA_ALIAS, JOSH, JOSH_ALIAS, SHARED, GONE, GONE_ALIAS, OUT, ""]) {
        for (const p of projects) {
          const facts = {
            is_private: Boolean(p.is_private),
            owner_email: p.owner_email as string | null,
            created_by_email: p.created_by_email as string | null,
            members: members.filter((m) => Number(m.project_id) === Number(p.id)).map((m) => String(m.email)),
          }
          const res = await database.execute(sql`SELECT ${taskVisibleSql(sql`${Number(p.id)}::bigint`, viewer, identity)} AS ok`)
          const ok = (res as unknown as Array<{ ok: boolean }>)[0].ok
          assert.equal(ok, canSeeProject(facts, viewer, identity), `aliases ${on}, project ${p.id}, viewer "${viewer}"`)
        }
      }
    }
  })

  it("F4: the bell and the digest count a member stored by an alias", async () => {
    const id = await task("legacy bell", legacy)
    await client`INSERT INTO public.codex_notifications (recipient_email, kind, task_id, actor_email) VALUES (${JOSH}, 'assigned', ${id}, ${OLIVE})`
    try {
      assert.equal((await listBell(JOSH, 30, database)).items.length, 0, "off: Josh's primary is not the stored alias")
      aliases(true)
      assert.equal((await listBell(JOSH, 30, database)).items.length, 1)
      const { digests } = await loadDigestBatch(NOW, database)
      assert.ok(digests.some((d) => d.email === JOSH), "the digest uses the same rule")
    } finally {
      await client`DELETE FROM public.codex_notifications`
    }
  })

  it("F4: member writes store the primary email; an alias of a member adds no one; removing by an alias removes them", async () => {
    aliases(true)
    const added = await addProjectMembers(legacy, OLIVE, [ELLIE_ALIAS], database)
    assert.ok(added.ok)
    assert.ok(added.project.members.includes(ELLIE) && !added.project.members.includes(ELLIE_ALIAS))
    const again = await addProjectMembers(legacy, OLIVE, [JOSH], database)
    assert.ok(again.ok)
    const rows = await client`SELECT email FROM public.codex_project_members WHERE project_id = ${legacy} ORDER BY email`
    assert.ok(!rows.some((r) => r.email === JOSH), "Josh is already a member by his alias row")
    const removed = await removeProjectMember(legacy, OLIVE, ELLIE_ALIAS, database)
    assert.ok(removed.ok)
    assert.equal((await client`SELECT count(*)::int AS n FROM public.codex_project_members WHERE project_id = ${legacy} AND email = ${ELLIE}`)[0].n, 0)
    // An owner signed in by an alias manages the project.
    await client`UPDATE public.codex_projects SET owner_email = ${MIA} WHERE id = ${legacy}`
    try {
      assert.ok((await addProjectMembers(legacy, MIA_ALIAS, [OUT], database)).ok)
      await removeProjectMember(legacy, MIA_ALIAS, OUT, database)
    } finally {
      await client`UPDATE public.codex_projects SET owner_email = ${OLIVE} WHERE id = ${legacy}`
    }
  })

  it("F5: PATCH refuses an assignee outside the private project, nothing changed; members and public projects are fine", async () => {
    const id = await task("assign", priv, { section: sec["priv:To do"], assignee: null })
    await assert.rejects(updateTask(id, { assigneeEmail: OUT, title: "changed" }, OLIVE, database), (e: Error) => e.name === "AssigneeNoAccessError" && /not a member of this private project/.test(e.message))
    const [r] = await client`SELECT assignee_email, title FROM public.tasks WHERE id = ${id}`
    assert.deepEqual({ a: r.assignee_email, t: r.title }, { a: null, t: "assign" })
    assert.ok(await updateTask(id, { assigneeEmail: MIA }, OLIVE, database))
    assert.ok(await updateTask(id, { assigneeEmail: OLIVE }, OLIVE, database), "the creator")
    await assert.rejects(updateTaskThroughSections(id, { status: "done", assigneeEmail: OUT }, OLIVE, database), (e: Error) => e.name === "AssigneeNoAccessError")
    assert.equal((await client`SELECT status FROM public.tasks WHERE id = ${id}`)[0].status, "todo", "the section path rolled back too")
    const open = await task("open", pub, { section: sec["pub:To do"], assignee: null })
    assert.ok(await updateTask(open, { assigneeEmail: OUT }, OLIVE, database), "a public project: anyone")
    // An alias of a member counts as the member (aliases on).
    aliases(true)
    assert.ok(await updateTask(id, { assigneeEmail: MIA_ALIAS }, OLIVE, database))
  })

  it("F5: an unchanged assignee who lost access is not refused on another edit", async () => {
    const id = await task("legacy assignee", priv, { section: sec["priv:To do"], assignee: OUT })
    assert.ok(await updateTask(id, { assigneeEmail: OUT, title: "renamed" }, OLIVE, database))
    assert.ok(await updateTask(id, { title: "renamed again" }, OLIVE, database))
  })

  it("F5: bulk refuses the whole batch (409 naming the task), both paths", async () => {
    const a = await task("bulk open", pub, { section: sec["pub:To do"], assignee: null })
    const b = await task("bulk secret", priv, { section: sec["priv:To do"], assignee: null })
    await assert.rejects(bulkUpdateTasks([a, b], { assigneeEmail: OUT }, OLIVE, database), (e: Error & { statusCode?: number; taskId?: number }) => e.name === "CodexBulkError" && e.statusCode === 409 && e.taskId === b)
    await assert.rejects(
      bulkUpdateTasksThroughSections([a, b], { status: "done", assigneeEmail: OUT }, OLIVE, database),
      (e: Error & { statusCode?: number; taskId?: number }) => e.name === "CodexBulkError" && e.statusCode === 409 && e.taskId === b
    )
    const rows = await client`SELECT assignee_email, status FROM public.tasks WHERE id IN (${a}, ${b})`
    assert.ok(rows.every((r) => r.assignee_email == null && r.status === "todo"), "rolled back whole")
  })

  it("F5: a subtask of a private project's task goes only to someone who can see it", async () => {
    const parent = await task("subtask parent", priv, { section: sec["priv:To do"] })
    const refused = await createSubtask(parent, OLIVE, { title: "sub", assignee_email: OUT, start_on: null, due_on: null }, database)
    assert.equal(refused.ok ? "ok" : refused.reason, "assignee_no_access")
    assert.ok((await createSubtask(parent, OLIVE, { title: "sub", assignee_email: ELLIE, start_on: null, due_on: null }, database)).ok)
    assert.ok((await createSubtask(parent, OLIVE, { title: "sub", assignee_email: null, start_on: null, due_on: null }, database)).ok)
  })

  it("F5: a task (or its help task) assigned outside a private project cannot join it; a public project takes it", async () => {
    const mine = await task("join outsider", null, { assignee: OUT })
    const moved = await moveTaskToSection(priv, sec["priv:To do"], OLIVE, { task_id: mine, sort_order: null }, database)
    assert.equal(moved.ok ? "ok" : moved.reason, "assignee_no_access")
    assert.deepEqual(await projectOf(mine), { project: null, section: null })
    const parent = await task("join with helper", null, { assignee: MIA })
    await task("Help: join with helper", null, { parent, assignee: OUT })
    const again = await moveTaskToSection(priv, sec["priv:To do"], OLIVE, { task_id: parent, sort_order: null }, database)
    assert.equal(again.ok ? "ok" : again.reason, "assignee_no_access")
    assert.ok((await moveTaskToSection(pub, sec["pub:To do"], OLIVE, { task_id: mine, sort_order: null }, database)).ok)
  })

  it("F1: Ask for help to someone outside the private project is refused (409), nothing written", async () => {
    const parent = await task("Secret launch plan", priv, { section: sec["priv:To do"] })
    const before = (await client`SELECT count(*)::int AS n FROM public.tasks`)[0].n
    await assert.rejects(
      requestHelp(parent, { assigneeEmail: OUT, ask: "zebra ask" }, { email: OLIVE }, database),
      (e: Error & { status?: number }) => e.name === "CodexHelpError" && e.status === 409 && /Out Sider is not a member of this private project/.test(e.message)
    )
    assert.equal((await client`SELECT count(*)::int AS n FROM public.tasks`)[0].n, before)
    assert.equal((await client`SELECT status FROM public.tasks WHERE id = ${parent}`)[0].status, "todo")
  })

  it("F1: the help task lives in the private project: hidden from outsiders on every surface, seen by the helper", async () => {
    const parent = await task("Quokka merger", priv, { section: sec["priv:To do"] })
    const ellieLoad = async (viewer: string) => (await loadWorkload(viewer, 3, NOW, database)).people.find((p) => p.email === ELLIE)?.open ?? 0
    const ellieTeam = async (viewer: string) => (await getTeamWeekTimeSummary(database, NOW, viewer)).members.find((m) => m.email === ELLIE)?.open ?? 0
    const loadGap = (await ellieLoad(ELLIE)) - (await ellieLoad(OUT))
    const teamGap = (await ellieTeam(ELLIE)) - (await ellieTeam(OUT))
    const { child } = await requestHelp(parent, { assigneeEmail: ELLIE, ask: "quokka numbers please" }, { email: OLIVE }, database)
    const childId = Number(child.id)
    assert.deepEqual(await projectOf(childId), { project: priv, section: null }, "the parent's project; backlog has no section")
    await client`INSERT INTO public.codex_notifications (recipient_email, kind, task_id, actor_email) VALUES (${OUT}, 'assigned', ${childId}, ${OLIVE}), (${ELLIE}, 'assigned', ${childId}, ${OLIVE})`
    try {
      // list
      assert.ok(!(await listIds(OUT)).includes(childId))
      assert.ok((await listIds(ELLIE)).includes(childId))
      // search: the title and the ask (a comment)
      assert.deepEqual((await searchCodex("quokka", 10, database, OUT)).tasks.items, [])
      assert.ok((await searchCodex("quokka numbers", 10, database, ELLIE)).tasks.items.some((t) => t.id === childId))
      // counts and MBA counts (open tasks on the MBA, Ellie's view minus the outsider's)
      const total = (c: Record<string, number | undefined>) => Object.values(c).reduce<number>((n, v) => n + (Number(v) || 0), 0)
      const outTodo = total(await countTasksByStatus({ viewerEmail: OUT }, database))
      const ellieTodo = total(await countTasksByStatus({ viewerEmail: ELLIE }, database))
      assert.equal((await countTasksByStatus({ viewerEmail: ELLIE }, database)).backlog! - ((await countTasksByStatus({ viewerEmail: OUT }, database)).backlog ?? 0), 1, "the help task (backlog)")
      const outIds = new Set(await listIds(OUT))
      const visibleToEllieOnly = (await listIds(ELLIE)).filter((x) => !outIds.has(x)).length
      assert.equal(ellieTodo - outTodo, visibleToEllieOnly)
      const [mbaOut] = await countTasksByMba([MBA], database, NOW, OUT)
      const [mbaEllie] = await countTasksByMba([MBA], database, NOW, ELLIE)
      assert.equal(mbaEllie.open - mbaOut.open, visibleToEllieOnly)
      // workload and Team tab: Ellie's help task counts only for people who can see it
      assert.equal((await ellieLoad(ELLIE)) - (await ellieLoad(OUT)), loadGap + 1)
      assert.equal((await ellieTeam(ELLIE)) - (await ellieTeam(OUT)), teamGap + 1)
      // bell
      assert.equal((await listBell(OUT, 30, database)).items.length, 0)
      assert.equal((await listBell(ELLIE, 30, database)).items.length, 1)
      // single-task routes and bulk
      assert.deepEqual([...(await hiddenTaskIds(database, [childId], OUT))], [childId])
      assert.deepEqual([...(await hiddenTaskIds(database, [childId], ELLIE))], [])
    } finally {
      await client`DELETE FROM public.codex_notifications`
    }
  })

  it("F1: a help task follows its parent into a private project", async () => {
    const parent = await task("Loose plan", null, { assignee: MIA })
    const { child } = await requestHelp(parent, { assigneeEmail: ELLIE, ask: "help" }, { email: MIA }, database)
    const childId = Number(child.id)
    assert.deepEqual(await projectOf(childId), { project: null, section: null }, "no project: as before")
    assert.ok((await moveTaskToSection(priv, sec["priv:To do"], OLIVE, { task_id: parent, sort_order: null }, database)).ok)
    assert.deepEqual(await projectOf(childId), { project: priv, section: null }, "backlog: no section")
    assert.ok(!(await listIds(OUT)).includes(childId))
    // A help task already started follows into the section its status names.
    const p2 = await task("Loose plan two", null, { assignee: MIA })
    const second = Number((await requestHelp(p2, { assigneeEmail: ELLIE, ask: "help" }, { email: MIA }, database)).child.id)
    await client`UPDATE public.tasks SET status = 'todo' WHERE id = ${second}`
    assert.ok((await moveTaskToSection(priv, sec["priv:To do"], OLIVE, { task_id: p2, sort_order: null }, database)).ok)
    assert.deepEqual(await projectOf(second), { project: priv, section: sec["priv:To do"] })
  })

  it("R8: a help task in a private project is not listed under a parent the viewer can see", async () => {
    const parent = await task("Public parent", null)
    const helpId = await task("Help: Public parent", priv, { parent, assignee: MIA, section: sec["priv:To do"] })
    assert.deepEqual((await getTask(parent, database, OUT))?.children?.map((c) => c.id), [])
    assert.deepEqual((await getTask(parent, database, MIA))?.children?.map((c) => c.id), [helpId])
  })

  it("F2: accepting a meeting action never flags a duplicate against a task the person cannot see", async () => {
    await task("Wombat audit", priv, { section: sec["priv:To do"] })
    const propose = async () =>
      Number((await client`INSERT INTO public.ava_task_proposals (proposed_title, proposed_mba_number, client_id) VALUES ('Wombat audit', ${MBA}, 42) RETURNING id`)[0].id)
    const out = await acceptProposal(await propose(), OUT, null, database)
    assert.ok(out.ok)
    assert.equal(out.possibleDuplicate, false)
    const mia = await acceptProposal(await propose(), MIA, null, database)
    assert.ok(mia.ok)
    assert.equal(mia.possibleDuplicate, true)
  })
})
