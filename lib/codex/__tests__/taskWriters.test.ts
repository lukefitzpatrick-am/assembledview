/**
 * P1 (PACK3fix): every writer that makes a task, and where its copy lives.
 *
 * A task made from another task copies its title (and often its description,
 * client and MBA), so it must stay in the source task's project, and so keep
 * its privacy (C-211). A static check over every source root lists each place
 * that inserts into `tasks` or calls the shared `createTask`, with what it
 * makes the task from. "task" writers name the Postgres test that pins the
 * project they keep. A new writer, or a stale entry, fails.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

import { findTaskCreates, type TaskCreate } from "./taskReaders.js"

const ROOT = process.cwd()
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

type CreatorEntry =
  /** Copies another task: keeps its project. `pin` is the test that proves it. */
  | { from: "task"; keeps: string; pin: string }
  /** Made from something that is not a task (input, a template, a meeting, a relabel, a profile): no project to keep. */
  | { from: "other"; reason: string }
  /** Made inside a project the caller loaded visible. */
  | { from: "section"; reason: string; pin: string }

const NOT_A_TASK = "createTask makes the task in no project from the fields it is given"

/** Every function that makes a task. */
const CREATORS: Record<string, CreatorEntry> = {
  "lib/codex/repo.ts#requestHelp": { from: "task", keeps: "the parent's project, locked with the parent row (F1, P3)", pin: "taskCopies.db.test.ts: Ask for help" },
  "lib/codex/repo.ts#createGeneratedRecurringTask": { from: "task", keeps: "the seed's project, section by the rule for to do (P1)", pin: "taskCopies.db.test.ts: recurring" },
  "lib/codex/taskDetailRepo.ts#createSubtask": { from: "task", keeps: "the parent's project, locked by lockParent (B40)", pin: "taskCopies.db.test.ts: a subtask" },
  "lib/codex/projectsRepo.ts#createTasksInSection": { from: "section", reason: "paste or inline add into a section of a project loaded visible", pin: "taskCopies.db.test.ts: paste" },
  "lib/codex/repo.ts#createTask": { from: "other", reason: "the shared creator: the fields it is given, in no project; a template copies its checklist from task_templates, not from a task" },
  "app/api/codex/tasks/route.ts#POST": { from: "other", reason: `a person's new task (title, template, recurring rule); ${NOT_A_TASK}` },
  "lib/codex/seedTasks.ts#seedTasksForCampaign": { from: "other", reason: `campaign profile rows; ${NOT_A_TASK}` },
  "lib/fireflies/autoCreate.ts#persistActionItemPlan": { from: "other", reason: `a meeting's action items; ${NOT_A_TASK}` },
  "lib/fireflies/proposalRepo.ts#createTask": { from: "other", reason: `an accepted meeting proposal; ${NOT_A_TASK}` },
  "lib/fireflies/proposals.ts#acceptProposalPure": { from: "other", reason: `an accepted meeting proposal; ${NOT_A_TASK}` },
  "lib/pacing/relabel/handlers.ts#createTask": { from: "other", reason: `a relabel event (pacing); ${NOT_A_TASK}` },
  "lib/pacing/relabel/notify.ts#notifyRelabel": { from: "other", reason: `a relabel event (pacing); ${NOT_A_TASK}` },
}

function scanAll(): TaskCreate[] {
  return SOURCE_ROOTS.flatMap((r) => walk(path.join(ROOT, r))).flatMap((f) => findTaskCreates(rel(f), fs.readFileSync(f, "utf8")))
}

test("every writer that makes a task is listed with what it makes it from", () => {
  const found = new Set(scanAll().map((c) => c.key))
  assert.ok(found.size >= 10, `the scan found the writers (${found.size})`)
  const unlisted = [...found].filter((k) => !CREATORS[k])
  assert.deepEqual(unlisted, [], "a new task writer: if it copies a task, keep that task's project (C-211) and list it")
  const stale = Object.keys(CREATORS).filter((k) => !found.has(k))
  assert.deepEqual(stale, [], "stale entries")
})

test("each writer that copies a task names its Postgres pin, and the pin exists", () => {
  const pins = fs.readFileSync(path.join(ROOT, "lib/codex/__tests__/taskCopies.db.test.ts"), "utf8")
  for (const [key, entry] of Object.entries(CREATORS)) {
    if (entry.from === "other") continue
    const [file, title] = entry.pin.split(": ")
    assert.equal(file, "taskCopies.db.test.ts", key)
    assert.ok(pins.includes(`describe("${title}"`), `${key}: pin "${title}" is in taskCopies.db.test.ts`)
  }
})

test("the finder sees Drizzle inserts under any name, raw SQL inserts and createTask calls", () => {
  const src = [
    'import { tasks as t } from "@/db/schema"',
    "export async function a(db: any) { return db.insert(t).values({}) }",
    "export async function b(db: any) { return db.execute(sql`insert into public.tasks (title) values ('x')`) }",
    "export async function c(deps: any) { return deps.createTask({}) }",
    "export async function d(db: any) { return db.insert(taskComments).values({}) }",
  ].join("\n")
  assert.deepEqual(
    findTaskCreates("lib/probe/w.ts", src).map((c) => `${c.kind} ${c.key}`),
    ["insert lib/probe/w.ts#a", "insert lib/probe/w.ts#b", "createTask lib/probe/w.ts#c"]
  )
})
