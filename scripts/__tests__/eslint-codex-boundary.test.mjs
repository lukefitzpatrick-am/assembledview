/**
 * Self-test for the C-200 lint boundary (scripts/codex-boundary.mjs, S32 A,
 * B51, B51fix). Each planted shape fails on its line, the allowed shapes pass,
 * named writers and callers take only their listed exports, every allowance is
 * still used export by export, the lint scope
 * keeps hooks, contexts and middleware.ts, and the switch allowlist cannot
 * outlive its switch. GAPS pins what lint does not catch (KNOWN-ISSUES C-285).
 * ESLint runs as a process (`eslint` is not a listed dependency).
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { isFeatureKey } from "../../lib/features/registry.ts"
import nextConfig from "../../next.config.mjs"
import {
  CODEX_READ_MODULES,
  CODEX_SWITCH_ALLOWLIST,
  CODEX_URL_PROSE,
  CODEX_URL_SELECTORS,
  codexAllowances,
  codexSpecifier,
} from "../codex-boundary.mjs"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const RULES = new Set(["import/no-restricted-paths", "no-restricted-syntax", "no-restricted-imports"])

/** ESLint over `args`; the Codex rule messages per file (repo path to { line, message }). */
function lint(args, input) {
  const run = spawnSync(path.join(repo, "node_modules/.bin/eslint"), ["--format", "json", "--no-warn-ignored", ...args], { cwd: repo, input, encoding: "utf8", maxBuffer: 1 << 26 })
  assert.ok(run.stdout, run.stderr)
  const out = {}
  for (const r of JSON.parse(run.stdout)) {
    assert.deepEqual(r.messages.filter((m) => m.fatal), [], r.filePath)
    out[path.relative(repo, r.filePath)] = r.messages.filter((m) => RULES.has(m.ruleId))
  }
  return out
}
const lines = (messages = []) => [...new Set(messages.map((m) => m.line))].sort((a, b) => a - b)
/** Lines of `src` (one shape each) that fail when linted as `file`. */
const failing = (file, src) => lines(lint(["--stdin", "--stdin-filename", file], src.join("\n"))[file])
const each = (src) => src.map((_, i) => i + 1)
const noJsx = (src) => src.filter((l) => !l.includes("<form"))

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
  'export const w = "rapi/codex"',
]
/** Not caught by lint (C-285). Move a line to PLANTED when the boundary learns it. */
const GAPS = [
  'export const h = () => fetch("/api/" + "codex/tasks", { method: "POST" })',
  'export const j = () => fetch(["", "api", "codex", "tasks"].join("/"), { method: "POST" })',
  'const spec = "@/lib/codex/" + "repo"; export const k = () => import(spec)',
]

test("every planted shape fails on its line outside the zone, hooks, contexts and middleware.ts included", () => {
  assert.deepEqual(failing("components/pacing/Probe.tsx", PLANTED), each(PLANTED))
  assert.deepEqual(failing("lib/pacing/probe.ts", noJsx(PLANTED)), each(noJsx(PLANTED)))
  const shallow = noJsx(PLANTED).filter((l) => !l.includes("../../"))
  for (const file of ["hooks/useProbe.ts", "contexts/ProbeContext.ts", "middleware.ts"]) assert.deepEqual(failing(file, shallow), each(shallow), file)
})

test("allowed shapes, the zone and tests pass; the gaps stay gaps", () => {
  assert.deepEqual(failing("components/pacing/Probe.tsx", ALLOWED), [])
  assert.deepEqual(failing("components/pacing/Probe.tsx", GAPS), [])
  assert.deepEqual(failing("app/tasks/Probe.tsx", PLANTED.slice(0, 11)), [])
  assert.deepEqual(failing("components/tasks/Probe.tsx", PLANTED.slice(12)), [])
  assert.deepEqual(failing("components/pacing/__tests__/Probe.test.tsx", PLANTED), [])
})

test("a named writer takes only its listed exports, and only its callers take only theirs", () => {
  const relabel = [
    'import { createTask } from "@/lib/codex/repo"',
    'import { softDeleteTask, bulkSoftDeleteTasks } from "@/lib/codex/repo"',
    'import * as all from "../../codex/repo"',
    'export { updateTask } from "@/lib/codex/repo"',
    'export const a = async () => { const { softDeleteTask } = await import("@/lib/codex/repo"); return softDeleteTask }',
    'export const b = async () => (await import("@/lib/codex/repo")).softDeleteTask',
    'export const c = () => require("@/lib/codex/repo")',
    'import { createProject } from "@/lib/codex/projectsRepo"',
    'import { toast } from "@/hooks/use-toast"',
  ]
  assert.deepEqual(failing("lib/pacing/relabel/handlers.ts", relabel), [2, 3, 4, 5, 6, 7, 8, 9])
  const fireflies = ['import { createTask, softDeleteTask } from "@/lib/codex/repo"', 'import { bulkSoftDeleteTasks } from "@/lib/codex/repo"']
  assert.deepEqual(failing("lib/fireflies/proposalRepo.ts", fireflies), [2])
  const login = [
    'export const a = async () => { const { syncAdminRosterOnLogin } = await import("@/lib/codex/auth0LoginUpsert"); return syncAdminRosterOnLogin }',
    'export const b = async () => { const { upsertTeamMemberOnAdminLogin } = await import("@/lib/codex/auth0LoginUpsert"); return upsertTeamMemberOnAdminLogin }',
    'export const c = async () => { const { syncAdminRosterOnLogin, ...rest } = await import("@/lib/codex/auth0LoginUpsert"); return [syncAdminRosterOnLogin, rest] }',
    'export const d = async () => { const m = await import("@/lib/codex/auth0LoginUpsert"); return m }',
  ]
  assert.deepEqual(failing("lib/auth0.ts", login), [2, 3, 4])
  const callers = ['import { acceptProposal } from "@/lib/fireflies/proposalRepo"', 'import { auth0 } from "@/lib/auth0"', 'import { GET } from "@/app/api/cron/codex-recurring/route"']
  assert.deepEqual(failing("components/pacing/Accept.tsx", callers), [1, 3])
  assert.deepEqual(failing("app/api/codex/proposals/other/route.ts", callers), [1, 3])
  assert.deepEqual(failing("app/api/codex/proposals/[id]/dismiss/route.ts", callers), [1, 3])
  assert.deepEqual(failing("app/api/codex/proposals/[id]/accept/route.ts", callers), [3])
  const cron = ['import { expireStaleProposals } from "@/lib/fireflies/proposalRepo"', 'import { acceptProposal } from "@/lib/fireflies/proposalRepo"', 'import { runCodexRecurring } from "@/lib/codex/runRecurring"']
  assert.deepEqual(failing("app/api/cron/codex-recurring/route.ts", cron), [2])
  const relabelRoute = ['import { runRelabelList } from "@/lib/pacing/relabel/handlers"', 'import { runRelabelApply } from "@/lib/pacing/relabel/handlers"', 'import { runCloseUntouchedRelabelTasks } from "@/lib/pacing/relabel/autoClose"']
  assert.deepEqual(failing("app/api/pacing/relabels/route.ts", relabelRoute), [2, 3])
})

test("every allowance is still used export by export", () => {
  const allowances = codexAllowances()
  const use = (a, name) => `uses ${a.module}#${name}`
  const selectors = allowances.flatMap((a) => {
    const re = codexSpecifier(a.file, a.module)
    return a.names.flatMap((n) =>
      [
        `ImportDeclaration[source.value=/${re}/] > ImportSpecifier[imported.name="${n}"]`,
        `ExportNamedDeclaration[source.value=/${re}/] > ExportSpecifier[local.name="${n}"]`,
        `VariableDeclarator[init.argument.source.value=/${re}/] > ObjectPattern > Property[key.name="${n}"]`,
      ].map((selector) => ({ selector, message: use(a, n) })),
    )
  })
  const url = CODEX_URL_SELECTORS.map((s) => ({ ...s, message: "url" }))
  const unique = [...new Map([...selectors, ...url].map((s) => [s.selector, s])).values()]
  const rules = { "no-restricted-syntax": ["error", ...unique], "import/no-restricted-paths": "off", "no-restricted-imports": "off" }
  const files = [...new Set([...allowances.map((a) => a.file), ...CODEX_SWITCH_ALLOWLIST.map((a) => a.file), ...CODEX_URL_PROSE, ...CODEX_READ_MODULES])]
  const args = [...Object.entries(rules).flatMap(([k, v]) => ["--rule", JSON.stringify({ [k]: v })]), "--no-inline-config", "--no-error-on-unmatched-pattern"]
  const hits = lint([...args, ...files])
  const stale = "no longer needs its C-200 allowance: drop it from scripts/codex-boundary.mjs"
  for (const a of allowances) {
    for (const n of a.names) assert.ok(hits[a.file]?.some((m) => m.message === use(a, n)), `${a.file} ${use(a, n)} ${stale}`)
  }
  const urlLines = (f) => lines(hits[f]?.filter((m) => m.message === "url")).length
  for (const f of [...CODEX_SWITCH_ALLOWLIST.map((a) => a.file), ...CODEX_URL_PROSE]) assert.ok(urlLines(f) > 0, `${f} ${stale}`)
  for (const f of CODEX_READ_MODULES) assert.ok(hits[f], `${f} is gone: drop it from CODEX_READ_MODULES`)
})

test("next lint keeps hooks, contexts and middleware.ts in its paths", () => {
  for (const dir of ["hooks", "contexts", "middleware.ts"]) assert.ok(nextConfig.eslint.dirs.includes(dir), `next.config.mjs eslint.dirs lost ${dir}`)
})

test("the switch allowlist cannot outlive codex_contained_writes", () => {
  assert.ok(CODEX_SWITCH_ALLOWLIST.length === 0 || isFeatureKey("codex_contained_writes"), "the switch is retired: delete the old write paths and CODEX_SWITCH_ALLOWLIST")
})
