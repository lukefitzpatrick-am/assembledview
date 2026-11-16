/**
 * Self-test for scripts/check-codex-task-writes.mjs (B44, C-200).
 * CAUGHT probes give a hit, ALLOWED probes none. KNOWN_GAPS pins what the
 * header says is not caught; if the guard learns one, move it to CAUGHT and
 * update the header. The planted tree proves the script exits 1 on a planted
 * import and 0 on the live tree.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  READ_EXPORTS,
  SERVER_EXCEPTIONS,
  SWITCH_ALLOWLIST,
  WRITE_HELPERS,
  findWriterExports,
  inZone,
  resolveSpecifier,
  scanFile,
  scanRoot,
} from "../check-codex-task-writes.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const script = path.resolve(here, "../check-codex-task-writes.mjs")

/** [relative path, source, expected rule] */
const CAUGHT = [
  ["components/pacing/X.tsx", `import { createTask } from "@/lib/codex/repo"`, "write-helper"],
  ["components/pacing/X.tsx", `import { listTasks, requestHelp as ask } from "@/lib/codex/repo"`, "write-helper"],
  ["lib/pacing/x.ts", `import { createTask } from "../codex/repo"`, "write-helper"],
  ["lib/pacing/x.ts", `import { createTask } from "@/lib/codex/repo.ts"`, "write-helper"],
  ["lib/pacing/x.ts", `import { createTask } from "@/lib/codex/repo.js"`, "write-helper"],
  ["lib/x.ts", `import {\n  listTasks,\n  updateTask,\n} from "@/lib/codex/repo"`, "write-helper"],
  ["lib/x.ts", `import * as repo from "@/lib/codex/repo"`, "write-module"],
  ["lib/x.ts", `import repo from "@/lib/codex/repo"`, "write-module"],
  ["lib/x.ts", `export { createTask } from "@/lib/codex/repo"`, "write-helper"],
  ["lib/x.ts", `export * from "@/lib/codex/projectsRepo"`, "write-module"],
  ["lib/x.ts", `export async function f() { const m = await import("@/lib/codex/repo"); return m }`, "write-module"],
  ["lib/x.ts", `export async function f() { const { createTask } = await import("@/lib/codex/repo"); return createTask }`, "write-helper"],
  ["lib/x.ts", `const r = require("@/lib/codex/collabRepo")`, "write-module"],
  ["lib/x.ts", `import { createSubtask } from "@/lib/codex/taskDetailRepo"`, "write-helper"],
  ["lib/x.ts", `import { followSectionRule } from "@/lib/codex/sectionSync"`, "write-helper"],
  ["lib/x.ts", `import { markProgressDone } from "@/lib/codex/progressRule"`, "write-helper"],
  ["lib/x.ts", `import { createCustomField } from "@/lib/codex/customFieldsRepo"`, "write-helper"],
  ["lib/x.ts", `import { runCodexRecurring } from "@/lib/codex/runRecurring"`, "write-helper"],
  ["lib/x.ts", `import { seedTasksForCampaign } from "@/lib/codex/seedTasks"`, "write-helper"],
  ["components/dashboard/X.tsx", `import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"`, "tasks-ui-import"],
  ["components/dashboard/X.tsx", `import { TaskAskHelpButton } from "../tasks/TaskAskHelpDialog"`, "tasks-ui-import"],
  ["components/dashboard/X.tsx", `import { Panel } from "@/components/codex/Panel"`, "tasks-ui-import"],
  ["app/pacing/page.tsx", `import { TasksComposeFromLink } from "@/components/tasks/TasksComposeFromLink"`, "tasks-ui-import"],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", { method: "POST", body })`, "fetch-write"],
  ["components/x/A.tsx", "fetch(`/api/codex/tasks/${id}`, { method: 'PATCH' })", "fetch-write"],
  ["components/x/A.tsx", "await fetch(`/api/codex/tasks/${id}/help`, {\n  method: \"POST\",\n  headers: {},\n})", "fetch-write"],
  ["components/x/A.tsx", `fetch("/api/codex/tasks/5", { method: "DELETE" })`, "fetch-write"],
  ["components/x/A.tsx", `fetch("/api/codex/projects/1/sections", { method: "post" })`, "fetch-write"],
  ["components/x/A.tsx", `const m = "POST"; fetch("/api/codex/tasks", { method: m })`, "fetch-write"],
  ["components/x/A.tsx", `postJson("/api/codex/tasks", body)`, "call-write"],
  ["components/x/A.tsx", `api.patch("/api/codex/tasks/1", body)`, "call-write"],
  ["components/x/A.tsx", `navigator.sendBeacon("/api/codex/tasks", body)`, "call-write"],
  ["components/x/A.tsx", `const url = "/api/codex/tasks"\nexport const go = () => fetch(url, { method: "POST" })`, "url-in-writing-file"],
  ["components/x/A.tsx", 'const url = `/api/codex/tasks/${id}`\nfetch(url, { method: "PUT" })', "url-in-writing-file"],
  ["components/x/A.tsx", `export const F = () => <form method="post" action="/api/codex/tasks" />`, "url-in-writing-file"],
  // B44fix R2: the method in an options variable, shorthand, a spread, or a constant with a URL variable.
  ["components/x/A.tsx", `const init = { method: "POST" }; fetch("/api/codex/tasks", init)`, "fetch-write"],
  ["components/x/A.tsx", `const init: RequestInit = {\n  method: "PATCH",\n  body,\n}\nexport const go = () => fetch("/api/codex/tasks/1", init)`, "fetch-write"],
  ["components/x/A.tsx", `const method = "POST"; fetch("/api/codex/tasks", { method, body })`, "fetch-write"],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", { ...POST_JSON, body })`, "fetch-write"],
  ["components/x/A.tsx", `const POST_JSON = { method: "POST" }; fetch("/api/codex/tasks", { ...POST_JSON, body })`, "fetch-write"],
  ["components/x/A.tsx", `const M = "POST"; const url = "/api/codex/tasks"; fetch(url, { method: M })`, "url-in-writing-file"],
  ["components/x/A.tsx", `const M = "POST"\nconst url = "/api/codex/tasks"\nexport const go = () => fetch(url, { method: M })`, "url-in-writing-file"],
  // Cannot be resolved here, so a literal Codex URL counts as a write.
  ["components/x/A.tsx", `export function go(init) { return fetch("/api/codex/tasks", init) }`, "fetch-write"],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", makeInit())`, "fetch-write"],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", { method: verb })`, "fetch-write"],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", { method: "GET", ...rest })`, "fetch-write"],
  ["components/x/A.tsx", `let init = { method: "GET" }; init = { method: "POST" }; fetch("/api/codex/tasks", init)`, "fetch-write"],
  ["components/x/A.tsx", `function a() { const init = {}; return init }\nfunction b() { const init = { method: "POST" }; return fetch("/api/codex/tasks", init) }`, "fetch-write"],
  ["components/x/A.tsx", `const url = "/api/codex/tasks"\nexport const go = (init) => fetch(url, init)`, "url-in-writing-file"],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", { "method": "POST" })`, "fetch-write"],
  ["components/x/A.tsx", `const r = new Request("/api/codex/tasks", { method: "POST" })`, "fetch-write"],
  // PACK4fix R5: a computed method key, an aliased fetch, and a Codex route handler imported from outside the zone.
  ["components/x/A.tsx", `fetch("/api/codex/tasks", { ["method"]: "POST" })`, "fetch-write"],
  ["components/x/A.tsx", "fetch(\"/api/codex/tasks\", { [`method`]: \"PATCH\" })", "fetch-write"],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", { [key]: value })`, "fetch-write"],
  ["components/x/A.tsx", `const M = "POST"\nconst opts = { method: M }\nconst f = fetch\nexport const go = () => f("/api/codex/tasks", opts)`, "fetch-write"],
  ["components/x/A.tsx", `const send = window.fetch.bind(window)\nexport const go = () => send("/api/codex/tasks", { method: verb })`, "fetch-write"],
  ["components/x/A.tsx", `const M = "POST"\nconst f = fetch\nconst url = "/api/codex/tasks"\nexport const go = () => f(url, { method: M })`, "url-in-writing-file"],
  ["lib/x.ts", `import { POST } from "@/app/api/codex/tasks/route"`, "codex-route-import"],
  ["app/api/cron/x/route.ts", `import { PATCH as patchTask } from "../../codex/tasks/[id]/route"`, "codex-route-import"],
  ["lib/x.ts", `const { POST } = require("@/app/api/codex/tasks/route")`, "codex-route-import"],
  ["lib/x.ts", `export async function f() { const route = await import("@/app/api/codex/tasks/bulk/route"); return route }`, "codex-route-import"],
  // A zone-looking name outside the zone is still outside.
  ["components/taskstuff/A.tsx", `import { createTask } from "@/lib/codex/repo"`, "write-helper"],
  ["app/pacing/tasks-ish/page.tsx", `import { createTask } from "@/lib/codex/repo"`, "write-helper"],
  // A server exception file importing a helper it is not named for.
  ["lib/pacing/relabel/handlers.ts", `import { createTask, softDeleteTask } from "@/lib/codex/repo"`, "write-helper"],
]

const ALLOWED = [
  ["components/x/A.tsx", `fetch("/api/codex/tasks?mba_number=X")`],
  ["components/x/A.tsx", "fetch(`/api/codex/tasks?${qs}`, { credentials: \"include\", cache: \"no-store\" })"],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", { method: "GET" })`],
  ["components/x/A.tsx", `fetch("/api/codex/time/summary").then(r => r.json()); fetch("/api/pacing/x", { method: "POST" })`],
  ["components/x/A.tsx", `// fetch("/api/codex/tasks", { method: "POST" })`],
  // B44fix R2: provably GET through a variable, shorthand or spread.
  ["components/x/A.tsx", `const init = { cache: "no-store" }; fetch("/api/codex/tasks", init)`],
  ["components/x/A.tsx", `const GET_OPTS = { method: "GET" } as const; fetch("/api/codex/tasks", { ...GET_OPTS, cache: "no-store" })`],
  ["components/x/A.tsx", `const method = "GET"; fetch("/api/codex/tasks", { method })`],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", { ...rest, method: "GET" })`],
  ["components/x/A.tsx", `fetch("/api/codex/tasks", undefined)`],
  ["components/x/A.tsx", `const methodName = "x"; fetch("/api/codex/tasks", { methodName, signal })`],
  ["components/x/A.tsx", `const url = "/api/codex/tasks"\nexport const go = () => fetch(url, { cache: "no-store" })`],
  ["components/x/A.tsx", `/* import { createTask } from "@/lib/codex/repo" */`],
  // PACK4fix R5: an aliased fetch that is provably GET, a literal computed key that is not the method, a type from a route.
  ["components/x/A.tsx", `const f = fetch\nexport const go = () => f("/api/codex/tasks", { ["cache"]: "no-store" })`],
  ["components/x/A.tsx", `const f = fetch; f("/api/codex/tasks")`],
  ["lib/x.ts", `import type { RouteContext } from "@/app/api/codex/tasks/[id]/route"`],
  ["app/api/codex/tasks/bulk/route.ts", `import { PATCH } from "../[id]/route"`],
  ["lib/x.ts", `import { listTasks, getTask } from "@/lib/codex/repo"`],
  ["lib/x.ts", `import type { CodexTask } from "@/lib/codex/types"`],
  ["lib/x.ts", `import { type createTask } from "@/lib/codex/repo"`],
  ["lib/x.ts", `import type { createTask } from "@/lib/codex/repo"`],
  ["lib/x.ts", `import { taskVisibilityCondition } from "@/lib/codex/taskVisibility"`],
  ["lib/x.ts", `import { sydneyCivilParts } from "@/lib/codex/quickAddParse"`],
  ["lib/x.ts", `export async function f() { const { primaryEmailFor } = await import("@/lib/codex/collabRepo"); return primaryEmailFor }`],
  ["lib/x.ts", `import { buildTasksComposeHref } from "@/lib/codex/composeLink"`],
  ["components/x/A.tsx", `export const L = () => <a href="/tasks?compose=task">New task in Tasks</a>`],
  // The zone writes freely.
  ["app/tasks/TasksPageClient.tsx", `import { createTask } from "@/lib/codex/repo"; fetch("/api/codex/tasks", { method: "POST" })`],
  ["app/(app)/tasks/page.tsx", `import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"`],
  ["components/tasks/X.tsx", `fetch("/api/codex/tasks", { method: "POST" })`],
  ["components/codex/X.tsx", `fetch("/api/codex/tasks", { method: "POST" })`],
  ["app/api/codex/tasks/route.ts", `import { createTask } from "@/lib/codex/repo"`],
  ["lib/codex/runRecurring.ts", `import { createGeneratedRecurringTask } from "@/lib/codex/repo"`],
  // Tests are not scanned.
  ["components/x/__tests__/A.test.tsx", `fetch("/api/codex/tasks", { method: "POST" })`],
  ["lib/x.test.ts", `import { createTask } from "@/lib/codex/repo"`],
]

/** Not caught today (the header lists them). */
const KNOWN_GAPS = [
  ["components/x/A.tsx", `fetch("/api/" + "codex/tasks", { method: "POST" })`],
  ["components/x/A.tsx", `import { go } from "./sender"; go("/api/codex/tasks")`],
  ["components/x/A.tsx", `const x = new XMLHttpRequest(); x.open("POST", "/api/codex/tasks")`],
  // A file-level const shadowed by a parameter of the same name reads as the const.
  ["components/x/A.tsx", `const init = { cache: "no-store" }\nexport function go(init) { return fetch("/api/codex/tasks", init) }`],
]

test("every CAUGHT probe gives its hit", () => {
  for (const [rel, src, rule] of CAUGHT) {
    const hits = scanFile(rel, src)
    assert.ok(
      hits.some((h) => h.rule === rule),
      `${rel}: ${JSON.stringify(src)} should give ${rule}, got ${JSON.stringify(hits)}`,
    )
  }
})

test("no ALLOWED probe gives a hit", () => {
  for (const [rel, src] of ALLOWED) {
    assert.deepEqual(scanFile(rel, src), [], `${rel}: ${JSON.stringify(src)}`)
  }
})

test("KNOWN_GAPS stay gaps (move one to CAUGHT when the guard learns it)", () => {
  for (const [rel, src] of KNOWN_GAPS) {
    assert.deepEqual(scanFile(rel, src), [], `${rel}: ${JSON.stringify(src)}`)
  }
})

test("zone and resolver", () => {
  for (const p of ["app/tasks/page.tsx", "app/tasks/[id]/page.tsx", "app/(shell)/tasks/x.tsx", "components/tasks/A.tsx", "components/codex/A.tsx", "app/api/codex/tasks/route.ts", "lib/codex/repo.ts"]) {
    assert.equal(inZone(p), true, p)
  }
  for (const p of ["app/pacing/page.tsx", "components/pacing/detail/CampaignAskHelpDialog.tsx", "lib/pacing/relabel/handlers.ts", "app/api/cron/codex-recurring/route.ts", "app/taskstuff/x.tsx", "components/tasksx/A.tsx"]) {
    assert.equal(inZone(p), false, p)
  }
  assert.equal(resolveSpecifier("lib/pacing/relabel/handlers.ts", "../../codex/repo"), "lib/codex/repo")
  assert.equal(resolveSpecifier("components/pacing/x.tsx", "@/lib/codex/repo.ts"), "lib/codex/repo")
  assert.equal(resolveSpecifier("components/pacing/x.tsx", "react"), null)
})

/** Exported values of a module: functions, consts and classes (types are not values). */
function exportedValues(src) {
  return [...src.matchAll(/^export (?:default )?(?:async )?(?:function\*? |const |let |var |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
}

function unclassifiedWriters(found) {
  const missing = []
  for (const [mod, names] of Object.entries(found)) {
    for (const n of names) if (!(WRITE_HELPERS[mod] ?? []).includes(n)) missing.push(`${mod}#${n}`)
  }
  return missing.sort()
}

test("every module under lib/codex that writes rows is in WRITE_HELPERS, with each writer listed (B44fix R3)", () => {
  const found = findWriterExports(repo)
  assert.deepEqual(unclassifiedWriters(found), [], "list these in WRITE_HELPERS (and any outside caller as a named server exception)")
  // The detector sees the writers the review named.
  assert.ok(found["lib/codex/notify"]?.includes("writeNotifications"), JSON.stringify(found["lib/codex/notify"]))
  for (const n of ["createTemplate", "deleteTemplate", "createTeamMember", "updateTeamMember"]) {
    assert.ok(found["lib/codex/repo"]?.includes(n), n)
    assert.ok(WRITE_HELPERS["lib/codex/repo"].includes(n), n)
    assert.ok(!READ_EXPORTS["lib/codex/repo"].includes(n), n)
  }
})

test("a new writing module or writer under lib/codex fails until it is classified (B44fix R3)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-writers-"))
  try {
    fs.mkdirSync(path.join(dir, "lib/codex"), { recursive: true })
    const put = (rel, src) => fs.writeFileSync(path.join(dir, rel), src)
    put("lib/codex/repo.ts", 'import { db } from "@/db"\nexport async function createTask(x) {\n  return db.insert(tasks).values(x).returning()\n}\nexport function listTasks() {\n  return db.select()\n}\n')
    put("lib/codex/newDrizzle.ts", 'export async function archiveThing(tx, id) {\n  await tx\n    .update(things)\n    .set({ archived: true })\n    .where(eq(things.id, id))\n}\nexport const LIMIT = 5\n')
    put("lib/codex/newSql.ts", "export async function purge(db) {\n  await db.execute(sql`DELETE FROM public.codex_x WHERE id = 1`)\n}\n")
    put("lib/codex/newCaller.ts", 'import { createTask as make } from "./repo"\nasync function inner(x) {\n  return make(x)\n}\nexport async function quickAdd(x) {\n  return inner(x)\n}\nexport function readOnly() {\n  return 1\n}\n')
    put("lib/codex/newDynamic.ts", 'export async function later(x) {\n  const { createTask } = await import("@/lib/codex/repo")\n  return createTask(x)\n}\n')
    // PACK4fix R4: a caller declared before the function it calls (needs a second pass of the fixed point),
    // and a module whose only write is a Drizzle delete.
    put("lib/codex/newChain.ts", 'export async function outer(x) {\n  return middle(x)\n}\nasync function middle(x) {\n  return inner(x)\n}\nasync function inner(x) {\n  return make(x)\n}\nimport { createTask as make } from "./repo"\n')
    put("lib/codex/newDelete.ts", 'export async function removeThing(db, id) {\n  await db.delete(things).where(eq(things.id, id))\n}\n')
    // PACK4fix R5: a list export (also under another name), lowercase SQL, UPDATE ONLY, an indented export.
    put("lib/codex/newList.ts", "async function archive(db) {\n  await db.execute(sql`update public.tasks set title = 'x'`)\n}\nasync function wipe(db) {\n  await db.execute(sql`UPDATE ONLY public.tasks SET title = 'y'`)\n}\nexport function readOnly() {\n  return 1\n}\nexport { archive, wipe as purgeAll, readOnly as alsoRead }\n")
    put("lib/codex/newIndent.ts", "  export async function indented(db) {\n    await db.insert(things).values({})\n  }\n")
    put("lib/codex/notWrites.ts", 'export function strip(qs) {\n  qs.delete("task")\n  seen.delete(id)\n  return qs\n}\n')
    const found = findWriterExports(dir)
    assert.deepEqual(unclassifiedWriters(found), [
      "lib/codex/newCaller#quickAdd",
      "lib/codex/newChain#outer",
      "lib/codex/newDelete#removeThing",
      "lib/codex/newDrizzle#archiveThing",
      "lib/codex/newDynamic#later",
      "lib/codex/newIndent#indented",
      "lib/codex/newList#archive",
      "lib/codex/newList#purgeAll",
      "lib/codex/newSql#purge",
    ])
    assert.equal(found["lib/codex/notWrites"], undefined)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/** Not found by the writer detector today (the header lists them). */
const DETECTOR_GAPS = {
  // A top-level declaration indented without `export`, before any other declaration: no declaration holds it.
  "lib/codex/gapIndent.ts": "  async function helper(db) {\n    await db.insert(things).values({})\n  }\nexport async function outer(db) {\n  return helper(db)\n}\n",
  // A re-export of a writer from another module under lib/codex.
  "lib/codex/gapReexport.ts": 'export { createTask as make } from "./repo"\n',
}

test("DETECTOR_GAPS stay gaps (move one into the planted tree when the detector learns it) (PACK4fix R5)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-writer-gaps-"))
  try {
    fs.mkdirSync(path.join(dir, "lib/codex"), { recursive: true })
    fs.writeFileSync(path.join(dir, "lib/codex/repo.ts"), 'export async function createTask(db, x) {\n  return db.insert(tasks).values(x).returning()\n}\n')
    for (const [rel, src] of Object.entries(DETECTOR_GAPS)) fs.writeFileSync(path.join(dir, rel), src)
    const found = findWriterExports(dir)
    assert.deepEqual(found["lib/codex/repo"], ["createTask"])
    for (const rel of Object.keys(DETECTOR_GAPS)) assert.equal(found[rel.replace(/\.ts$/, "")], undefined, rel)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("every export of a write module is classified as write or read (a new helper must be listed)", () => {
  for (const [mod, writes] of Object.entries(WRITE_HELPERS)) {
    const src = fs.readFileSync(path.join(repo, `${mod}.ts`), "utf8")
    const exported = exportedValues(src)
    const reads = READ_EXPORTS[mod] ?? []
    const unclassified = exported.filter((n) => !writes.includes(n) && !reads.includes(n))
    assert.deepEqual(unclassified, [], `${mod}: classify these exports in WRITE_HELPERS or READ_EXPORTS`)
    const stale = [...writes, ...reads].filter((n) => !exported.includes(n))
    assert.deepEqual(stale, [], `${mod}: stale names`)
    const both = writes.filter((n) => reads.includes(n))
    assert.deepEqual(both, [], `${mod}: listed twice`)
  }
})

test("the named exceptions and the C-200 allowlist are the ones the brief names", () => {
  assert.deepEqual(
    SERVER_EXCEPTIONS.map((e) => e.file),
    [
      "lib/pacing/relabel/handlers.ts",
      "lib/pacing/relabel/autoClose.ts",
      "lib/fireflies/proposalRepo.ts",
      "app/api/cron/codex-recurring/route.ts",
      // B44fix R3: the roster and notification writers, now classified.
      "lib/auth0.ts",
      "app/api/cron/auth0-roster-sync/route.ts",
      "app/api/admin/auth0-roster-sync/route.ts",
      "app/api/cron/codex-notifications/route.ts",
    ],
  )
  assert.deepEqual(
    SWITCH_ALLOWLIST.map((a) => a.file),
    [
      "components/pacing/detail/CampaignAskHelpDialog.tsx",
      "components/pacing/scenario/ScenarioPlannerContext.tsx",
      "components/pacing/scenario/ScenarioPlannerDrawer.tsx",
      "components/creative/CreativeAdminLanding.tsx",
    ],
  )
})

test("the live tree passes", () => {
  assert.deepEqual(scanRoot(repo), [])
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /check:codex-task-writes ok \(8 server exceptions, 4 C-200 switch allowlist entries\)/)
})

function plantedTree(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-writes-"))
  const copy = (rel) => {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true })
    fs.copyFileSync(path.join(repo, rel), path.join(dir, rel))
  }
  const seen = new Set()
  const once = (rel) => {
    if (!seen.has(rel)) copy(rel)
    seen.add(rel)
  }
  for (const e of SERVER_EXCEPTIONS) {
    once(e.file)
    for (const callers of Object.values(e.writers)) if (callers !== "any") callers.forEach(once)
  }
  for (const a of SWITCH_ALLOWLIST) copy(a.file)
  copy("lib/features/registry.ts")
  for (const [rel, src] of Object.entries(extra)) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), src)
  }
  return dir
}

test("a planted import fails the script; the same tree without it passes", () => {
  const clean = plantedTree({})
  const planted = plantedTree({
    "components/dashboard/QuickTask.tsx": `import { createTask } from "@/lib/codex/repo"\nexport const x = createTask\n`,
    "components/pacing/Help.tsx": "export const go = (id: number) => fetch(`/api/codex/tasks/${id}/help`, { method: \"POST\" })\n",
  })
  try {
    const ok = spawnSync(process.execPath, [script, "--root", clean], { encoding: "utf8" })
    assert.equal(ok.status, 0, ok.stderr)
    const bad = spawnSync(process.execPath, [script, "--root", planted], { encoding: "utf8" })
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /components\/dashboard\/QuickTask\.tsx:1 write-helper: createTask from lib\/codex\/repo/)
    assert.match(bad.stderr, /components\/pacing\/Help\.tsx:1 fetch-write: POST \/api\/codex\/tasks\/\$\{id\}\/help/)
    assert.match(bad.stderr, /2 problem\(s\)/)
  } finally {
    fs.rmSync(clean, { recursive: true, force: true })
    fs.rmSync(planted, { recursive: true, force: true })
  }
})

test("a server exception allows only its named helpers", () => {
  const dir = plantedTree({})
  try {
    const rel = "lib/pacing/relabel/handlers.ts"
    const src = fs.readFileSync(path.join(dir, rel), "utf8")
    assert.match(src, /import \{ createTask \} from "@\/lib\/codex\/repo"/)
    fs.writeFileSync(path.join(dir, rel), src.replace('import { createTask } from "@/lib/codex/repo"', 'import { createTask, softDeleteTask } from "@/lib/codex/repo"'))
    const problems = scanRoot(dir)
    assert.deepEqual(problems.filter((p) => p.startsWith(rel)), [`${rel}:5 write-helper: softDeleteTask from lib/codex/repo`])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("a stale allowlist entry or exception fails, and the allowlist cannot outlive its switch", () => {
  const dir = plantedTree({})
  try {
    // The creative landing stops importing the dialog: its entry is stale.
    const rel = "components/creative/CreativeAdminLanding.tsx"
    const src = fs.readFileSync(path.join(dir, rel), "utf8").replace(/import \{ TaskFormDialog \} from "@\/components\/tasks\/TaskFormDialog"\n/, "")
    fs.writeFileSync(path.join(dir, rel), src)
    fs.rmSync(path.join(dir, "app/api/cron/codex-recurring/route.ts"))
    const problems = scanRoot(dir)
    assert.ok(problems.some((p) => p.startsWith("stale C-200 allowlist entry: components/creative/CreativeAdminLanding.tsx")), problems.join("\n"))
    assert.ok(problems.some((p) => p === "stale server exception: app/api/cron/codex-recurring/route.ts no longer imports runCodexRecurring"), problems.join("\n"))

    const gone = scanRoot(dir, { registrySource: "export const FEATURE_DEFINITIONS = []" })
    assert.ok(gone.some((p) => p.includes("the C-200 allowlist outlived its switch")), gone.join("\n"))
    assert.ok(!scanRoot(dir).some((p) => p.includes("outlived")), "the real registry still has the switch")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("every export of an exception file that writes is listed in its writers, with no stale names (B44fix R4)", () => {
  const found = findWriterExports(
    repo,
    SERVER_EXCEPTIONS.map((e) => e.file),
  )
  for (const e of SERVER_EXCEPTIONS) {
    const mod = e.file.replace(/\.(ts|tsx)$/, "")
    const writers = found[mod] ?? []
    const missing = writers.filter((n) => !(n in e.writers))
    assert.deepEqual(missing, [], `${e.file}: list these exports in writers with their callers`)
    const exported = exportedValues(fs.readFileSync(path.join(repo, e.file), "utf8"))
    const stale = Object.keys(e.writers).filter((n) => !exported.includes(n))
    assert.deepEqual(stale, [], `${e.file}: stale writer names`)
  }
  // The writers the review named are pinned to their callers.
  const fireflies = SERVER_EXCEPTIONS.find((e) => e.file === "lib/fireflies/proposalRepo.ts")
  assert.deepEqual(fireflies.writers.acceptProposal, ["app/api/codex/proposals/[id]/accept/route.ts"])
  assert.deepEqual(fireflies.writers.batchAcceptForNote, ["app/api/codex/proposals/route.ts"])
  const relabel = SERVER_EXCEPTIONS.find((e) => e.file === "lib/pacing/relabel/handlers.ts")
  assert.deepEqual(relabel.writers.runRelabelApply, ["app/api/pacing/relabels/apply/route.ts"])
})

test("an exception's writer imported by anything but its named callers fails, in the zone too (B44fix R4)", () => {
  const dir = plantedTree({
    "components/pacing/Accept.tsx": `import { acceptProposal } from "@/lib/fireflies/proposalRepo"\nexport const a = acceptProposal\n`,
    "app/api/codex/proposals/other/route.ts": `import { batchAcceptForNote, listProposedInbox } from "@/lib/fireflies/proposalRepo"\nexport const b = [batchAcceptForNote, listProposedInbox]\n`,
    "lib/x/relabel.ts": `import * as relabel from "../pacing/relabel/handlers"\nexport const r = relabel\n`,
    "lib/x/close.ts": `export async function f() { const { runCloseUntouchedRelabelTasks: go } = await import("@/lib/pacing/relabel/autoClose"); return go }\n`,
    "lib/x/ok.ts": `import { listProposedInbox } from "@/lib/fireflies/proposalRepo"\nimport { auth0 } from "@/lib/auth0"\nexport const ok = [listProposedInbox, auth0]\n`,
    "lib/x/cron.ts": `import { GET } from "@/app/api/cron/codex-recurring/route"\nexport const g = GET\n`,
  })
  try {
    const problems = scanRoot(dir)
    const of = (rel) => problems.filter((p) => p.startsWith(rel))
    assert.deepEqual(of("components/pacing/Accept.tsx"), [
      "components/pacing/Accept.tsx:1 exception-writer-import: acceptProposal from lib/fireflies/proposalRepo.ts (only its named callers may import it)",
    ])
    assert.deepEqual(of("app/api/codex/proposals/other/route.ts"), [
      "app/api/codex/proposals/other/route.ts:1 exception-writer-import: batchAcceptForNote from lib/fireflies/proposalRepo.ts (only its named callers may import it)",
    ])
    assert.equal(of("lib/x/relabel.ts").length, 6, of("lib/x/relabel.ts").join("\n"))
    assert.match(of("lib/x/close.ts").join("\n"), /runCloseUntouchedRelabelTasks from lib\/pacing\/relabel\/autoClose\.ts/)
    assert.deepEqual(of("lib/x/ok.ts"), [])
    assert.match(of("lib/x/cron.ts").join("\n"), /GET from app\/api\/cron\/codex-recurring\/route\.ts/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("a named caller that stops importing its writer is stale (B44fix R4)", () => {
  const dir = plantedTree({})
  try {
    const rel = "app/api/pacing/relabels/apply/route.ts"
    const src = fs.readFileSync(path.join(dir, rel), "utf8")
    assert.match(src, /import \{ runRelabelApply \} from "@\/lib\/pacing\/relabel\/handlers"/)
    fs.writeFileSync(path.join(dir, rel), src.replace(/import \{ runRelabelApply \} from "@\/lib\/pacing\/relabel\/handlers"\n/, ""))
    assert.deepEqual(
      scanRoot(dir).filter((p) => p.startsWith("stale named caller")),
      ["stale named caller: app/api/pacing/relabels/apply/route.ts no longer imports runRelabelApply from lib/pacing/relabel/handlers.ts"],
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
