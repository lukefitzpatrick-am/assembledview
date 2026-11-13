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

import { checkReaders, findTaskReads, type ReaderEntry, type TaskRead } from "./taskReaders.js"

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
  "lib/codex/repo.ts#taskProjectId": { rule: "exempt", reason: "the project id for Ask for help's own checks; no data out" },
  "lib/codex/repo.ts#maybeCompleteHelpParent": { rule: "exempt", reason: "help writer: the parent of a child being saved" },
  "lib/codex/repo.ts#maybeRewaitHelpParent": { rule: "exempt", reason: "help writer: the parent of a child being saved" },
  "lib/codex/repo.ts#listRecurringSeeds": { rule: "exempt", reason: SYSTEM },
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
  "lib/codex/progressRule.ts#markProgressDone": { rule: "exempt", reason: WRITER },
  "lib/codex/taskVisibility.ts#assertAssigneeCanSeeTask": { rule: "exempt", reason: "the F5 check itself" },
  "lib/codex/seedTasks.ts#findExistingSeededTask": { rule: "exempt", reason: SYSTEM },
  "lib/fireflies/proposalRepo.ts#insertProposalsFromNote": { rule: "exempt", reason: `${SYSTEM}: meeting ingest dedupe keys and titles` },
  "lib/fireflies/proposalRepo.ts#getTask": { rule: "exempt", reason: "dismiss-auto, behind hiddenTaskGuard" },
  "lib/pacing/relabel/autoClose.ts#runCloseUntouchedRelabelTasks": { rule: "exempt", reason: SYSTEM },
}

function scanAll(): TaskRead[] {
  return SOURCE_ROOTS.flatMap((r) => walk(path.join(ROOT, r))).flatMap((f) => findTaskReads(rel(f), fs.readFileSync(f, "utf8")))
}

test("every task-table read is classified, per function, and every shared read applies the rule", () => {
  const reads = scanAll()
  assert.ok(reads.length > 100, `the scan found the readers (${reads.length})`)
  assert.deepEqual(checkReaders(reads, READERS, source), [])
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

test("the probe readers are all caught (review F3): each is found and fails the check", () => {
  assert.ok(SOURCE_ROOTS.includes("src"), "src/ is scanned")
  for (const probe of PROBES) {
    const reads = findTaskReads(probe.file, probe.src)
    assert.ok(reads.length > 0, `${probe.name}: found`)
    const problems = checkReaders(reads, READERS, () => probe.src).filter((p) => !p.startsWith("stale entry"))
    assert.ok(problems.length > 0, `${probe.name}: fails the check`)
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
