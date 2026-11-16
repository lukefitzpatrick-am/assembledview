#!/usr/bin/env node
/**
 * Codex containment guard (C-200, decision 3 B, B44): tasks are written only
 * inside /tasks. Other pages show Codex data read only and link into /tasks.
 *
 * Fails when a file outside the Codex zone:
 *   1. imports a Codex write helper (a function that writes tasks, their
 *      checklist, comments, followers, attachments or field values, or the
 *      projects, sections and fields they sit on): a named import of one, a
 *      namespace or default import of a write module, a re-export from one, or
 *      a dynamic `import()` / `require()` of one (unless it destructures only
 *      read names);
 *   2. imports the /tasks UI (`components/tasks/**`, `components/codex/**`),
 *      which writes;
 *   3. sends a write to a Codex route: a `/api/codex/` URL inside a `fetch(...)`
 *      or `new Request(...)` whose method is not provably GET or HEAD, or inside
 *      a call whose name says it writes (post, put, patch, delete, send, submit,
 *      mutate, write; `sendBeacon` too). The method is read from the options:
 *      an object literal (`method: "POST"`, shorthand `{ method }`, a spread),
 *      or a `const` options object, method string or spread object in the same
 *      file. No options is GET. Anything it cannot resolve counts as a write
 *      (B44fix R2);
 *   4. holds a `/api/codex/` URL outside such a call in a file that sends a
 *      write method anywhere (`method: "POST"`, `method="post"`, `sendBeacon`,
 *      or any `fetch` / `new Request` whose method is not provably GET), so a
 *      URL kept in a variable and posted later is caught.
 *
 * The zone (may write): `app/tasks/**` and `app/(group)/tasks/**`,
 * `components/tasks/**`, `components/codex/**`, `app/api/codex/**`, and
 * `lib/codex/**` (where the helpers live). Tests are not scanned.
 *
 * Named server exceptions (permanent, system writers, not UI): see
 * SERVER_EXCEPTIONS. Each names the file and the helpers it may import.
 *
 * C-200 switch allowlist: the four pages that wrote before the switch
 * `codex_contained_writes` keep their old code for switch off. They are
 * allowed only while that switch is in `lib/features/registry.ts`; when the
 * switch is retired, delete the old paths and these entries (the check fails
 * until you do). A stale entry (nothing left to allow) also fails.
 *
 * Not caught (no current code does this; review catches it): a URL built from
 * pieces ("/api/" + "codex"), a Codex URL handed to a helper in another file
 * that does the write, a write helper reached through another module that
 * re-exports it under a new name inside the zone, `XMLHttpRequest`, a
 * file-level `const` options object shadowed by a parameter of the same name,
 * and a `fetch` after JSX text with an apostrophe (the masker reads it as a
 * string, as in check-egress-guards).
 *
 * Self-test: `npm run test:codex-task-writes`
 * (scripts/__tests__/check-codex-task-writes.test.mjs). `--root <dir>` scans
 * another tree.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { maskNonCode } from "./check-egress-guards.mjs"

const defaultRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const SCAN_DIRS = ["app", "lib", "components", "src", "hooks", "contexts"]
export const SCAN_FILES = ["middleware.ts"]
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"])

/** May write: the /tasks pages, their components, the Codex API and the helpers' home. */
export const ZONE = [
  /^app\/(?:\([^/]+\)\/)*tasks\//,
  /^components\/tasks\//,
  /^components\/codex\//,
  /^app\/api\/codex\//,
  /^lib\/codex\//,
]

/** The /tasks UI: importing any of it from outside the zone is a write path. */
export const TASKS_UI = [/^components\/tasks\//, /^components\/codex\//]

/**
 * Codex write helpers by module (no extension). Every export of these modules
 * is either here or in READ_EXPORTS (the self-test checks), so a new helper
 * must be classified.
 */
export const WRITE_HELPERS = {
  "lib/codex/repo": [
    "createTask",
    "updateTaskStatusInTx",
    "updateTaskInTx",
    "updateTask",
    "updateTaskFollowingSections",
    "requestHelp",
    "softDeleteTask",
    "bulkUpdateTasks",
    "bulkSoftDeleteTasks",
    "createChecklistItem",
    "updateChecklistItem",
    "deleteChecklistItem",
    "reorderChecklistItems",
    "createComment",
    "deleteComment",
    "createGeneratedRecurringTask",
  ],
  "lib/codex/taskDetailRepo": ["createSubtask", "reorderSubtasks"],
  "lib/codex/projectsRepo": [
    "appendActivity",
    "createProject",
    "updateProject",
    "addProjectMembers",
    "removeProjectMember",
    "createSection",
    "updateSection",
    "deleteSection",
    "reorderSections",
    "moveTaskToSection",
    "completeProjectTask",
    "createTasksInSection",
    "setBoardHideCompleted",
    "updateTaskThroughSections",
    "bulkUpdateTasksThroughSections",
  ],
  "lib/codex/sectionSync": ["followSectionRule"],
  "lib/codex/customFieldsRepo": [
    "setProgressField",
    "createCustomField",
    "updateCustomField",
    "deleteCustomField",
    "setProjectCardFields",
  ],
  "lib/codex/collabRepo": [
    "createCommentWithMentions",
    "followTask",
    "unfollowTask",
    "createAttachment",
    "deleteAttachment",
  ],
  "lib/codex/progressRule": ["markProgressDone", "markDoneTasksOnLink"],
  "lib/codex/runRecurring": ["runCodexRecurring"],
  "lib/codex/seedTasks": ["seedTasksForCampaign"],
}

/** Exports of the write modules that only read, lock or shape data (classified so nothing new slips in). */
export const READ_EXPORTS = {
  "lib/codex/repo": [
    "listTasks",
    "loadListTasksByIds",
    "countTasksByStatus",
    "countTasksByMba",
    "getTask",
    "listTaskActivity",
    "helpNoAccessMessage",
    "bulkFailure",
    "listClientNotes",
    "listEmailAliasCollisions",
    "listTeamMembers",
    "listRosterLoginRows",
    "createTeamMember",
    "updateTeamMember",
    "listChecklistItems",
    "listComments",
    "listTemplates",
    "getTemplate",
    "createTemplate",
    "updateTemplate",
    "deleteTemplate",
    "listTemplateItems",
    "createTemplateItem",
    "updateTemplateItem",
    "deleteTemplateItem",
    "reorderTemplateItems",
    "listRecurringSeeds",
    "findGeneratedRecurringTask",
    "latestRecurringInstanceDueYmd",
  ],
  "lib/codex/taskDetailRepo": ["getTaskProjectDetail"],
  "lib/codex/projectsRepo": [
    "isMissingProjectsSchema",
    "guarded",
    "projectRowToApi",
    "sectionRowToApi",
    "loadVisibleProject",
    "loadSections",
    "memberHasOpenTasksMessage",
    "assigneesLoseAccessMessage",
    "listProjects",
    "getProject",
    "listSections",
    "attachTaskS1Fields",
    "loadProjectFields",
    "projectCardFieldsWhere",
    "loadProjectCardFields",
    "loadProjectBoard",
    "listSectionTasks",
  ],
  "lib/codex/sectionSync": ["lockTaskProject", "lockTaskAndProject"],
  "lib/codex/customFieldsRepo": ["listProjectFields"],
  "lib/codex/collabRepo": [
    "listCommentsWithMentions",
    "primaryEmailFor",
    "listFollowers",
    "listAttachments",
    "checkCanAttach",
    "getAttachmentFile",
  ],
  "lib/codex/progressRule": ["loadProgressRule"],
  "lib/codex/runRecurring": [],
  "lib/codex/seedTasks": ["eachMonthEndYmd", "expandSeedDueDates"],
}

/**
 * Server writers outside the zone that stay (system writers, not UI). Each
 * names the helpers it may import; any other write in the file still fails.
 */
export const SERVER_EXCEPTIONS = [
  {
    file: "lib/pacing/relabel/handlers.ts",
    helpers: ["createTask"],
    reason: "relabel apply, revert and block make a task for the person who acted (pacing relabels, C-200 exception)",
  },
  {
    file: "lib/pacing/relabel/autoClose.ts",
    helpers: ["updateTaskFollowingSections"],
    reason: "the relabel auto-close completes the request task as system:relabel (C-264, C-200 exception)",
  },
  {
    file: "lib/fireflies/proposalRepo.ts",
    helpers: ["createTask", "softDeleteTask"],
    reason: "meeting action items: Inbox accept (reached from /api/codex/proposals) and the Fireflies sync (C-200 exception)",
  },
  {
    file: "app/api/cron/codex-recurring/route.ts",
    helpers: ["runCodexRecurring"],
    reason: "the recurring task cron, system:recurring (C-200 exception)",
  },
]

/**
 * C-200: the four pages that wrote tasks before `codex_contained_writes`.
 * Their old code stays for switch off. Allowed only while the switch exists.
 * `rule` and `detail` must match a hit exactly.
 */
export const SWITCH_KEY = "codex_contained_writes"
export const SWITCH_ALLOWLIST = [
  {
    file: "components/pacing/detail/CampaignAskHelpDialog.tsx",
    rule: "fetch-write",
    detail: "POST /api/codex/tasks/${task.id}/help",
  },
  { file: "components/pacing/scenario/ScenarioPlannerContext.tsx", rule: "fetch-write", detail: "POST /api/codex/tasks" },
  { file: "components/pacing/scenario/ScenarioPlannerDrawer.tsx", rule: "fetch-write", detail: "POST /api/codex/tasks" },
  {
    file: "components/creative/CreativeAdminLanding.tsx",
    rule: "tasks-ui-import",
    detail: "components/tasks/TaskFormDialog",
  },
]

function posix(rel) {
  return rel.split(path.sep).join("/")
}

export function isTestPath(rel) {
  const p = posix(rel)
  if (p.includes("/__tests__/")) return true
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(p)
}

export function inZone(rel) {
  return ZONE.some((re) => re.test(rel))
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (CODE_EXT.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

/** `@/x`, `./x`, `../x` to a repo path without extension (or `/index`), else null. */
export function resolveSpecifier(fromRel, spec) {
  let p
  if (spec.startsWith("@/")) p = spec.slice(2)
  else if (spec.startsWith("./") || spec.startsWith("../")) p = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec))
  else return null
  p = p.replace(/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/, "").replace(/\/index$/, "")
  return p.replace(/^\.\//, "")
}

function lineOf(src, index) {
  let line = 1
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++
  return line
}

function namedList(body) {
  // `a, b as c, type D, default as e` -> imported names (type-only dropped)
  return body
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^type\s/.test(s))
    .map((s) => s.split(/\s+as\s+/)[0].trim())
}

/** Every import, re-export and dynamic import/require in the file, with what it brings in. */
export function findImports(full) {
  const out = []
  const reStatic =
    /\b(import|export)\s+(type\s+)?([^;'"`]*?)\s*from\s*(["'])([^"'\n]+)\4/g
  let m
  while ((m = reStatic.exec(full))) {
    const [, kw, typeOnly, clause, , spec] = m
    if (typeOnly) continue
    const c = clause.trim()
    let names = []
    let whole = false
    const braces = c.match(/\{([^}]*)\}/)
    if (braces) names = namedList(braces[1])
    const outside = c.replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim()
    if (kw === "export") {
      if (!braces) whole = true // export * from / export * as ns from
    } else if (outside) {
      whole = true // default or namespace import
    }
    out.push({ index: m.index, spec, names, whole, kind: kw === "export" ? "re-export" : "import" })
  }
  const reSide = /\bimport\s*(["'])([^"'\n]+)\1/g
  while ((m = reSide.exec(full))) out.push({ index: m.index, spec: m[2], names: [], whole: false, kind: "side-effect" })
  const reDyn = /\b(import|require)\s*\(\s*(["'`])([^"'`\n]+)\2\s*\)/g
  while ((m = reDyn.exec(full))) {
    // `const { a, b } = await import("x")` names only those; anything else is the whole module.
    const before = full.slice(Math.max(0, m.index - 200), m.index)
    const destructure = before.match(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s*)?$/)
    const names = destructure ? namedList(destructure[1].replace(/:\s*\w+/g, "")) : []
    out.push({ index: m.index, spec: m[3], names, whole: !destructure, kind: "dynamic" })
  }
  return out
}

/** Index of the `(` that opens the call holding `at`, or -1 (on the code-only mask). */
function enclosingCallOpen(code, at) {
  let depth = 0
  for (let i = at - 1; i >= 0; i--) {
    const ch = code[i]
    if (ch === ")") depth++
    else if (ch === "(") {
      if (depth === 0) return i
      depth--
    } else if (ch === ";" && depth === 0) {
      return -1 // the statement started without an open call
    }
  }
  return -1
}

function calleeBefore(code, open) {
  const head = code.slice(Math.max(0, open - 80), open)
  const m = head.match(/([A-Za-z_$][\w$]*)\s*(?:\?\.)?\s*$/)
  return m ? m[1] : ""
}

const WRITE_CALLEE = /(post|put|patch|delete|send|submit|mutat|write)/i
const WRITE_METHOD_LITERAL = /\bmethod\s*[:=]\s*\{?\s*(["'`])(post|put|patch|delete)\1/i
const NOT_PROVABLY_GET = "a method not provably GET"
const IDENT = /^[A-Za-z_$][\w$]*$/

/** Close index for the bracket that opens at `open` on the code mask (`(`, `[` or `{`), or -1. */
function matchingBracket(code, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" }
  const stack = []
  for (let i = open; i < code.length; i++) {
    const ch = code[i]
    if (pairs[ch]) stack.push(pairs[ch])
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== ch) return -1
      if (stack.length === 0) return i
    }
  }
  return -1
}

/** Top-level comma-separated ranges in [start, end): structure from the code mask, emptiness from the source. */
function splitTopLevel(full, code, start, end) {
  const out = []
  let depth = 0
  let from = start
  for (let i = start; i < end; i++) {
    const ch = code[i]
    if (ch === "(" || ch === "[" || ch === "{") depth++
    else if (ch === ")" || ch === "]" || ch === "}") depth--
    else if (ch === "," && depth === 0) {
      out.push([from, i])
      from = i + 1
    }
  }
  out.push([from, end])
  return out.filter(([a, b]) => /\S/.test(full.slice(a, b)))
}

/** [a, b) without surrounding whitespace, a trailing `as const` / `as T` / `satisfies T`. */
function trimRange(full, a, b) {
  while (a < b && /\s/.test(full[a])) a++
  while (b > a && /\s/.test(full[b - 1])) b--
  const tail = full.slice(a, b).match(/\s+(?:as|satisfies)\s+[A-Za-z_$][\w$.<>]*$/)
  if (tail) b -= tail[0].length
  return [a, b]
}

/**
 * Start of the initialiser of the file's one `const <name> =` (optionally
 * typed), or -1. `let` and `var` are not trusted, and nor is a name declared
 * twice (two scopes could hold different values).
 */
function constInitStart(full, code, name) {
  const esc = name.replace(/\$/g, "\\$")
  const re = new RegExp(`\\bconst\\s+${esc}\\s*(?::[^=;]+)?=\\s*`, "g")
  const found = []
  let m
  while ((m = re.exec(full))) {
    if (code.slice(m.index, m.index + 5) !== "const") continue // inside a string or comment
    found.push(m.index + m[0].length)
  }
  const declared = (code.match(new RegExp(`\\b(?:const|let|var)\\s+${esc}\\b`, "g")) ?? []).length
  return found.length === 1 && declared === 1 ? found[0] : -1
}

/** End of the value that starts at `at`: a top-level `;` or `,`, a closing bracket, or a line break after a complete value. */
function valueEnd(full, code, at) {
  let depth = 0
  for (let i = at; i < code.length; i++) {
    const ch = code[i]
    if (ch === "(" || ch === "[" || ch === "{") depth++
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) return i
      depth--
    } else if (depth === 0 && (ch === ";" || ch === ",")) return i
    else if (depth === 0 && ch === "\n" && /\S/.test(full.slice(at, i))) {
      const next = full.slice(i).match(/^\s*(\S)/)
      if (!next || !/[.?:+\-*/|&]/.test(next[1])) return i
    }
  }
  return code.length
}

/** The verb at [a, b): a string literal (no interpolation) or a `const` that holds one, else null. */
function resolveVerb(full, code, a, b, depth) {
  ;[a, b] = trimRange(full, a, b)
  const t = full.slice(a, b)
  const lit = t.match(/^(["'`])([^"'`$]*)\1$/)
  if (lit) return lit[2].toUpperCase()
  if (depth > 0 && IDENT.test(t)) {
    const at = constInitStart(full, code, t)
    if (at >= 0) return resolveVerb(full, code, at, valueEnd(full, code, at), depth - 1)
  }
  return null
}

/**
 * What an options expression at [a, b) does to the method:
 * `{ kind: "none" }` (sets no method), `{ kind: "verb", verb }`, or
 * `{ kind: "unknown" }` (cannot be resolved here).
 */
function optionsMethod(full, code, a, b, depth = 4) {
  ;[a, b] = trimRange(full, a, b)
  if (a >= b) return { kind: "none" }
  const text = full.slice(a, b)
  if (text === "undefined") return { kind: "none" }
  if (IDENT.test(text)) {
    const at = depth > 0 ? constInitStart(full, code, text) : -1
    if (at < 0) return { kind: "unknown" }
    return optionsMethod(full, code, at, valueEnd(full, code, at), depth - 1)
  }
  // Only a plain object literal can be read; a call, a ternary or a merge cannot.
  if (code[a] === "{" && matchingBracket(code, a) === b - 1) return optionsObject(full, code, a, b, depth)
  return { kind: "unknown" }
}

/** An object literal at [a, b): later properties win, as at runtime. */
function optionsObject(full, code, a, b, depth) {
  let result = { kind: "none" }
  for (const [ra, rb] of splitTopLevel(full, code, a + 1, b - 1)) {
    const [pa, pb] = trimRange(full, ra, rb)
    const prop = full.slice(pa, pb)
    if (prop.startsWith("...")) {
      const inner = depth > 0 ? optionsMethod(full, code, pa + 3, pb, depth - 1) : { kind: "unknown" }
      if (inner.kind !== "none") result = inner
      continue
    }
    if (prop === "method") {
      // Shorthand `{ method }`: a variable called `method`.
      const verb = resolveVerb(full, code, pa, pb, depth)
      result = verb ? { kind: "verb", verb } : { kind: "unknown" }
      continue
    }
    const key = prop.match(/^(?:(["'])method\1|method)\s*:/)
    if (!key) continue
    const verb = resolveVerb(full, code, pa + key[0].length, pb, depth)
    result = verb ? { kind: "verb", verb } : { kind: "unknown" }
  }
  return result
}

/** The verb of a `fetch(...)` / `new Request(...)` call opened at `open`: "GET", a write verb, or NOT_PROVABLY_GET. */
function callVerb(full, code, open) {
  const close = matchingBracket(code, open)
  if (close < 0) return NOT_PROVABLY_GET
  const args = splitTopLevel(full, code, open + 1, close)
  if (args.length < 2) return "GET"
  const res = optionsMethod(full, code, args[1][0], args[1][1])
  if (res.kind === "none") return "GET"
  if (res.kind === "verb") return res.verb
  return NOT_PROVABLY_GET
}

const READ_VERBS = new Set(["GET", "HEAD"])

/** True when any `fetch(` / `new Request(` in the file sends a method that is not provably GET. */
function fileHasNonGetFetch(full, code) {
  const re = /\b(?:fetch|Request)\s*\(/g
  let m
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1
    if (!READ_VERBS.has(callVerb(full, code, open))) return true
  }
  return false
}

/** Writes to `/api/codex/` (rules 3 and 4). */
export function codexWriteHits(rel, raw) {
  const code = maskNonCode(raw)
  const full = maskNonCode(raw, { keepStrings: true })
  const hits = []
  const fileSendsWrites =
    WRITE_METHOD_LITERAL.test(full) || /\bsendBeacon\s*\(/.test(full) || fileHasNonGetFetch(full, code)
  const re = /\/api\/codex\/[^\s"'`)]*/g
  let m
  while ((m = re.exec(full))) {
    // Only URLs inside string literals (the code mask blanks them).
    if (code[m.index] !== " ") continue
    const url = m[0]
    const open = enclosingCallOpen(code, m.index)
    const callee = open >= 0 ? calleeBefore(code, open) : ""
    const line = lineOf(raw, m.index)
    if (callee === "fetch" || callee === "Request") {
      const verb = callVerb(full, code, open)
      if (READ_VERBS.has(verb)) continue // a GET: a read-only panel
      hits.push({ rel, line, rule: "fetch-write", detail: `${verb} ${url}` })
      continue
    }
    if (callee && WRITE_CALLEE.test(callee)) {
      hits.push({ rel, line, rule: "call-write", detail: `${callee}(${url})` })
      continue
    }
    if (fileSendsWrites) hits.push({ rel, line, rule: "url-in-writing-file", detail: url })
  }
  return hits
}

/** Imports of write helpers or the /tasks UI (rules 1 and 2). */
export function importHits(rel, raw) {
  const full = maskNonCode(raw, { keepStrings: true })
  const hits = []
  for (const imp of findImports(full)) {
    const target = resolveSpecifier(rel, imp.spec)
    if (!target) continue
    const line = lineOf(raw, imp.index)
    if (TASKS_UI.some((re) => re.test(`${target}/`) || re.test(target))) {
      hits.push({ rel, line, rule: "tasks-ui-import", detail: target })
      continue
    }
    const writes = WRITE_HELPERS[target]
    if (!writes) continue
    if (imp.whole) {
      hits.push({ rel, line, rule: "write-module", detail: `${imp.kind} of ${target}` })
      continue
    }
    for (const name of imp.names) {
      if (writes.includes(name)) hits.push({ rel, line, rule: "write-helper", detail: `${name} from ${target}` })
    }
  }
  return hits
}

function allowedByException(hit) {
  if (hit.rule !== "write-helper") return false
  const name = hit.detail.split(" from ")[0]
  return SERVER_EXCEPTIONS.some((e) => e.file === hit.rel && e.helpers.includes(name))
}

function allowlistIndex(hit) {
  return SWITCH_ALLOWLIST.findIndex((a) => a.file === hit.rel && a.rule === hit.rule && a.detail === hit.detail)
}

/** Raw hits for one file (zone and test files have none). */
export function scanFile(rel, raw) {
  if (inZone(rel) || isTestPath(rel)) return []
  return [...importHits(rel, raw), ...codexWriteHits(rel, raw)]
}

/**
 * The whole tree: failures (hits not allowed), plus stale exceptions and
 * allowlist entries, plus the allowlist outliving its switch.
 */
export function scanRoot(rootDir, { registrySource } = {}) {
  const files = []
  for (const dir of SCAN_DIRS) {
    const abs = path.join(rootDir, dir)
    if (fs.existsSync(abs)) walk(abs, files)
  }
  for (const file of SCAN_FILES) {
    const abs = path.join(rootDir, file)
    if (fs.existsSync(abs)) files.push(abs)
  }
  const failures = []
  const usedExceptions = new Set()
  const usedAllow = new Set()
  for (const file of files) {
    const rel = posix(path.relative(rootDir, file))
    for (const hit of scanFile(rel, fs.readFileSync(file, "utf8"))) {
      if (allowedByException(hit)) {
        usedExceptions.add(`${hit.rel}#${hit.detail.split(" from ")[0]}`)
        continue
      }
      const at = allowlistIndex(hit)
      if (at >= 0) {
        usedAllow.add(at)
        continue
      }
      failures.push(`${hit.rel}:${hit.line} ${hit.rule}: ${hit.detail}`)
    }
  }
  const problems = [...failures]
  for (const e of SERVER_EXCEPTIONS) {
    for (const h of e.helpers) {
      if (!usedExceptions.has(`${e.file}#${h}`)) problems.push(`stale server exception: ${e.file} no longer imports ${h}`)
    }
  }
  SWITCH_ALLOWLIST.forEach((a, i) => {
    if (!usedAllow.has(i)) problems.push(`stale C-200 allowlist entry: ${a.file} (${a.rule}: ${a.detail})`)
  })
  const registry =
    registrySource ??
    (fs.existsSync(path.join(rootDir, "lib/features/registry.ts"))
      ? fs.readFileSync(path.join(rootDir, "lib/features/registry.ts"), "utf8")
      : "")
  if (SWITCH_ALLOWLIST.length > 0 && !registry.includes(`key: "${SWITCH_KEY}"`)) {
    problems.push(
      `the C-200 allowlist outlived its switch: ${SWITCH_KEY} is gone from lib/features/registry.ts, so delete the old write paths and SWITCH_ALLOWLIST`,
    )
  }
  return problems
}

function main(argv) {
  const at = argv.indexOf("--root")
  const rootDir = at >= 0 && argv[at + 1] ? path.resolve(argv[at + 1]) : defaultRootDir
  const problems = scanRoot(rootDir)
  if (problems.length) {
    console.error("check:codex-task-writes failed (C-200: tasks are written only in /tasks):\n")
    for (const p of problems) console.error(p)
    console.error(`\n${problems.length} problem(s). Link into /tasks instead (lib/codex/composeLink.ts).`)
    process.exit(1)
  }
  console.log(
    `check:codex-task-writes ok (${SERVER_EXCEPTIONS.length} server exceptions, ${SWITCH_ALLOWLIST.length} C-200 switch allowlist entries)`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
}
