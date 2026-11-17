/**
 * Self-test for the C-200 lint boundary (scripts/codex-boundary.mjs, S32 A,
 * B51). Each planted shape fails on its line, the allowed shapes pass, every
 * named allowance is still needed, and the switch allowlist cannot outlive
 * its switch. GAPS pins what lint does not catch (KNOWN-ISSUES C-285).
 * ESLint runs as a process (`eslint` is not a listed dependency).
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { isFeatureKey } from "../../lib/features/registry.ts"
import { CODEX_SERVER_WRITERS, CODEX_SWITCH_ALLOWLIST, CODEX_URL_SELECTORS, codexZones, inCodexZone } from "../codex-boundary.mjs"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const RULES = new Set(["import/no-restricted-paths", "no-restricted-syntax"])

/** ESLint over `args`; the Codex rule hits per file (repo path to sorted lines). */
function eslint(args, input) {
  const run = spawnSync(path.join(repo, "node_modules/.bin/eslint"), ["--format", "json", "--no-warn-ignored", ...args], { cwd: repo, input, encoding: "utf8", maxBuffer: 1 << 26 })
  assert.ok(run.stdout, run.stderr)
  const out = {}
  for (const r of JSON.parse(run.stdout)) {
    assert.deepEqual(r.messages.filter((m) => m.fatal), [], r.filePath)
    out[path.relative(repo, r.filePath)] = [...new Set(r.messages.filter((m) => RULES.has(m.ruleId)).map((m) => m.line))].sort((a, b) => a - b)
  }
  return out
}
/** Lines of `lines` (one shape each) that fail when linted as `file`. */
const failing = (file, lines) => eslint(["--stdin", "--stdin-filename", file], lines.join("\n"))[file]
const each = (lines) => lines.map((_, i) => i + 1)

const PLANTED = [
  'import { createTask } from "@/lib/codex/repo"',
  'import { updateTask } from "../../lib/codex/repo"',
  'import * as projects from "@/lib/codex/projectsRepo"',
  'import repo from "@/lib/codex/repo"',
  'export { softDeleteTask } from "@/lib/codex/repo"',
  'export * from "@/lib/codex/collabRepo"',
  'export const later = () => import("@/lib/codex/repo")',
  'export const req = require("@/lib/codex/collabRepo")',
  'import { listTeamWorkload } from "@/lib/codex/workloadRepo"',
  'import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"',
  'import { POST } from "@/app/api/codex/tasks/route"',
  'import type { RouteContext } from "@/app/api/codex/tasks/[id]/route"',
  'export const a = () => fetch("/api/codex/tasks", { method: "POST" })',
  "export const b = (id: number) => fetch(`/api/codex/tasks/${id}/help`, { method: 'PATCH' })",
  'export const c = () => navigator.sendBeacon("/api/codex/tasks")',
  'const url = "/api/codex/tasks"',
  'export const F = () => <form method="post" action="/api/codex/tasks" />',
  'export const r = new Request("/api/codex/tasks", { method: "POST" })',
  'export const api = { f: fetch }; export const d = () => api.f("/api/codex/tasks", { method: "POST" })',
  'export const x = () => new XMLHttpRequest().open("POST", "/api/codex/tasks")',
  'export const g = () => fetch("/api/codex/tasks?mba_number=X")',
  'export const h = () => fetch("/api/codex" + "/tasks", { method: "POST" })',
]
const ALLOWED = [
  'import { taskVisibilityCondition } from "@/lib/codex/taskVisibility"',
  'import { buildTasksComposeHref } from "@/lib/codex/composeLink"',
  'import { codexGet } from "@/lib/codex/readFetch"',
  'import { statusMeta, type CodexTask } from "@/lib/codex/types"',
  'export const go = () => codexGet("tasks?mba_number=X")',
  '// fetch("/api/codex/tasks", { method: "POST" })',
  'export const L = () => <a href="/tasks?compose=task">New task in Tasks</a>',
  'export const v = "/api/codexy"',
]
/** Not caught by lint (C-285). Move a line to PLANTED when the boundary learns it. */
const GAPS = [
  'export const h = () => fetch("/api/" + "codex/tasks", { method: "POST" })',
  'export const j = () => fetch(["", "api", "codex", "tasks"].join("/"), { method: "POST" })',
  'const spec = "@/lib/codex/" + "repo"; export const k = () => import(spec)',
]

test("every planted shape fails on its line outside the zone", () => {
  assert.deepEqual(failing("components/pacing/Probe.tsx", PLANTED), each(PLANTED))
  assert.deepEqual(failing("lib/pacing/probe.ts", PLANTED.filter((l) => !l.includes("<form"))), each(PLANTED.filter((l) => !l.includes("<form"))))
})

test("allowed shapes, the zone and tests pass; the gaps stay gaps", () => {
  assert.deepEqual(failing("components/pacing/Probe.tsx", ALLOWED), [])
  assert.deepEqual(failing("components/pacing/Probe.tsx", GAPS), [])
  assert.deepEqual(failing("app/tasks/Probe.tsx", PLANTED.slice(0, 11)), [])
  assert.deepEqual(failing("components/tasks/Probe.tsx", PLANTED.slice(12)), [])
  assert.deepEqual(failing("components/pacing/__tests__/Probe.test.tsx", PLANTED), [])
})

test("a named writer may import only its own modules, and only its callers may import it", () => {
  const fireflies = ['import { createTask, softDeleteTask } from "@/lib/codex/repo"', 'import { createProject } from "@/lib/codex/projectsRepo"']
  assert.deepEqual(failing("lib/fireflies/proposalRepo.ts", fireflies), [2])
  const callers = ['import { acceptProposal } from "@/lib/fireflies/proposalRepo"', 'import { auth0 } from "@/lib/auth0"', 'import { GET } from "@/app/api/cron/codex-recurring/route"']
  assert.deepEqual(failing("components/pacing/Accept.tsx", callers), [1, 3])
  assert.deepEqual(failing("app/api/codex/proposals/other/route.ts", callers), [1, 3])
  assert.deepEqual(failing("app/api/codex/proposals/[id]/dismiss/route.ts", callers), [3])
  const relabel = ['import { runRelabelList } from "@/lib/pacing/relabel/handlers"', 'import { runCloseUntouchedRelabelTasks } from "@/lib/pacing/relabel/autoClose"']
  assert.deepEqual(failing("app/api/pacing/relabels/route.ts", relabel), [2])
})

test("every named writer, caller and allowlisted page still needs its allowance", () => {
  const named = [...new Set([...CODEX_SERVER_WRITERS.flatMap((w) => [w.file, ...(w.callers === "any" ? [] : w.callers)]), ...CODEX_SWITCH_ALLOWLIST.map((a) => a.file)])]
  for (const inside of [false, true]) {
    const files = named.filter((f) => inCodexZone(f) === inside)
    const rules = { "import/no-restricted-paths": ["error", { basePath: repo, zones: codexZones(null, inside) }], "no-restricted-syntax": ["error", ...CODEX_URL_SELECTORS] }
    const hits = eslint([...Object.entries(rules).flatMap(([k, v]) => ["--rule", JSON.stringify({ [k]: v })]), ...files])
    for (const f of files) assert.ok(hits[f]?.length, `${f} no longer needs its C-200 allowance: drop it from scripts/codex-boundary.mjs`)
  }
})

test("the switch allowlist cannot outlive codex_contained_writes", () => {
  assert.ok(CODEX_SWITCH_ALLOWLIST.length === 0 || isFeatureKey("codex_contained_writes"), "the switch is retired: delete the old write paths and CODEX_SWITCH_ALLOWLIST")
})
