/**
 * The progress field rule (B42, plan 4.2, the SEO rule) on Postgres with
 * 0118 applied: link a single-select field with a done option; completing a
 * task from every path sets the field to the done option; setting the done
 * option completes the task (first done section). Nothing with
 * codex_progress_field off, a removed done option never counts, and the link
 * refuses a multi-select, a field without a done option or another
 * project's field.
 *
 * Skips unless CODEX_PROJECTS_TEST_DATABASE_URL names a LOCAL database whose
 * name ends in `_codex_test` (sibling `<name>_progress_codex_test`).
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { after, before, beforeEach, describe, it } from "node:test"

import type postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"

import * as schema from "@/db/schema"
import type { Db } from "@/db"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"
import { createDatabase, RAW_URL, siblingUrl } from "./codexTestDb.js"
import { requestHelp, updateTask, updateTaskFollowingSections } from "../repo.js"
import { SYSTEM_ACTORS } from "../systemActors.js"
import {
  bulkUpdateTasksThroughSections,
  completeProjectTask,
  createProject,
  createTasksInSection,
  moveTaskToSection,
  resetProjectsMarkerCacheForTests,
  updateTaskThroughSections,
} from "../projectsRepo.js"
import { createCustomField, listProjectFields, setProgressField, updateCustomField } from "../customFieldsRepo.js"

const URL_ = siblingUrl(RAW_URL, "progress")
const skip = URL_ ? false : "set CODEX_PROJECTS_TEST_DATABASE_URL to a local database named *_codex_test"

const OWNER = "olive.owner@assembledmedia.com.au"
const HELPER = "mia.tran@assembledmedia.com.au"

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}
function switches(progress: boolean) {
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        ["codex_v2", row("codex_v2", true)],
        ["codex_projects", row("codex_projects", true)],
        ["codex_progress_field", row("codex_progress_field", progress)],
      ])
  )
}

describe("the progress field rule (Postgres, 0118 applied)", { skip }, () => {
  let client: ReturnType<typeof postgres>
  let database: Db
  let projectId = 0
  let otherProject = 0
  const sec: Record<string, number> = {}
  let progress = 0
  let tags = 0
  let noDone = 0
  let foreign = 0
  const DONE = "o3"
  const STARTED = "o2"

  async function task(title: string, section = "Inbound", status = "todo") {
    const [r] = await client`INSERT INTO public.tasks (title, status, client_id, project_id, section_id, sort_order, created_by_email, assignee_email)
      VALUES (${title}, ${status}, 42, ${projectId}, ${sec[section]}, 0, ${OWNER}, ${OWNER}) RETURNING id`
    return Number(r.id)
  }
  async function state(id: number) {
    const [r] = await client`SELECT status, section_id::int AS section_id, custom_values FROM public.tasks WHERE id = ${id}`
    return { status: String(r.status), section: Number(r.section_id), value: (r.custom_values as Record<string, unknown>)[String(progress)] ?? null }
  }

  before(async () => {
    client = await createDatabase(URL_!)
    await client.unsafe(`INSERT INTO public.team_members (email, name) VALUES ('${OWNER}', 'Olive Owner'), ('${HELPER}', 'Mia Tran')`)
    await client.unsafe(fs.readFileSync(path.join(process.cwd(), "db/migrations/0118_codex_s1_projects.sql"), "utf8"))
    resetProjectsMarkerCacheForTests()
    database = drizzle(client, { schema }) as unknown as Db
    const p = await createProject(
      OWNER,
      {
        name: "SEO Management", kind: "retainer", client_id: 42, mba_number: null, owner_email: null, is_private: false, start_on: null, due_on: null, members: [],
        sections: [
          { name: "Inbound", status_category: "todo" },
          { name: "This week", status_category: "in_progress" },
          { name: "Support needed", status_category: "waiting" },
          { name: "Published", status_category: "done" },
          { name: "Archive", status_category: "done" },
        ],
      },
      database
    )
    assert.ok(p.ok)
    projectId = p.project.id
    for (const s of p.sections) sec[s.name] = s.id
    const o = await createProject(OWNER, { name: "Other", kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: false, start_on: null, due_on: null, members: [], sections: [] }, database)
    assert.ok(o.ok)
    otherProject = o.project.id
    const opts = (labels: string[]) => labels.map((label, i) => ({ id: `o${i + 1}`, label }))
    const f1 = await createCustomField(projectId, OWNER, { name: "Task Progress", field_type: "single_select", options: opts(["Not started", "In progress", "Done"]), done_option: DONE }, database)
    const f2 = await createCustomField(projectId, OWNER, { name: "Tags", field_type: "multi_select", options: opts(["SEO", "Tech"]), done_option: null }, database)
    const f3 = await createCustomField(projectId, OWNER, { name: "Stage", field_type: "single_select", options: opts(["A", "B"]), done_option: null }, database)
    const f4 = await createCustomField(otherProject, OWNER, { name: "Theirs", field_type: "single_select", options: opts(["X"]), done_option: "o1" }, database)
    assert.ok(f1.ok && f2.ok && f3.ok && f4.ok)
    progress = f1.field.id
    tags = f2.field.id
    noDone = f3.field.id
    foreign = f4.field.id
  })

  beforeEach(() => switches(true))

  after(async () => {
    setFeatureRowReaderForTests(null)
    await client?.end({ timeout: 5 })
  })

  it("link: refused for a multi-select, a field without a done option and another project's field; linked and listed", async () => {
    const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? "ok" : r.reason)
    assert.equal(reason(await setProgressField(projectId, OWNER, tags, database)), "progress_field_invalid")
    assert.equal(reason(await setProgressField(projectId, OWNER, noDone, database)), "progress_field_invalid")
    assert.equal(reason(await setProgressField(projectId, OWNER, foreign, database)), "progress_field_invalid")
    assert.deepEqual(await setProgressField(projectId, OWNER, progress, database), { ok: true, progress_field_id: progress })
    const listed = await listProjectFields(projectId, OWNER, database)
    assert.ok(listed.ok && listed.progress_field_id === progress)
    const [act] = await client`SELECT after FROM public.codex_activity WHERE entity_type = 'codex_project' AND action = 'progress_field' ORDER BY id DESC LIMIT 1`
    assert.deepEqual(act.after, { progress_field_id: progress })
  })

  it("completing sets the done option: PATCH, bulk, board move, Mark complete, paste into done, the auto-close", async () => {
    const a = await task("PATCH")
    assert.ok((await updateTaskThroughSections(a, { status: "done" }, OWNER, database)).ok)
    assert.deepEqual(await state(a), { status: "done", section: sec["Published"], value: DONE })
    const b = await task("bulk")
    await bulkUpdateTasksThroughSections([b], { status: "done" }, OWNER, database)
    assert.equal((await state(b)).value, DONE)
    const c = await task("drag")
    assert.ok((await moveTaskToSection(projectId, sec["Archive"], OWNER, { task_id: c, sort_order: null }, database)).ok)
    assert.deepEqual(await state(c), { status: "done", section: sec["Archive"], value: DONE })
    const d = await task("tick")
    assert.ok((await completeProjectTask(projectId, d, OWNER, database)).ok)
    assert.equal((await state(d)).value, DONE)
    const pasted = await createTasksInSection(projectId, sec["Published"], OWNER, ["pasted done"], database)
    assert.ok(pasted.ok)
    assert.equal((await state(Number(pasted.tasks[0].id))).value, DONE)
    const e = await task("auto-close")
    await updateTaskFollowingSections(e, { status: "done" }, SYSTEM_ACTORS.relabel, database)
    assert.equal((await state(e)).value, DONE)
    const eActs = await client`SELECT DISTINCT actor_email, actor_kind FROM public.codex_activity WHERE entity_type = 'task' AND entity_id = ${e}`
    assert.deepEqual(eActs.map((r) => [r.actor_email, r.actor_kind]), [["system:relabel", "system"]], "C-264: update, move and progress rows name the auto-close")
    const [act] = await client`SELECT action, after FROM public.codex_activity WHERE entity_type = 'task' AND entity_id = ${a} AND action = 'update' ORDER BY id DESC LIMIT 1`
    assert.deepEqual(act.after, { custom_values: { [String(progress)]: DONE } })
  })

  it("setting the done option completes the task into the first done section; another option does not", async () => {
    const id = await task("value", "This week", "in_progress")
    assert.ok((await updateTaskThroughSections(id, {}, OWNER, database, { custom_values: { [String(progress)]: STARTED } })).ok)
    assert.deepEqual(await state(id), { status: "in_progress", section: sec["This week"], value: STARTED })
    assert.ok((await updateTaskThroughSections(id, {}, OWNER, database, { custom_values: { [String(progress)]: DONE } })).ok)
    assert.deepEqual(await state(id), { status: "done", section: sec["Published"], value: DONE })
    const [{ completed_at }] = await client`SELECT completed_at FROM public.tasks WHERE id = ${id}`
    assert.ok(completed_at)
    // reopening keeps the value (one fixed behaviour: only the two directions)
    assert.ok((await updateTaskThroughSections(id, { status: "todo" }, OWNER, database)).ok)
    assert.deepEqual(await state(id), { status: "todo", section: sec["Inbound"], value: DONE })
  })

  it("F7: a status and the progress field in one PATCH must agree, else 409 progress_conflict and nothing changed", async () => {
    const id = await task("conflict", "This week", "in_progress")
    const open = await updateTaskThroughSections(id, { status: "todo" }, OWNER, database, { custom_values: { [String(progress)]: DONE } })
    assert.equal(open.ok ? "ok" : open.reason, "progress_conflict")
    assert.deepEqual(await state(id), { status: "in_progress", section: sec["This week"], value: null })
    const done = await updateTaskThroughSections(id, { status: "done" }, OWNER, database, { custom_values: { [String(progress)]: STARTED } })
    assert.equal(done.ok ? "ok" : done.reason, "progress_conflict")
    assert.deepEqual(await state(id), { status: "in_progress", section: sec["This week"], value: null })
    // Agreeing: done with the done option, an open status with another option.
    assert.ok((await updateTaskThroughSections(id, { status: "todo" }, OWNER, database, { custom_values: { [String(progress)]: STARTED } })).ok)
    assert.deepEqual(await state(id), { status: "todo", section: sec["Inbound"], value: STARTED })
    assert.ok((await updateTaskThroughSections(id, { status: "done" }, OWNER, database, { custom_values: { [String(progress)]: DONE } })).ok)
    assert.deepEqual(await state(id), { status: "done", section: sec["Published"], value: DONE })
  })

  it("F7: a done value already stored never completes a reopened task again when another field changes", async () => {
    const id = await task("reopened", "Inbound", "todo")
    await client`UPDATE public.tasks SET custom_values = ${JSON.stringify({ [String(progress)]: DONE })}::jsonb WHERE id = ${id}`
    assert.ok((await updateTaskThroughSections(id, {}, OWNER, database, { custom_values: { [String(noDone)]: "o1" } })).ok)
    assert.deepEqual(await state(id), { status: "todo", section: sec["Inbound"], value: DONE })
  })

  it("a help child finishing restores the parent; a parent restored to done is not a case (prior status is open)", async () => {
    const id = await task("help", "This week", "in_progress")
    const { child } = await requestHelp(id, { assigneeEmail: HELPER, ask: "Check" }, { email: OWNER }, database)
    await updateTask(Number(child.id), { status: "done" }, HELPER, database)
    assert.deepEqual(await state(id), { status: "in_progress", section: sec["This week"], value: null })
  })

  it("switch off: the link does nothing either way", async () => {
    switches(false)
    const a = await task("off done")
    await updateTaskThroughSections(a, { status: "done" }, OWNER, database)
    assert.equal((await state(a)).value, null)
    const b = await task("off value")
    await updateTaskThroughSections(b, {}, OWNER, database, { custom_values: { [String(progress)]: DONE } })
    assert.equal((await state(b)).status, "todo")
  })

  it("a removed done option never counts: the rule goes quiet until a new done option is picked", async () => {
    const live = await listProjectFields(projectId, OWNER, database)
    assert.ok(live.ok)
    const field = live.fields.find((f) => f.id === progress)!
    // Drop "Done" (no live task may use it: clear the values first).
    await client`UPDATE public.tasks SET custom_values = '{}'::jsonb WHERE project_id = ${projectId}`
    const r = await updateCustomField(projectId, progress, OWNER, { options: field.options.filter((o) => o.id !== DONE), done_option: null }, database)
    assert.ok(r.ok, JSON.stringify(r))
    const [raw] = await client`SELECT options, done_option FROM public.codex_custom_fields WHERE id = ${progress}`
    assert.ok((raw.options as Array<{ id: string; removed?: boolean }>).some((o) => o.id === DONE && o.removed), "kept as removed")
    // Even if a stale done_option pointed at the removed id, it would not count.
    await client`UPDATE public.codex_custom_fields SET done_option = ${DONE} WHERE id = ${progress}`
    const a = await task("after removal")
    await updateTaskThroughSections(a, { status: "done" }, OWNER, database)
    assert.equal((await state(a)).value, null)
  })

  it("C-263 (B43): linking sets the done option on tasks already done, in the link's transaction; open, deleted and other projects' tasks are left", async () => {
    const p = await createProject(
      OWNER,
      {
        name: "Linked late", kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: false, start_on: null, due_on: null, members: [],
        sections: [
          { name: "To do", status_category: "todo" },
          { name: "Done", status_category: "done" },
        ],
      },
      database
    )
    assert.ok(p.ok)
    const pid = p.project.id
    const f = await createCustomField(
      pid,
      OWNER,
      { name: "Progress", field_type: "single_select", options: [{ id: "a", label: "Started" }, { id: "b", label: "Done" }], done_option: "b" },
      database
    )
    assert.ok(f.ok)
    const key = String(f.field.id)
    const add = async (title: string, status: string, values: Record<string, unknown> = {}, deleted = false) => {
      const [r] = await client`INSERT INTO public.tasks (title, status, client_id, project_id, created_by_email, custom_values, deleted_at)
        VALUES (${title}, ${status}, 42, ${pid}, ${OWNER}, ${JSON.stringify(values)}::jsonb, ${deleted ? new Date().toISOString() : null}) RETURNING id`
      return Number(r.id)
    }
    const doneEmpty = await add("done, no value", "done")
    const doneOther = await add("done, another option", "done", { [key]: "a", keep: "x" })
    const doneAlready = await add("done, done option", "done", { [key]: "b" })
    const open = await add("open", "in_progress", { [key]: "a" })
    const gone = await add("deleted done", "done", {}, true)
    const [elsewhere] = await client`INSERT INTO public.tasks (title, status, client_id, project_id, created_by_email)
      VALUES ('other project done', 'done', 42, ${otherProject}, ${OWNER}) RETURNING id`
    const values = async (id: number) => {
      const [r] = await client`SELECT custom_values FROM public.tasks WHERE id = ${id}`
      return (r.custom_values ?? {}) as Record<string, unknown>
    }
    const activity = async () => {
      const rows = await client`SELECT entity_id::int AS id, actor_email, actor_kind FROM public.codex_activity
        WHERE entity_type = 'task' AND action = 'update' AND entity_id IN (${doneEmpty}, ${doneOther}, ${doneAlready}, ${open}, ${gone})
        ORDER BY entity_id`
      return rows.map((r) => [r.id, r.actor_email, r.actor_kind])
    }

    switches(false)
    assert.deepEqual(await setProgressField(pid, OWNER, f.field.id, database), { ok: true, progress_field_id: f.field.id })
    assert.deepEqual(await values(doneEmpty), {}, "switch off: nothing set")
    assert.deepEqual(await activity(), [])

    switches(true)
    assert.equal((await setProgressField(pid, OWNER, null, database)).ok, true, "unlinking sets nothing")
    assert.deepEqual(await values(doneEmpty), {})
    assert.deepEqual(await setProgressField(pid, OWNER, f.field.id, database), { ok: true, progress_field_id: f.field.id })
    assert.deepEqual(await values(doneEmpty), { [key]: "b" })
    assert.deepEqual(await values(doneOther), { [key]: "b", keep: "x" }, "other values kept")
    assert.deepEqual(await values(doneAlready), { [key]: "b" })
    assert.deepEqual(await values(open), { [key]: "a" }, "an open task is left")
    assert.deepEqual(await values(gone), {}, "a deleted task is left")
    assert.deepEqual(await values(Number(elsewhere.id)), {}, "another project's task is left")
    assert.deepEqual(await activity(), [
      [doneEmpty, OWNER, "user"],
      [doneOther, OWNER, "user"],
    ], "one activity row each, by the person who linked it; none for a task already holding it")
    const [st] = await client`SELECT status FROM public.tasks WHERE id = ${doneEmpty}`
    assert.equal(st.status, "done")

    // Linking again (the same field) finds nothing new and writes nothing.
    assert.equal((await setProgressField(pid, OWNER, f.field.id, database)).ok, true)
    assert.equal((await activity()).length, 2)
  })

  it("C-263: a refused link sets nothing", async () => {
    const before = await client`SELECT count(*)::int AS n FROM public.codex_activity WHERE entity_type = 'task'`
    await client`UPDATE public.codex_projects SET progress_field_id = NULL WHERE id = ${projectId}`
    const t = await task("done before a refused link", "Published", "done")
    assert.equal((await setProgressField(projectId, OWNER, noDone, database)).ok, false)
    assert.equal((await state(t)).value, null)
    const afterRows = await client`SELECT count(*)::int AS n FROM public.codex_activity WHERE entity_type = 'task'`
    assert.equal(afterRows[0].n, before[0].n)
  })
})
