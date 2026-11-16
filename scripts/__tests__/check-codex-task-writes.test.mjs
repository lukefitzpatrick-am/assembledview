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

import { maskNonCode } from "../check-egress-guards.mjs"
import {
  READ_EXPORTS,
  SERVER_EXCEPTIONS,
  SWITCH_ALLOWLIST,
  WRITE_HELPERS,
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

const DRIZZLE_WRITE = /\.(insert|update|delete)\(\s*[A-Za-z_$][\w$.]*\s*\)\s*\.\s*(values|set|where|returning|onConflict\w*)\s*\(/
const SQL_WRITE = /\b(INSERT\s+INTO|UPDATE\s+[\w."]+\s+SET|DELETE\s+FROM)\b/

/**
 * B44fix R3: every exported value under `lib/codex` that writes rows, by
 * module (no extension). A top-level declaration writes when its text runs a
 * Drizzle insert, update or delete, or raw INSERT / UPDATE / DELETE SQL, or
 * names another declaration that writes (same file, or imported by name,
 * statically or with `const { x } = await import(...)`), to a fixed point.
 * A lower bound: a write through an injected store is listed by hand.
 */
function codexWriterExports(rootDir) {
  const walkTs = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__tests__") continue
      const f = path.join(dir, e.name)
      if (e.isDirectory()) walkTs(f, out)
      else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(f)
    }
    return out
  }
  const mods = {}
  for (const f of walkTs(path.join(rootDir, "lib/codex"))) {
    const rel = path.relative(rootDir, f).split(path.sep).join("/").replace(/\.tsx?$/, "")
    const raw = fs.readFileSync(f, "utf8")
    const full = maskNonCode(raw, { keepStrings: true })
    const code = maskNonCode(raw)
    const lines = full.split("\n")
    const starts = []
    let off = 0
    for (const ln of lines) {
      starts.push(off)
      off += ln.length + 1
    }
    const bounds = []
    lines.forEach((ln, i) => {
      if (/^[A-Za-z@]/.test(ln)) bounds.push(i)
    })
    const decls = []
    bounds.forEach((i, k) => {
      const m = lines[i].match(/^(export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|var\s+|class\s+)([A-Za-z_$][\w$]*)/)
      if (!m) return
      decls.push({ name: m[2], exported: Boolean(m[1]), a: starts[i], b: k + 1 < bounds.length ? starts[bounds[k + 1]] : full.length })
    })
    const imports = {}
    const addNames = (list, spec) => {
      const target = spec.startsWith("@/")
        ? spec.slice(2)
        : spec.startsWith(".")
          ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec))
          : null
      if (!target) return
      for (const part of list.split(",")) {
        const t = part.trim()
        if (!t || t.startsWith("type ")) continue
        const [orig, local] = t.split(/\s+as\s+|\s*:\s*/).map((x) => x.trim())
        imports[local || orig] = `${target.replace(/\.(ts|tsx|js)$/, "")}#${orig}`
      }
    }
    for (const m of full.matchAll(/\bimport\s+(?!type\s)\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) addNames(m[1], m[2])
    for (const m of full.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s*)?import\s*\(\s*["']([^"']+)["']\s*\)/g)) addNames(m[1], m[2])
    mods[rel] = { full, code, decls, imports }
  }
  const writes = new Set()
  for (const [rel, m] of Object.entries(mods)) {
    for (const d of m.decls) {
      const text = m.full.slice(d.a, d.b)
      if (DRIZZLE_WRITE.test(text) || SQL_WRITE.test(text)) writes.add(`${rel}#${d.name}`)
    }
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const [rel, m] of Object.entries(mods)) {
      for (const d of m.decls) {
        if (writes.has(`${rel}#${d.name}`)) continue
        const ids = new Set(m.code.slice(d.a, d.b).match(/[A-Za-z_$][\w$]*/g) ?? [])
        ids.delete(d.name)
        const hit = [...ids].some((id) => writes.has(`${rel}#${id}`) || (m.imports[id] && writes.has(m.imports[id])))
        if (hit) {
          writes.add(`${rel}#${d.name}`)
          changed = true
        }
      }
    }
  }
  const out = {}
  for (const key of writes) {
    const [mod, name] = key.split("#")
    if (mods[mod].decls.some((d) => d.name === name && d.exported)) (out[mod] ??= []).push(name)
  }
  return out
}

function unclassifiedWriters(found) {
  const missing = []
  for (const [mod, names] of Object.entries(found)) {
    for (const n of names) if (!(WRITE_HELPERS[mod] ?? []).includes(n)) missing.push(`${mod}#${n}`)
  }
  return missing.sort()
}

test("every module under lib/codex that writes rows is in WRITE_HELPERS, with each writer listed (B44fix R3)", () => {
  const found = codexWriterExports(repo)
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
    put("lib/codex/notWrites.ts", 'export function strip(qs) {\n  qs.delete("task")\n  seen.delete(id)\n  return qs\n}\n')
    const found = codexWriterExports(dir)
    assert.deepEqual(unclassifiedWriters(found), [
      "lib/codex/newCaller#quickAdd",
      "lib/codex/newDrizzle#archiveThing",
      "lib/codex/newDynamic#later",
      "lib/codex/newSql#purge",
    ])
    assert.equal(found["lib/codex/notWrites"], undefined)
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
  for (const e of SERVER_EXCEPTIONS) copy(e.file)
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
