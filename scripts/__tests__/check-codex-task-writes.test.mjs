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

test("every export of a write module is classified as write or read (a new helper must be listed)", () => {
  for (const [mod, writes] of Object.entries(WRITE_HELPERS)) {
    const src = fs.readFileSync(path.join(repo, `${mod}.ts`), "utf8")
    const exported = [...src.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)|^export const ([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/gm)].map(
      (m) => m[1] ?? m[2],
    )
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
    ["lib/pacing/relabel/handlers.ts", "lib/pacing/relabel/autoClose.ts", "lib/fireflies/proposalRepo.ts", "app/api/cron/codex-recurring/route.ts"],
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
  assert.match(run.stdout, /check:codex-task-writes ok \(4 server exceptions, 4 C-200 switch allowlist entries\)/)
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
