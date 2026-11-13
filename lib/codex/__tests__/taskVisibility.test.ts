/**
 * B42 (C-211): one visibility rule for every task read. A static check over
 * the source: every module that reads the `tasks` table is listed here with
 * how it keeps private projects private, so a new reader fails this test
 * until someone decides. Ava never reads tasks at all.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

const ROOT = process.cwd()
const TASK_READ = /schema\.tasks\b|from\(tasks\)|public\.tasks\b|FROM tasks\b|JOIN tasks\b|join\(tasks/

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/")

/** Readers that apply the shared SQL rule (`lib/codex/taskVisibility.ts`). */
const USES_SHARED_RULE = [
  "lib/codex/repo.ts",
  "lib/codex/searchRepo.ts",
  "lib/codex/notificationsRepo.ts",
  "lib/myhours/timeSummary.ts",
  "lib/fireflies/proposalRepo.ts",
  "lib/clients/listClientMeetings.ts",
  "lib/pacing/detail/notes.ts",
]

/** Readers inside one project, after its visibility check (`loadVisibleProject` / `canSeeProject` / `canSeeTask`). */
const PROJECT_SCOPED = ["lib/codex/projectsRepo.ts", "lib/codex/taskDetailRepo.ts", "lib/codex/customFieldsRepo.ts", "lib/codex/notify.ts"]

/** Not a read for a person: the rule itself, a helper given the rule by its caller, and system writers. */
const NOT_A_PERSON_READ = [
  "lib/codex/taskVisibility.ts",
  "lib/codex/estimatedMinutesColumn.ts",
  "lib/codex/seedTasks.ts",
  "lib/codex/sectionSync.ts",
  "lib/pacing/relabel/autoClose.ts",
]

test("every module that reads tasks is classified, and applies the rule it is classified under", () => {
  const readers = [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))]
    .filter((f) => TASK_READ.test(fs.readFileSync(f, "utf8")))
    .map(rel)
    .sort()
  const known = [...USES_SHARED_RULE, ...PROJECT_SCOPED, ...NOT_A_PERSON_READ].sort()
  assert.deepEqual(readers, known, "a new tasks reader: apply taskVisibility (C-211) and list it here")
  for (const f of USES_SHARED_RULE) {
    assert.match(fs.readFileSync(path.join(ROOT, f), "utf8"), /@\/lib\/codex\/taskVisibility/, f)
  }
  for (const f of PROJECT_SCOPED) {
    assert.match(fs.readFileSync(path.join(ROOT, f), "utf8"), /loadVisibleProject|canSeeProject|canSeeTask/, f)
  }
})

test("Ava never reads tasks, task comments or Codex stores", () => {
  const ava = [...walk(path.join(ROOT, "lib/ava")), ...walk(path.join(ROOT, "app/api/ava"))]
  assert.ok(ava.length > 10, "the Ava sources were found")
  const forbidden = /schema\.tasks\b|schema\.taskComments\b|public\.tasks\b|FROM tasks\b|@\/lib\/codex\/(repo|searchRepo|projectsRepo|taskDetailRepo|collabRepo|notificationsRepo)\b/
  const hits = ava.filter((f) => forbidden.test(fs.readFileSync(f, "utf8"))).map(rel)
  assert.deepEqual(hits, [])
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
