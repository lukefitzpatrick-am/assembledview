/**
 * Self-test for the C-200 lint boundary (scripts/codex-boundary.mjs, S32 A,
 * B51, B51fix). Each planted shape fails on its line, the allowed shapes pass,
 * named writers and callers take only their listed exports, read modules hold
 * no write, every allowance is still used export by export, the lint scope
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
  'export const i = () => fetch("api/codex/tasks", { method: "POST" })',
  "export const e = () => fetch(`\\/api/codex/tasks`, { method: 'POST' })",
  'export const o = (origin: string) => fetch(`${origin}api/codex/tasks`, { method: "POST" })',
  "export const t = () => import(`@/lib/codex/repo`)",
  "export const tr = () => require(`@/lib/codex/collabRepo`)",
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
    'export const u = () => fetch("/api/codex/tasks", { method: "POST" })',
    // B53fix G1: any other spelling of the same file is held to the same list.
    'import { softDeleteTask } from "../../../lib/codex/repo"',
    'import { softDeleteTask } from "@/lib/codex/./repo"',
    'import { softDeleteTask } from "@/lib/codex/../codex/repo"',
    'export const e = async () => { const { softDeleteTask } = await import("@/lib//codex/repo"); return softDeleteTask }',
    'export const f = () => require("../../../lib/codex/./repo")',
    "export const g = () => import(`@/lib/codex/repo`)",
    'import { createTask } from "../../../lib/codex/./repo"',
  ]
  assert.deepEqual(failing("lib/pacing/relabel/handlers.ts", relabel), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  const fireflies = ['import { createTask, softDeleteTask } from "@/lib/codex/repo"', 'import { bulkSoftDeleteTasks } from "@/lib/codex/repo"']
  assert.deepEqual(failing("lib/fireflies/proposalRepo.ts", fireflies), [2])
  const login = [
    'export const a = async () => { const { syncAdminRosterOnLogin } = await import("@/lib/codex/auth0LoginUpsert"); return syncAdminRosterOnLogin }',
    'export const b = async () => { const { upsertTeamMemberOnAdminLogin } = await import("@/lib/codex/auth0LoginUpsert"); return upsertTeamMemberOnAdminLogin }',
    'export const c = async () => { const { syncAdminRosterOnLogin, ...rest } = await import("@/lib/codex/auth0LoginUpsert"); return [syncAdminRosterOnLogin, rest] }',
    'export const d = async () => { const m = await import("@/lib/codex/auth0LoginUpsert"); return m }',
  ]
  assert.deepEqual(failing("lib/auth0.ts", login), [2, 3, 4])
  const loginSpellings = [
    'import { upsertTeamMemberOnAdminLogin } from "./codex/../codex/auth0LoginUpsert"',
    'import { upsertTeamMemberOnAdminLogin } from "@/lib/codex/./auth0LoginUpsert"',
    'import { syncAdminRosterOnLogin } from "./codex/./auth0LoginUpsert"',
  ]
  assert.deepEqual(failing("lib/auth0.ts", loginSpellings), [1, 2])
  // B53 (S18): the roster rules module is a write module by place; the Auth0 entries take only their one export.
  const roster = [
    'import { runAuth0RosterSync } from "@/lib/codex/auth0RosterSync"',
    'import { rosterRulesOn } from "@/lib/codex/rosterRead"',
    'import { newRosterRow } from "@/lib/codex/rosterRules"',
    'import { prepareRosterWrite } from "@/lib/codex/rosterRules"',
    'import { upsertTeamMemberOnAdminLogin } from "@/lib/codex/auth0LoginUpsert"',
  ]
  for (const file of ["app/api/cron/auth0-roster-sync/route.ts", "app/api/admin/auth0-roster-sync/route.ts"]) assert.deepEqual(failing(file, roster), [3, 4, 5], file)
  assert.deepEqual(failing("lib/auth0.ts", roster), [1, 3, 4, 5])
  const callers = ['import { acceptProposal } from "@/lib/fireflies/proposalRepo"', 'import { auth0 } from "@/lib/auth0"', 'import { GET } from "@/app/api/cron/codex-recurring/route"']
  assert.deepEqual(failing("components/pacing/Accept.tsx", callers), [1, 3])
  assert.deepEqual(failing("app/api/codex/proposals/other/route.ts", callers), [1, 3])
  assert.deepEqual(failing("app/api/codex/proposals/[id]/dismiss/route.ts", callers), [1, 3])
  assert.deepEqual(failing("app/api/codex/proposals/[id]/accept/route.ts", callers), [3])
  const cron = ['import { expireStaleProposals } from "@/lib/fireflies/proposalRepo"', 'import { acceptProposal } from "@/lib/fireflies/proposalRepo"', 'import { runCodexRecurring } from "@/lib/codex/runRecurring"']
  assert.deepEqual(failing("app/api/cron/codex-recurring/route.ts", cron), [2])
  const relabelRoute = ['import { runRelabelList } from "@/lib/pacing/relabel/handlers"', 'import { runRelabelApply } from "@/lib/pacing/relabel/handlers"', 'import { runCloseUntouchedRelabelTasks } from "@/lib/pacing/relabel/autoClose"', 'export const hex = "#fff"']
  assert.deepEqual(failing("app/api/pacing/relabels/route.ts", relabelRoute), [2, 3, 4])
})

test("a read module holds no write and imports only read modules and non-Codex code", () => {
  const writes = [
    'export const a = (db: Db) => db.execute(sql`UPDATE public.tasks SET title = ${"x"} WHERE id = 1`)',
    'export const b = (db: Db, t: string) => db.execute(sql`UPDATE ${t} SET done = true`)',
    'export const c = (db: Db) => db.execute(sql`INSERT INTO public.tasks (title) VALUES (${"x"})`)',
    'export const d = "delete from public.tasks where id = $1"',
    'export const e = (tx: Db, t: Table) => tx.insert(t).values({})',
    'export const f = (getDb: () => Db, t: Table) => getDb().update(t).set({ a: 1 })',
    'export const g = (database: Db, t: Table) => database.delete(t)',
    'export const h = () => fetch("/x", { method: "PATCH" })',
    'export const i = (method: string) => fetch("/x", { method })',
    'export { createTask } from "@/lib/codex/repo"',
    'import { listTasks } from "./repo"',
    'export const j = () => import("@/lib/codex/collabRepo")',
    'import { acceptProposal } from "@/lib/fireflies/proposalRepo"',
    'import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"',
    "export const o = () => import(`@/lib/codex/repo`)",
  ]
  assert.deepEqual(failing("lib/codex/clientMbas.ts", writes), each(writes))
  assert.deepEqual(failing("lib/codex/types.ts", writes.slice(9)), each(writes.slice(9)))
  const reads = [
    'export const a = (db: Db) => db.execute(sql`SELECT id FROM public.tasks WHERE id = 1 FOR UPDATE`)',
    'export const b = (db: Db) => db.execute(sql`SELECT id FROM public.tasks FOR NO KEY UPDATE`)',
    'export const c = (q: URLSearchParams, m: Map<number, number>) => { q.delete("x"); m.delete(1) }',
    'export const d = () => fetch("/x", { method: "GET" })',
    'export const e = "Last UPDATE was fine"',
    'import { normaliseEmail } from "@/lib/email/address"',
    'import { buildTasksComposeHref } from "./composeLink"',
    'import { loadRosterPeople } from "@/lib/codex/rosterRead"',
  ]
  assert.deepEqual(failing("lib/codex/clientMbas.ts", reads), [])
  const types = ['import type { DbExecutor } from "@/lib/codex/repo"', 'import { createTask } from "@/lib/codex/repo"', 'export const k = () => import("@/lib/codex/repo")', 'import { DbExecutor } from "@/lib/codex/repo"']
  assert.deepEqual(failing("lib/codex/taskVisibility.ts", types), [2, 3, 4])
  assert.deepEqual(failing("lib/codex/clientMbas.ts", types.slice(0, 1)), [1])
})

test("every allowance is still used export by export; allowlisted pages keep exactly their URL lines", () => {
  const allowances = codexAllowances()
  const use = (a, name) => `uses ${a.module}#${name ?? "types"}`
  const selectors = allowances.flatMap((a) => {
    const re = codexSpecifier(a.file, a.module)
    if (!a.names) return [{ selector: `ImportDeclaration[importKind="type"][source.value=/${re}/]`, message: use(a) }]
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
    for (const n of a.names ?? [null]) assert.ok(hits[a.file]?.some((m) => m.message === use(a, n)), `${a.file} ${use(a, n)} ${stale}`)
  }
  const urlLines = (f) => lines(hits[f]?.filter((m) => m.message === "url")).length
  for (const a of CODEX_SWITCH_ALLOWLIST) assert.equal(urlLines(a.file), a.urls, `${a.file}: /api/codex lines changed (each old one has its C-200 disable comment; add none)`)
  for (const f of CODEX_URL_PROSE) assert.ok(urlLines(f) > 0, `${f} ${stale}`)
  for (const f of CODEX_READ_MODULES) assert.ok(hits[f], `${f} is gone: drop it from CODEX_READ_MODULES`)
})

test("a C-200 disable comment on a switch-off page that silences nothing fails lint", () => {
  const file = CODEX_SWITCH_ALLOWLIST[0].file
  const src = ["// eslint-disable-next-line no-restricted-syntax -- C-200 switch-off path", "export const a = 1"].join("\n")
  const run = spawnSync(path.join(repo, "node_modules/.bin/eslint"), ["--format", "json", "--stdin", "--stdin-filename", file], { cwd: repo, input: src, encoding: "utf8" })
  const [result] = JSON.parse(run.stdout)
  assert.deepEqual(result.messages.map((m) => [m.line, m.severity, m.ruleId]), [[1, 2, null]])
})

test("next lint keeps hooks, contexts and middleware.ts in its paths", () => {
  for (const dir of ["hooks", "contexts", "middleware.ts"]) assert.ok(nextConfig.eslint.dirs.includes(dir), `next.config.mjs eslint.dirs lost ${dir}`)
})

test("the switch allowlist cannot outlive codex_contained_writes", () => {
  assert.ok(CODEX_SWITCH_ALLOWLIST.length === 0 || isFeatureKey("codex_contained_writes"), "the switch is retired: delete the old write paths and CODEX_SWITCH_ALLOWLIST")
})
