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
 *      whose `method` is not GET or HEAD (or is not a literal), or inside a
 *      call whose name says it writes (post, put, patch, delete, send, submit,
 *      mutate, write; `sendBeacon` too);
 *   4. holds a `/api/codex/` URL outside such a call in a file that sends a
 *      write method anywhere (`method: "POST"`, `method="post"`, `sendBeacon`),
 *      so a URL kept in a variable and posted later is caught.
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
 * re-exports it under a new name inside the zone, `XMLHttpRequest`, and a
 * `fetch` after JSX text with an apostrophe (the masker reads it as a string,
 * as in check-egress-guards).
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

function matchingClose(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === "(") depth++
    else if (code[i] === ")") {
      depth--
      if (depth === 0) return i
    }
  }
  return code.length
}

function calleeBefore(code, open) {
  const head = code.slice(Math.max(0, open - 80), open)
  const m = head.match(/([A-Za-z_$][\w$]*)\s*(?:\?\.)?\s*$/)
  return m ? m[1] : ""
}

const WRITE_CALLEE = /(post|put|patch|delete|send|submit|mutat|write)/i
const WRITE_METHOD_LITERAL = /\bmethod\s*[:=]\s*\{?\s*(["'`])(post|put|patch|delete)\1/i
const ANY_METHOD = /\bmethod\s*:\s*([^,}\n]+)/

/** Writes to `/api/codex/` (rules 3 and 4). */
export function codexWriteHits(rel, raw) {
  const code = maskNonCode(raw)
  const full = maskNonCode(raw, { keepStrings: true })
  const hits = []
  const fileSendsWrites = WRITE_METHOD_LITERAL.test(full) || /\bsendBeacon\s*\(/.test(full)
  const re = /\/api\/codex\/[^\s"'`)]*/g
  let m
  while ((m = re.exec(full))) {
    // Only URLs inside string literals (the code mask blanks them).
    if (code[m.index] !== " ") continue
    const url = m[0]
    const open = enclosingCallOpen(code, m.index)
    const callee = open >= 0 ? calleeBefore(code, open) : ""
    const line = lineOf(raw, m.index)
    if (callee === "fetch") {
      const span = full.slice(open, matchingClose(code, open) + 1)
      const method = span.match(ANY_METHOD)
      if (!method) continue // a GET: a read-only panel
      const lit = method[1].trim().match(/^(["'`])([A-Za-z]+)\1$/)
      const verb = lit ? lit[2].toUpperCase() : "a method that is not a literal"
      if (lit && (verb === "GET" || verb === "HEAD")) continue
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
