/**
 * B42 (C-211), B42fix (review F3): one visibility rule for every task read.
 *
 * A static check over every source root, read by read (`taskReaders.ts`
 * parses each file with the TypeScript compiler): every Drizzle or raw SQL
 * read of `tasks`, `task_comments`, `task_attachments`, `task_followers`,
 * `task_checklist_items`, `codex_activity` or `codex_notifications` is in a
 * function listed below, with the rule it follows and why. A "shared" reader
 * must apply the shared SQL rule in each read statement (directly, through a
 * local that does, or through a named helper or parameter). A new reader, a
 * stale entry, or a shared read without the rule fails. The review's probe
 * readers are run through the same scan and must fail.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

import { checkReaders, findTaskReads, taskRelations, type ReaderEntry, type TaskRead } from "./taskReaders.js"

const ROOT = process.cwd()
/** Every source root: a reader anywhere is found. */
const SOURCE_ROOTS = ["lib", "app", "components", "src", "hooks", "contexts", "db", "scripts", "middleware.ts", "instrumentation.ts", "instrumentation.node.ts"]

function walk(p: string, out: string[] = []): string[] {
  if (!fs.existsSync(p)) return out
  if (fs.statSync(p).isFile()) {
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(p) && !/\.test\.[cm]?[jt]sx?$/.test(p)) out.push(p)
    return out
  }
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith(".")) continue
    walk(path.join(p, entry.name), out)
  }
  return out
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/")
const source = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8")

const ROUTE_GUARDED = "single-task store read; every route that calls it runs hiddenTaskGuard first (C-211), pinned below"
const WRITER = "a writer's own read inside its transaction; the route in front checks visibility (hiddenTaskGuard, or bulk's firstHiddenTaskId)"
const SYSTEM = "a system job (no person reads the rows)"

/** Every function that reads a task table, with its rule and why. */
const READERS: Record<string, ReaderEntry> = {
  // Person-facing reads through the shared SQL rule
  "lib/codex/repo.ts#listTasks": { rule: "shared", via: ["taskListWhereVisible"], reason: "the Tasks list" },
  "lib/codex/repo.ts#countTasksByStatus": { rule: "shared", via: ["taskListWhereVisible"], reason: "status counts" },
  "lib/codex/repo.ts#countTasksByMba": { rule: "shared", reason: "MBA counts" },
  "lib/codex/repo.ts#attachHelpGraph": { rule: "shared", reason: "a task's help parent, read only when not hidden" },
  "lib/codex/repo.ts#attachParentTitles": { rule: "shared", reason: "help parent titles on list rows, hidden parents never read" },
  "lib/codex/searchRepo.ts#buildTaskSearchSql": { rule: "shared", via: ["visible"], reason: "search; searchCodex passes taskVisibilityCondition as `visible`" },
  "lib/codex/searchRepo.ts#buildMeetingSearchSql": { rule: "shared", via: ["visible"], reason: "a meeting's task count; searchCodex passes the rule" },
  "lib/codex/notificationsRepo.ts#listBell": { rule: "shared", reason: "the bell" },
  "lib/codex/notificationsRepo.ts#loadDigestBatch": { rule: "shared", reason: "the email digest, per recipient" },
  "lib/myhours/timeSummary.ts#getTeamWeekTimeSummary": { rule: "shared", reason: "Team tab open and overdue counts" },
  "lib/codex/estimatedMinutesColumn.ts#sumOpenEstimatedMinutesByAssignee": { rule: "shared", via: ["visible"], reason: "Team tab estimates; getTeamWeekTimeSummary passes the rule" },
  "lib/fireflies/proposalRepo.ts#listProposedInbox": { rule: "shared", reason: "the Inbox duplicate flag" },
  "lib/fireflies/proposalRepo.ts#listOpenTasksForMba": { rule: "shared", reason: "the accept answer's duplicate flag, as the person accepting (F2)" },
  "lib/clients/listClientMeetings.ts#listClientMeetings": { rule: "shared", reason: "Client Hub meetings flag (no viewer: public only)" },
  "lib/pacing/detail/notes.ts#listMbaTaskComments": { rule: "shared", reason: "pacing campaign notes (no viewer: public only)" },
  "lib/codex/workloadRepo.ts#loadWorkload": { rule: "shared", reason: "the workload" },
  "lib/codex/taskVisibility.ts#hiddenTaskIds": { rule: "shared", reason: "the rule's own id check" },
  "lib/codex/taskVisibility.ts#openTasksHiddenFromAssignee": { rule: "shared", reason: "C-258: the rule with each task's assignee as the viewer; ids only" },

  // Inside one project or task, after a TS visibility check in the same function
  "lib/codex/collabRepo.ts#listCommentsWithMentions": { rule: "project", reason: "comments of a task the viewer may see (loadVisibleTask)" },
  "lib/codex/collabRepo.ts#listAttachments": { rule: "project", reason: "attachments of a visible task" },
  "lib/codex/collabRepo.ts#checkCanAttach": { rule: "project", reason: "the attachment count of a visible task" },
  "lib/codex/collabRepo.ts#createAttachment": { rule: "project", reason: "writer, after loadVisibleTask" },
  "lib/codex/collabRepo.ts#deleteAttachment": { rule: "project", reason: "writer, after loadVisibleTask" },
  "lib/codex/collabRepo.ts#getAttachmentFile": { rule: "project", reason: "file of a visible task" },
  "lib/codex/projectsRepo.ts#loadProjectBoard": { rule: "project", reason: "a project board, after loadVisibleProject" },
  "lib/codex/projectsRepo.ts#listSectionTasks": { rule: "project", reason: "a section page, after loadVisibleProject" },
  "lib/codex/taskDetailRepo.ts#getTaskProjectDetail": { rule: "project", reason: "the detail panel's project part (hidden project: no data)" },
  "lib/codex/taskDetailRepo.ts#createSubtask": { rule: "project", reason: "after lockParent (the parent's project visible)" },
  "lib/codex/taskDetailRepo.ts#lockParent": { rule: "project", reason: "the parent, after loadVisibleProject" },
  "lib/codex/notify.ts#writeNotifications": { rule: "project", reason: "recipients filtered by canSeeTask" },

  // Exempt: not a person's read, or given visible ids by its caller
  "lib/codex/repo.ts#getTask": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#getLiveTaskRow": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#listTaskActivity": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#listComments": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#deleteComment": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#listChecklistItems": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#createChecklistItem": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#updateChecklistItem": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#deleteChecklistItem": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#reorderChecklistItems": { rule: "exempt", reason: ROUTE_GUARDED },
  "lib/codex/repo.ts#listHelpChildren": { rule: "exempt", reason: "rows only to attachHelpGraph, which drops hidden ones (hiddenTaskIds)" },
  "lib/codex/repo.ts#isSubtaskRow": { rule: "exempt", reason: "task_type of a task the caller holds; returns a flag, no data" },
  "lib/codex/repo.ts#subtaskIdsAmong": { rule: "exempt", reason: "which of the caller's ids are subtasks; no data" },
  "lib/codex/repo.ts#myWorkCondition": { rule: "exempt", reason: "a condition ANDed into listTasks and countTasksByStatus, which apply the rule" },
  "lib/codex/repo.ts#loadListTasksByIds": { rule: "exempt", reason: "the rows bulk just wrote; bulk refuses hidden ids first" },
  "lib/codex/repo.ts#enrichListTasks": { rule: "exempt", reason: "checklist counts for rows already listed through the rule" },
  "lib/codex/repo.ts#updateLiveTask": { rule: "exempt", reason: WRITER },
  "lib/codex/repo.ts#softDeleteLiveTask": { rule: "exempt", reason: WRITER },
  "lib/codex/repo.ts#requestHelp": { rule: "exempt", reason: WRITER },
  "lib/codex/repo.ts#maybeCompleteHelpParent": { rule: "exempt", reason: "help writer: the parent of a child being saved" },
  "lib/codex/repo.ts#maybeRewaitHelpParent": { rule: "exempt", reason: "help writer: the parent of a child being saved" },
  "lib/codex/repo.ts#listRecurringSeeds": {
    rule: "exempt",
    reason:
      "the recurring job's seeds: their rows go only into the copies it makes, and each copy keeps its seed's project, so the same people see it (P1, taskWriters.test.ts)",
  },
  "lib/codex/repo.ts#findGeneratedRecurringTask": { rule: "exempt", reason: SYSTEM },
  "lib/codex/repo.ts#latestRecurringInstanceDueYmd": { rule: "exempt", reason: SYSTEM },
  "lib/codex/notificationsRepo.ts#generateDueReminders": { rule: "exempt", reason: `${SYSTEM}; recipients through writeNotifications (canSeeTask)` },
  "lib/codex/notify.ts#loadTaskFactsMany": { rule: "exempt", reason: "task facts for the notification writer and loadVisibleTask, which apply canSeeTask" },
  "lib/codex/notify.ts#loadFollowerRows": { rule: "exempt", reason: "follower rows of a task the caller loaded visible" },
  "lib/codex/estimatedMinutesColumn.ts#estimatedMinutesByTaskId": { rule: "exempt", reason: "estimates for ids the caller listed" },
  "lib/codex/customFieldsRepo.ts#optionUsage": { rule: "exempt", reason: "a count of tasks using an option in a project the caller loaded visible" },
  "lib/codex/customFieldsRepo.ts#deleteCustomField": { rule: "exempt", reason: "a count in a project loaded visible earlier in the function" },
  "lib/codex/projectsRepo.ts#attachTaskS1Fields": { rule: "exempt", reason: "adds fields to rows already listed through the rule" },
  "lib/codex/projectsRepo.ts#loadBoardCards": { rule: "exempt", reason: "cards for ids its callers picked after their own check" },
  "lib/codex/projectsRepo.ts#lockLiveTask": { rule: "exempt", reason: WRITER },
  "lib/codex/projectsRepo.ts#writeTaskInTx": { rule: "exempt", reason: WRITER },
  "lib/codex/projectsRepo.ts#bulkUpdateTasksThroughSections": { rule: "exempt", reason: WRITER },
  "lib/codex/projectsRepo.ts#nextSortOrderInSection": { rule: "exempt", reason: "a number for a section write; no data out" },
  "lib/codex/projectsRepo.ts#sectionTaskIds": { rule: "exempt", reason: "ids for a section reorder; no data out" },
  "lib/codex/projectsRepo.ts#countLiveTasksInSection": { rule: "exempt", reason: "a count for a section delete, after loadVisibleProject in the caller" },
  "lib/codex/projectsRepo.ts#joiningAssigneeWithoutAccess": { rule: "exempt", reason: "the F5 check itself (canSeeProject)" },
  "lib/codex/taskDetailRepo.ts#loadSubtasks": { rule: "exempt", reason: "subtasks for getTaskProjectDetail, empty when the project is hidden" },
  "lib/codex/taskDetailRepo.ts#loadTaskS1": { rule: "exempt", reason: "the task row for getTaskProjectDetail and lockParent, which check" },
  "lib/codex/sectionSync.ts#followSectionRule": { rule: "exempt", reason: WRITER },
  "lib/codex/sectionSync.ts#lockTaskProject": { rule: "exempt", reason: WRITER },
  "lib/codex/sectionSync.ts#lockTaskAndProject": { rule: "exempt", reason: `${WRITER}; the project id for a copy, no data out (P3)` },
  "lib/codex/progressRule.ts#markProgressDone": { rule: "exempt", reason: WRITER },
  "lib/codex/progressRule.ts#markDoneTasksOnLink": { rule: "exempt", reason: "C-263: the progress field link's own write over the project's done tasks, after loadVisibleProject in the same transaction; no row goes to a person" },
  "lib/codex/taskVisibility.ts#shareTaskProject": { rule: "exempt", reason: "the F5 check itself: the task's project id, to lock it (C-258)" },
  "lib/codex/seedTasks.ts#findExistingSeededTask": { rule: "exempt", reason: SYSTEM },
  "lib/fireflies/proposalRepo.ts#insertProposalsFromNote": { rule: "exempt", reason: `${SYSTEM}: meeting ingest dedupe keys and titles` },
  "lib/fireflies/proposalRepo.ts#getTask": { rule: "exempt", reason: "dismiss-auto, behind hiddenTaskGuard" },
  "lib/pacing/relabel/autoClose.ts#runCloseUntouchedRelabelTasks": { rule: "exempt", reason: SYSTEM },
}

/** Views and functions over task tables in the Postgres migrations (P2): a read of one is a read of task data. */
const MIGRATIONS = path.join(ROOT, "db/migrations")
const RELATIONS = taskRelations(
  fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).map((f) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8"))
)

function scanAll(): TaskRead[] {
  return SOURCE_ROOTS.flatMap((r) => walk(path.join(ROOT, r))).flatMap((f) => findTaskReads(rel(f), fs.readFileSync(f, "utf8"), RELATIONS))
}

test("every task-table read is classified, per function, and every shared read applies the rule", () => {
  const reads = scanAll()
  assert.ok(reads.length > 100, `the scan found the readers (${reads.length})`)
  assert.deepEqual(checkReaders(reads, READERS, source), [])
})

test("the allowlist: 81 readers (18 shared, 12 project, 51 exempt), and no view or function over task tables yet", () => {
  const count = (rule: string) => Object.values(READERS).filter((e) => e.rule === rule).length
  assert.deepEqual(
    { all: Object.keys(READERS).length, shared: count("shared"), project: count("project"), exempt: count("exempt") },
    { all: 81, shared: 18, project: 12, exempt: 51 }
  )
  // A new view or set-returning function over a task table joins RELATIONS and its readers must be listed.
  assert.deepEqual(RELATIONS, [])
})

/** The review's nine probes (F3), plus a shared reader that forgets the rule (F2's shape). Each must fail. */
const PROBES: Array<{ name: string; file: string; src: string }> = [
  { name: "innerJoin", file: "lib/probe/a.ts", src: `import { tasks } from "@/db/schema"\nexport async function p(db: any) { return db.select().from(x).innerJoin(tasks, eq(tasks.id, x.id)) }` },
  { name: "lower-case raw", file: "lib/probe/b.ts", src: "export async function p(db: any) { return db.execute(sql`select * from tasks t where t.id = 1`) }" },
  { name: "FROM then new line", file: "lib/probe/c.ts", src: "export async function p(db: any) { return db.execute(sql`SELECT id FROM\n  tasks WHERE id = 1`) }" },
  { name: "db.query.tasks", file: "lib/probe/d.ts", src: "export async function p(db: any) { return db.query.tasks.findMany() }" },
  { name: "aliased import", file: "lib/probe/e.ts", src: `import { tasks as t } from "@/db/schema"\nexport async function p(db: any) { return db.select().from(t) }` },
  { name: "public.task_comments", file: "lib/probe/f.ts", src: "export async function p(db: any) { return db.execute(sql`SELECT body FROM public.task_comments WHERE task_id = 1`) }" },
  { name: "schema.taskComments", file: "lib/probe/g.ts", src: `import { schema } from "@/db"\nexport async function p(db: any) { return db.select().from(schema.taskComments) }` },
  { name: "codex_activity task rows", file: "lib/probe/h.ts", src: "export async function p(db: any) { return db.execute(sql`SELECT after FROM codex_activity a JOIN \"tasks\" t ON t.id = a.entity_id WHERE a.entity_type = 'task'`) }" },
  { name: "a reader under src/", file: "src/probe/i.ts", src: `import { schema } from "@/db"\nexport async function p(db: any) { return db.select().from(schema.tasks) }` },
  {
    name: "a listed shared reader without the rule (F2's shape)",
    file: "lib/fireflies/proposalRepo.ts",
    src: `import { schema } from "@/db"\nasync function listOpenTasksForMba(mba: string, database: any) {\n  const rows = await database.select().from(schema.tasks).where(eq(schema.tasks.mbaNumber, mba))\n  return rows\n}`,
  },
]

/** A view and a set-returning function over tasks, as a migration would write them (P2). */
const PROBE_MIGRATION = `
CREATE OR REPLACE VIEW public.open_tasks_v AS SELECT * FROM public.tasks WHERE deleted_at IS NULL;
CREATE FUNCTION public.codex_open_tasks() RETURNS SETOF public.tasks LANGUAGE sql STABLE AS $$ SELECT * FROM open_tasks_v $$;
CREATE FUNCTION public.codex_task_titles(p bigint) RETURNS TABLE (title text) LANGUAGE sql AS $fn$ SELECT title FROM "tasks" WHERE id = p $fn$;
CREATE FUNCTION public.codex_dynamic_tasks() RETURNS SETOF public.tasks LANGUAGE plpgsql AS $$ BEGIN RETURN QUERY EXECUTE format('SELECT * FROM %I', 'x'); END $$;
CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM 1 FROM tasks; RETURN NEW; END $$;
CREATE VIEW public.clients_v AS SELECT * FROM public.clients;
`
const PROBE_RELATIONS = taskRelations([PROBE_MIGRATION])

/** The PACK3 review's missed shapes (P2): each is found and fails the check. */
const P2_PROBES: Array<{ name: string; file: string; src: string }> = [
  { name: "a local bound to a table", file: "lib/probe/p1.ts", src: `import { schema } from "@/db"\nexport async function p(db: any) { const t = schema.tasks; return db.select().from(t) }` },
  {
    name: "a helper wrapping .from(t)",
    file: "lib/probe/p2.ts",
    src: `import { tasks } from "@/db/schema"\nfunction readAll(db: any, t: any) { return db.select().from(t) }\nexport async function p(db: any) { return readAll(db, tasks) }`,
  },
  { name: "a namespace import under another name", file: "lib/probe/p3.ts", src: `import * as s from "@/db/schema"\nexport async function p(db: any) { return db.select().from(s.tasks) }` },
  { name: 'schema["tasks"]', file: "lib/probe/p4.ts", src: `import { schema } from "@/db"\nexport async function p(db: any) { return db.select().from(schema["tasks"]) }` },
  { name: "a table re-exported from another module", file: "lib/probe/p5.ts", src: `import { tasks } from "@/lib/codex/tables"\nexport async function p(db: any) { return db.select().from(tasks) }` },
  { name: "sql.raw with the table in a const", file: "lib/probe/p6.ts", src: 'const T = "public.tasks"\nexport async function p(db: any) { return db.execute(sql.raw(`SELECT * FROM ${T}`)) }' },
  { name: "sql.join of SELECT and a raw FROM piece", file: "lib/probe/p7.ts", src: 'export async function p(db: any) { return db.execute(sql.join([sql`SELECT id`, sql.raw(" FROM public.tasks")], sql` `)) }' },
  { name: "string concatenation", file: "lib/probe/p8.ts", src: 'export async function p(db: any) { return db.execute(sql.raw("SELECT title " + "FROM tasks")) }' },
  { name: "a view over tasks", file: "lib/probe/p9.ts", src: "export async function p(db: any) { return db.execute(sql`SELECT * FROM open_tasks_v`) }" },
  { name: "a set-returning function over tasks", file: "lib/probe/p10.ts", src: "export async function p(db: any) { return db.execute(sql`SELECT * FROM public.codex_open_tasks()`) }" },
  { name: "a set-returning function typed SETOF tasks", file: "lib/probe/p10b.ts", src: "export async function p(db: any) { return db.execute(sql`SELECT id FROM codex_dynamic_tasks()`) }" },
  { name: "supabase-js .from(\"tasks\")", file: "lib/probe/p11.ts", src: 'export async function p(sb: any) { return sb.from("tasks").select("*") }' },
  { name: "supabase-js .rpc of a function over tasks", file: "lib/probe/p12.ts", src: 'export async function p(sb: any) { return sb.rpc("codex_task_titles", { p: 1 }) }' },
  {
    name: "a listed shared reader whose rule name is only in an if guard",
    file: "lib/fireflies/proposalRepo.ts",
    src: `import { schema } from "@/db"\nasync function listOpenTasksForMba(mba: string, database: any, viewer: string) {\n  if ((await hiddenTaskIds(database, [1], viewer)).size === 0) {\n    return database.select().from(schema.tasks).where(eq(schema.tasks.mbaNumber, mba))\n  }\n  return []\n}`,
  },
  {
    name: "a listed shared reader whose rule name is only in a comment",
    file: "lib/fireflies/proposalRepo.ts",
    src: `import { schema } from "@/db"\nasync function listOpenTasksForMba(mba: string, database: any) {\n  return database.select().from(schema.tasks) /* taskVisibleSql */ .where(eq(schema.tasks.mbaNumber, mba))\n}`,
  },
  {
    name: "a listed shared reader whose rule name is in a sibling call",
    file: "lib/fireflies/proposalRepo.ts",
    src: `import { schema } from "@/db"\nasync function listOpenTasksForMba(mba: string, database: any, viewer: string) {\n  const [rows] = await Promise.all([database.select().from(schema.tasks).where(eq(schema.tasks.mbaNumber, mba)), hiddenTaskIds(database, [], viewer)])\n  return rows\n}`,
  },
  {
    name: "a listed shared reader whose rule name is only an object key",
    file: "lib/fireflies/proposalRepo.ts",
    src: `import { schema } from "@/db"\nasync function listOpenTasksForMba(mba: string, database: any) {\n  return database.select().from(schema.tasks).where(build({ taskVisibleSql: false, mba }))\n}`,
  },
  {
    name: "a listed shared reader whose rule is only in a string",
    file: "lib/fireflies/proposalRepo.ts",
    src: `import { schema } from "@/db"\nasync function listOpenTasksForMba(mba: string, database: any) {\n  return database.select().from(schema.tasks).where(eq(schema.tasks.mbaNumber, "taskVisibilityCondition"))\n}`,
  },
]

test("the probe readers are all caught (review F3, PACK3 review P2): each is found and fails the check", () => {
  assert.ok(SOURCE_ROOTS.includes("src"), "src/ is scanned")
  for (const probe of [...PROBES, ...P2_PROBES]) {
    const reads = findTaskReads(probe.file, probe.src, PROBE_RELATIONS)
    assert.ok(reads.length > 0, `${probe.name}: found`)
    const problems = checkReaders(reads, READERS, () => probe.src).filter((p) => !p.startsWith("stale entry"))
    assert.ok(problems.length > 0, `${probe.name}: fails the check`)
  }
})

test("views and set-returning functions over task tables are relations; trigger functions and other views are not", () => {
  assert.deepEqual(PROBE_RELATIONS, ["codex_dynamic_tasks", "codex_open_tasks", "codex_task_titles", "open_tasks_v"])
})

test("a shared read passes only with the rule in its own expression (directly, through a local, or a via parameter)", () => {
  const file = "lib/fireflies/proposalRepo.ts"
  const ok = [
    `import { schema } from "@/db"\nasync function listOpenTasksForMba(mba: string, database: any, viewer: string) {\n  return database.select().from(schema.tasks).where(and(eq(schema.tasks.mbaNumber, mba), await taskVisibilityCondition(database, viewer)))\n}`,
    `import { schema } from "@/db"\nasync function listOpenTasksForMba(mba: string, database: any, viewer: string) {\n  const visible = await taskVisibilityCondition(database, viewer)\n  const where = and(eq(schema.tasks.mbaNumber, mba), visible)\n  return database.select().from(schema.tasks).where(where)\n}`,
    "async function listOpenTasksForMba(mba: string, database: any, viewer: string) {\n  const visible = await taskVisibleSql(database, viewer)\n  return database.execute(sql`SELECT id FROM public.tasks t WHERE t.mba_number = ${mba} AND ${visible}`)\n}",
  ]
  for (const src of ok) {
    const reads = findTaskReads(file, src)
    assert.ok(reads.length > 0)
    assert.deepEqual(checkReaders(reads, READERS, () => src).filter((p) => !p.startsWith("stale entry")), [], src)
  }
})

test("comments, prose and words in strings that are not SQL reads are not readers", () => {
  const src = [
    "// select * from tasks",
    "/** FROM tasks */",
    'export const label = "Move work from Tasks to the board"',
    "export const s = sql`UPDATE public.tasks SET title = 'x' WHERE id = 1`",
    "export const ins = sql`INSERT INTO task_comments (body) VALUES ('note')`",
    "export const tasks = [1, 2]; export const n = tasks.length",
  ].join("\n")
  assert.deepEqual(findTaskReads("lib/probe/none.ts", src), [])
})

test("Ava never reads tasks, task comments or Codex stores", () => {
  const ava = [...walk(path.join(ROOT, "lib/ava")), ...walk(path.join(ROOT, "app/api/ava")), ...walk(path.join(ROOT, "src/ava"))]
  assert.ok(ava.length > 10, "the Ava sources were found")
  assert.deepEqual(ava.flatMap((f) => findTaskReads(rel(f), fs.readFileSync(f, "utf8"))).map((r) => r.key), [])
  const stores = /@\/lib\/codex\/(repo|searchRepo|projectsRepo|taskDetailRepo|collabRepo|notificationsRepo|workloadRepo|taskVisibility)\b/
  assert.deepEqual(ava.filter((f) => stores.test(fs.readFileSync(f, "utf8"))).map(rel), [])
})

test("the single-task routes all call the hidden-task guard right after the staff gate", () => {
  const dir = path.join(ROOT, "app/api/codex/tasks/[id]")
  const files = walk(dir).filter((f) => f.endsWith("route.ts"))
  // followers and attachments check visibility in their store (B41, loadVisibleTask)
  const storeChecked = new Set(["followers/route.ts", "attachments/route.ts", "attachments/[attachmentId]/route.ts"])
  for (const f of files) {
    const name = path.relative(dir, f).split(path.sep).join("/")
    const src = fs.readFileSync(f, "utf8")
    if (storeChecked.has(name)) {
      assert.match(src, /collabRepo/, name)
      continue
    }
    const handlers = (src.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? []).length
    const guards = (src.match(/if \("error" in auth\) return auth\.error\n {2}const hidden = await hiddenTaskGuard\(context, auth\.session\)\n {2}if \(hidden\) return hidden\n/g) ?? []).length
    assert.ok(handlers > 0, name)
    assert.equal(guards, handlers, `${name}: every handler calls hiddenTaskGuard after the staff gate`)
  }
})
