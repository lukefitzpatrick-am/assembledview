/**
 * B42 (C-211): a task in a private project never appears to someone who
 * cannot see the project, on any read surface, against a real Postgres
 * with migration 0118 applied. Also pins that the SQL rule
 * (`taskVisibleSql`) and the TS rule (`canSeeProject`) agree, and that
 * nothing is filtered before 0118.
 *
 * Surfaces: the Tasks list (rows and parent titles), status counts, MBA
 * counts, the single-task read (help parent and children), the hidden-id
 * check every single-task route and bulk use, search (tasks and the
 * meeting task count), My Work tabs, the workload, the Team tab counts and
 * estimates, the bell, the Inbox duplicate flag, the Client Hub meetings
 * flag and the pacing campaign notes.
 *
 * Skips unless CODEX_PROJECTS_TEST_DATABASE_URL names a LOCAL database whose
 * name ends in `_codex_test`. It works in a sibling database
 * `<name>_visibility_codex_test` (created if missing) and drops and rebuilds
 * that database's public schema. It never reads .env.local.
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
import { countTasksByMba, countTasksByStatus, getTask, listTasks } from "../repo.js"
import { createProject, resetProjectsMarkerCacheForTests } from "../projectsRepo.js"
import { canSeeProject } from "../projects.js"
import { hiddenTaskIds, taskVisibleSql } from "../taskVisibility.js"
import { searchCodex } from "../searchRepo.js"
import { listBell } from "../notificationsRepo.js"
import { getTeamWeekTimeSummary } from "../../myhours/timeSummary.js"
import { listProposedInbox } from "../../fireflies/proposalRepo.js"
import { listClientMeetings } from "../../clients/listClientMeetings.js"


const URL_ = siblingUrl(RAW_URL, "visibility")
const PRE_URL = siblingUrl(RAW_URL, "visibility_pre0118")
const skip = URL_ ? false : "set CODEX_PROJECTS_TEST_DATABASE_URL to a local database named *_codex_test"

const CREATOR = "olive.owner@assembledmedia.com.au"
const OWNER = "josh.patel@assembledmedia.com.au"
const MEMBER = "mia.tran@assembledmedia.com.au"
const OUT = "out.sider@assembledmedia.com.au"
const ELLIE = "ellie.ward@assembledmedia.com.au"
const MBA = "zz001"
const NOW = new Date("2026-11-13T01:00:00Z")

describe("private projects stay private on every read surface (Postgres, 0118 applied)", { skip }, () => {
  let client: ReturnType<typeof postgres>
  let database: Db
  let pub = 0
  let priv = 0
  const ids = { none: 0, pub: 0, priv: 0, help: 0, noteA: 0, noteB: 0 }

  async function task(title: string, project: number | null, extra: { parent?: number; note?: number; assignee?: string } = {}) {
    const [row] = await client`INSERT INTO public.tasks
      (title, status, project_id, client_id, mba_number, created_by_email, assignee_email, due_date, estimated_minutes, source_note_id, auto_created, parent_task_id)
      VALUES (${title}, 'todo', ${project}, 42, ${MBA}, ${CREATOR}, ${extra.assignee ?? ELLIE}, '2026-11-01T00:00:00Z', 60,
              ${extra.note ?? null}, ${extra.note != null}, ${extra.parent ?? null})
      RETURNING id`
    return Number(row.id)
  }

  before(async () => {
    client = await createDatabase(URL_!)
    await client.unsafe(`INSERT INTO public.team_members (email, name) VALUES
      ('${CREATOR}', 'Olive Owner'), ('${OWNER}', 'Josh Patel'), ('${MEMBER}', 'Mia Tran'), ('${OUT}', 'Out Sider'), ('${ELLIE}', 'Ellie Ward')`)
    await client.unsafe(fs.readFileSync(path.join(process.cwd(), "db/migrations/0118_codex_s1_projects.sql"), "utf8"))
    resetProjectsMarkerCacheForTests()
    database = drizzle(client, { schema }) as unknown as Db
    const p1 = await createProject(
      CREATOR,
      { name: "Open", kind: "ops", client_id: 42, mba_number: null, owner_email: null, is_private: false, start_on: null, due_on: null, members: [], sections: [] },
      database
    )
    const p2 = await createProject(
      CREATOR,
      { name: "Secret", kind: "ops", client_id: 42, mba_number: null, owner_email: OWNER, is_private: true, start_on: null, due_on: null, members: [MEMBER], sections: [] },
      database
    )
    assert.ok(p1.ok && p2.ok)
    pub = p1.project.id
    priv = p2.project.id
    const [a] = await client`INSERT INTO public.client_notes (client_id, title, body, meeting_date) VALUES (42, 'zebra standup', '{}', now()) RETURNING id`
    const [b] = await client`INSERT INTO public.client_notes (client_id, title, body, meeting_date) VALUES (42, 'quiet review', '{}', now() - interval '1 day') RETURNING id`
    ids.noteA = Number(a.id)
    ids.noteB = Number(b.id)
    ids.none = await task("zebra loose", null, { note: ids.noteA })
    ids.pub = await task("zebra open", pub, { note: ids.noteA })
    ids.priv = await task("zebra secret", priv, { note: ids.noteB })
    ids.help = await task("zebra help", null, { parent: ids.priv, assignee: OUT })
    await client`UPDATE public.tasks SET help_requested_by_email = ${CREATOR}, assigned_by_email = ${CREATOR} WHERE id IN (${ids.none}, ${ids.pub}, ${ids.priv})`
    await client`INSERT INTO public.task_followers (task_id, email, reason) VALUES (${ids.priv}, ${OUT}, 'manual'), (${ids.pub}, ${OUT}, 'manual')`
    await client`INSERT INTO public.task_comments (task_id, body, author_email) VALUES (${ids.priv}, 'zebra secret note', ${CREATOR}), (${ids.pub}, 'zebra open note', ${CREATOR})`
    await client`INSERT INTO public.codex_notifications (recipient_email, kind, task_id, actor_email) VALUES (${OUT}, 'assigned', ${ids.priv}, ${CREATOR}), (${MEMBER}, 'assigned', ${ids.priv}, ${CREATOR})`
    await client`INSERT INTO public.ava_task_proposals (proposed_title, proposed_mba_number, source_note_id) VALUES ('zebra secret', ${MBA}, ${ids.noteB})`
  })

  after(async () => {
    await client?.end({ timeout: 5 })
  })

  const listIds = async (viewer: string | null | undefined, extra: Record<string, unknown> = {}) =>
    (await listTasks({ viewerEmail: viewer, perPage: 100, ...extra }, database)).items.map((t) => Number(t.id)).sort((x, y) => x - y)

  it("the SQL rule and canSeeProject agree for owner, creator, member, outsider and nobody", async () => {
    const rows = await client`SELECT id, is_private, owner_email, created_by_email FROM public.codex_projects`
    const members = await client`SELECT project_id, email FROM public.codex_project_members`
    for (const viewer of [CREATOR, OWNER, MEMBER, OUT, "", "MIA.TRAN@assembledmedia.com.au "]) {
      for (const r of rows) {
        const facts = {
          is_private: Boolean(r.is_private),
          owner_email: r.owner_email as string | null,
          created_by_email: r.created_by_email as string | null,
          members: members.filter((m) => Number(m.project_id) === Number(r.id)).map((m) => String(m.email)),
        }
        const res = await database.execute(sql`SELECT ${taskVisibleSql(sql`${Number(r.id)}::bigint`, viewer)} AS ok`)
        const ok = (res as unknown as Array<{ ok: boolean }>)[0].ok
        assert.equal(ok, canSeeProject(facts, viewer), `project ${r.id} viewer "${viewer}"`)
      }
    }
    const none = await database.execute(sql`SELECT ${taskVisibleSql(sql`NULL::bigint`, "")} AS ok`)
    assert.equal((none as unknown as Array<{ ok: boolean }>)[0].ok, true, "no project: visible to all")
    const missing = await database.execute(sql`SELECT ${taskVisibleSql(sql`999999::bigint`, CREATOR)} AS ok`)
    assert.equal((missing as unknown as Array<{ ok: boolean }>)[0].ok, false, "a missing project row is hidden (as notify.ts treats it)")
  })

  it("Tasks list: rows, totals and parent titles", async () => {
    const all = [ids.none, ids.pub, ids.priv, ids.help].sort((x, y) => x - y)
    const outside = [ids.none, ids.pub, ids.help].sort((x, y) => x - y)
    assert.deepEqual(await listIds(OUT), outside)
    assert.deepEqual(await listIds(undefined), outside, "no viewer: public only")
    for (const v of [CREATOR, OWNER, MEMBER]) assert.deepEqual(await listIds(v), all, v)
    const outPage = await listTasks({ viewerEmail: OUT, perPage: 100 }, database)
    assert.equal(outPage.itemsTotal, 3)
    assert.equal(outPage.items.find((t) => Number(t.id) === ids.help)?.parent_title ?? null, null, "no title of a hidden parent")
    const mia = await listTasks({ viewerEmail: MEMBER, perPage: 100 }, database)
    assert.equal(mia.items.find((t) => Number(t.id) === ids.help)?.parent_title, "zebra secret")
    // filters that would name the private task still leave it out
    assert.deepEqual(await listIds(OUT, { q: "secret" }), [])
    assert.deepEqual(await listIds(OUT, { mbaNumber: MBA, assigneeEmail: ELLIE }), [ids.none, ids.pub].sort((x, y) => x - y))
  })

  it("status counts and MBA counts", async () => {
    assert.equal((await countTasksByStatus({ viewerEmail: OUT }, database)).todo, 3)
    assert.equal((await countTasksByStatus({ viewerEmail: MEMBER }, database)).todo, 4)
    assert.equal((await countTasksByStatus({}, database)).todo, 3)
    assert.deepEqual(await countTasksByMba([MBA], database, NOW, OUT), [{ mba_number: MBA, open: 3, overdue: 3 }])
    assert.deepEqual(await countTasksByMba([MBA], database, NOW, OWNER), [{ mba_number: MBA, open: 4, overdue: 4 }])
    assert.deepEqual(await countTasksByMba([MBA], database, NOW), [{ mba_number: MBA, open: 3, overdue: 3 }])
  })

  it("single task: the hidden-id check (routes and bulk) and the help parent snapshot", async () => {
    assert.deepEqual([...(await hiddenTaskIds(database, [ids.none, ids.pub, ids.priv, ids.help, 999999], OUT))], [ids.priv])
    assert.deepEqual([...(await hiddenTaskIds(database, [ids.priv], MEMBER))], [])
    assert.deepEqual([...(await hiddenTaskIds(database, [ids.priv], ""))], [ids.priv])
    const help = await getTask(ids.help, database, OUT)
    assert.ok(help)
    assert.equal(help.parent, null)
    assert.equal(help.parent_title, null)
    const helpMia = await getTask(ids.help, database, MEMBER)
    assert.equal(helpMia?.parent?.title, "zebra secret")
    // the private task's own read lists its help child to people who see it
    assert.deepEqual((await getTask(ids.priv, database, MEMBER))?.children?.map((c) => c.id), [ids.help])
  })

  it("search: tasks and the meeting task count", async () => {
    const out = await searchCodex("zebra", 10, database, OUT)
    assert.deepEqual(out.tasks.items.map((t) => t.id).sort((x, y) => x - y), [ids.none, ids.pub, ids.help].sort((x, y) => x - y))
    const meetingOut = out.meetings.items.find((m) => m.id === ids.noteA)
    assert.equal(meetingOut?.task_count, 2)
    const mia = await searchCodex("secret", 10, database, MEMBER)
    assert.deepEqual(mia.tasks.items.map((t) => t.id), [ids.priv])
    assert.deepEqual((await searchCodex("secret", 10, database, OUT)).tasks.items, [], "a comment on a hidden task finds nothing")
  })

  it("My Work tabs: assigned by me and following leave out a hidden task", async () => {
    assert.deepEqual(await listIds(OUT, { myWork: "following", myWorkEmail: OUT }), [ids.pub, ids.help].sort((x, y) => x - y))
    assert.deepEqual(await listIds(MEMBER, { myWork: "assigned_by", myWorkEmail: CREATOR }), [ids.none, ids.pub, ids.priv].sort((x, y) => x - y))
    assert.deepEqual(await listIds(OUT, { myWork: "assigned_by", myWorkEmail: CREATOR }), [ids.none, ids.pub].sort((x, y) => x - y))
  })

  it("My Work: assigned to me, and following with an unfollow row (B41's follower rule)", async () => {
    assert.deepEqual(await listIds(OUT, { myWork: "assigned", myWorkEmail: OUT }), [ids.help])
    assert.deepEqual(await listIds(MEMBER, { myWork: "assigned", myWorkEmail: ELLIE }), [ids.none, ids.pub, ids.priv].sort((x, y) => x - y))
    // Ellie is the assignee of three: an implicit follower until she unfollows one.
    await client`INSERT INTO public.task_followers (task_id, email, reason) VALUES (${ids.none}, ${ELLIE}, 'unfollowed')`
    try {
      assert.deepEqual(await listIds(MEMBER, { myWork: "following", myWorkEmail: ELLIE }), [ids.pub, ids.priv].sort((x, y) => x - y))
    } finally {
      await client`DELETE FROM public.task_followers WHERE task_id = ${ids.none} AND email = ${ELLIE}`
    }
    assert.deepEqual(await listIds(OUT, { myWork: "assigned_by", myWorkEmail: "" }), [], "no person: nothing")
    assert.equal((await countTasksByStatus({ viewerEmail: OUT, myWork: "following", myWorkEmail: OUT }, database)).todo, 2, "counts follow the tab")
  })

  it("Team tab: open, overdue and estimate per person", async () => {
    const out = await getTeamWeekTimeSummary(database, NOW, OUT)
    const ellieOut = out.members.find((m) => m.email === ELLIE)
    assert.equal(ellieOut?.open, 2)
    assert.equal(ellieOut?.estimated_open_minutes, 120)
    const owner = await getTeamWeekTimeSummary(database, NOW, OWNER)
    assert.equal(owner.members.find((m) => m.email === ELLIE)?.open, 3)
    assert.equal(owner.members.find((m) => m.email === ELLIE)?.overdue, 3)
    assert.equal(owner.members.find((m) => m.email === ELLIE)?.estimated_open_minutes, 180)
  })

  it("workload: a private project's task counts only for people who can see it", async () => {
    const { loadWorkload } = await import("../workloadRepo.js")
    const ellie = async (viewer: string) => (await loadWorkload(viewer, 3, NOW, database)).people.find((p) => p.email === ELLIE)
    assert.deepEqual(
      { open: (await ellie(OUT))?.open, overdue: (await ellie(OUT))?.overdue },
      { open: 2, overdue: 2 }
    )
    assert.equal((await ellie(MEMBER))?.open, 3)
    assert.equal((await ellie(""))?.open, 2, "nobody: public only")
  })

  it("bell: the shared rule hides a private task's notification from an outsider", async () => {
    assert.equal((await listBell(OUT, 30, database)).items.length, 0)
    assert.equal((await listBell(OUT, 30, database)).unread, 0)
    assert.equal((await listBell(MEMBER, 30, database)).items.length, 1)
  })

  it("Inbox: a hidden task never flags a proposal as a possible duplicate", async () => {
    const flag = async (viewer: string) => {
      const inbox = await listProposedInbox(database, { viewerEmail: viewer })
      return inbox.groups.flatMap((g) => g.proposals).map((p) => p.possible_duplicate)
    }
    assert.deepEqual(await flag(OUT), [false])
    assert.deepEqual(await flag(MEMBER), [true])
  })

  it("panels outside /tasks: Client Hub meetings and the pacing notes leave out private tasks for everyone", async () => {
    const meetings = await listClientMeetings(42, database as never)
    assert.equal(meetings.find((m) => m.id === ids.noteA)?.auto_created_tasks, true)
    assert.equal(meetings.find((m) => m.id === ids.noteB)?.auto_created_tasks, false, "only a private task came from this meeting")
    // listCampaignDetailNotes reads the app database (getDb): point it at this local one.
    const prior = process.env.DATABASE_URL
    process.env.DATABASE_URL = URL_!
    try {
      const { listCampaignDetailNotes } = await import("../../pacing/detail/notes.js")
      const notes = await listCampaignDetailNotes(MBA)
      assert.deepEqual(notes.filter((n) => n.source === "comment").map((n) => n.body), ["zebra open note"])
    } finally {
      const { closeDb } = await import("@/db")
      await closeDb()
      if (prior === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = prior
    }
  })
})

describe("before 0118 nothing is filtered and no 0118 column is named", { skip: PRE_URL ? false : skip }, () => {
  let client: ReturnType<typeof postgres>
  let database: Db
  before(async () => {
    client = await createDatabase(PRE_URL!)
    resetProjectsMarkerCacheForTests()
    database = drizzle(client, { schema }) as unknown as Db
    await client`INSERT INTO public.tasks (title, mba_number, created_by_email) VALUES ('plain', ${MBA}, ${CREATOR})`
  })
  after(async () => {
    resetProjectsMarkerCacheForTests()
    await client?.end({ timeout: 5 })
  })
  it("list, counts, hidden ids and search work on the pre-0118 table", async () => {
    assert.equal((await listTasks({ viewerEmail: OUT }, database)).itemsTotal, 1)
    assert.equal((await countTasksByStatus({}, database)).todo, 1)
    assert.deepEqual(await countTasksByMba([MBA], database, NOW, OUT), [{ mba_number: MBA, open: 1, overdue: 0 }])
    const [{ id }] = await client`SELECT id FROM public.tasks`
    assert.equal((await hiddenTaskIds(database, [Number(id)], OUT)).size, 0)
    assert.equal((await searchCodex("plain", 5, database, OUT)).tasks.items.length, 1)
    assert.equal((await listTasks({ myWork: "assigned_by", myWorkEmail: CREATOR }, database)).itemsTotal, 0, "My Work before 0118: nothing, no error")
    assert.equal((await listTasks({ myWork: "following", myWorkEmail: CREATOR }, database)).itemsTotal, 0)
    const { loadWorkload } = await import("../workloadRepo.js")
    await assert.rejects(loadWorkload(OUT, 2, NOW, database), (e: Error) => e.name === "ProjectsUnavailableError", "the workload needs 0118 (503)")
  })
})
