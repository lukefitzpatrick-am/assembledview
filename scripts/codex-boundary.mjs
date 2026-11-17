/**
 * C-200 (decision 3 B, S32 A, B51): tasks are written only in Tasks. The lint
 * module boundary that eslint.config.mjs applies: outside the zone, nothing
 * imports lib/codex (but its read modules), the /tasks UI or a Codex route
 * handler, and no string holds a /api/codex URL (read through `codexGet`).
 * Named server writers and the switch allowlist are the only exceptions, each
 * by export (B51fix). Self-test: scripts/__tests__/eslint-codex-boundary.test.mjs.
 */
import path from "node:path"

/** May write tasks: the Tasks pages, their components, the Codex API and lib/codex. */
const CODEX_ZONE = ["app/tasks", "components/tasks", "app/api/codex", "lib/codex"]
const TESTS = ["**/__tests__/**", "**/*.test.*", "**/*.spec.*"]
/** The app source the boundary covers (scripts and tests are not app code). */
export const CODEX_SOURCE = ["{app,components,lib,src,hooks,contexts}/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}", "middleware.ts"]

/**
 * The lib/codex modules code outside the zone may import. They hold no writes.
 * Every other lib/codex module is a write module by place: a new one stays
 * inside the zone until it is listed here.
 */
export const CODEX_READ_MODULES = [
  "clientExists.ts",
  "clientMbas.ts",
  "composeLink.ts",
  "dueDate.ts",
  "estimatedMinutesColumn.ts",
  "helpRoster.ts",
  "notificationsEmail.ts",
  "queryHelpers.ts",
  "readFetch.ts",
  "recurringRule.ts",
  "rosterResolve.ts",
  "shadowRoles.ts",
  "systemActors.ts",
  "taskVisibility.ts",
  "types.ts",
].map((f) => `lib/codex/${f}`)

/**
 * The named server writers outside the zone (system writers, not UI). `may`:
 * each zone module it may import, with the exports it may take. `callers`:
 * the only files that may import it, the zone included, with the exports each
 * may take ("any": every file, every export).
 */
export const CODEX_SERVER_WRITERS = [
  {
    file: "lib/pacing/relabel/handlers.ts",
    may: { "lib/codex/repo.ts": ["createTask"] },
    callers: {
      "app/api/pacing/relabels/route.ts": ["runRelabelList"],
      "app/api/pacing/relabels/[id]/route.ts": ["runRelabelGet"],
      "app/api/pacing/relabels/preview/route.ts": ["runRelabelPreview"],
      "app/api/pacing/relabels/apply/route.ts": ["runRelabelApply"],
      "app/api/pacing/relabels/[id]/revert/route.ts": ["runRelabelRevert"],
    },
    why: "relabel apply, revert and block make a task for the person who acted",
  },
  {
    file: "lib/pacing/relabel/autoClose.ts",
    may: { "lib/codex/repo.ts": ["updateTaskFollowingSections"] },
    callers: { "app/api/cron/pacing-digest/route.ts": ["runCloseUntouchedRelabelTasks"] },
    why: "the relabel auto-close completes the request task as system:relabel (C-264)",
  },
  {
    file: "lib/fireflies/proposalRepo.ts",
    may: { "lib/codex/repo.ts": ["createTask", "softDeleteTask"] },
    callers: {
      "lib/fireflies/runSync.ts": ["insertProposalsFromNote"],
      "app/api/codex/proposals/route.ts": ["batchAcceptForNote", "listProposedInbox"],
      "app/api/codex/proposals/expire-stale/route.ts": ["expireStaleProposals"],
      "app/api/codex/proposals/dismiss-all/route.ts": ["dismissAllProposedForNote"],
      "app/api/codex/proposals/[id]/accept/route.ts": ["acceptProposal", "AcceptEdits"],
      "app/api/codex/proposals/[id]/dismiss/route.ts": ["dismissProposal"],
      "app/api/codex/tasks/[id]/dismiss-auto/route.ts": ["dismissAutoCreatedTask"],
      "app/api/cron/codex-recurring/route.ts": ["expireStaleProposals"],
    },
    why: "meeting action items: the Inbox accept and the Fireflies sync",
  },
  {
    file: "app/api/cron/codex-recurring/route.ts",
    may: { "lib/codex/runRecurring.ts": ["runCodexRecurring"] },
    callers: {},
    why: "the recurring task cron, system:recurring",
  },
  {
    file: "lib/auth0.ts",
    may: { "lib/codex/auth0LoginUpsert.ts": ["syncAdminRosterOnLogin"] },
    callers: "any",
    why: "an admin's login adds or refreshes their roster row, fail soft, inside the login hook",
  },
  {
    file: "app/api/cron/auth0-roster-sync/route.ts",
    may: { "lib/codex/auth0RosterSync.ts": ["runAuth0RosterSync"] },
    callers: {},
    why: "the nightly Auth0 admin roster sync",
  },
  {
    file: "app/api/admin/auth0-roster-sync/route.ts",
    may: { "lib/codex/auth0RosterSync.ts": ["runAuth0RosterSync"] },
    callers: {},
    why: "an admin runs the same roster sync by hand",
  },
  {
    file: "app/api/cron/codex-notifications/route.ts",
    may: { "lib/codex/notificationsRepo.ts": ["runDailyNotifications"] },
    callers: {},
    why: "the daily cron writes due reminders and marks digests sent",
  },
]

/**
 * The switch allowlist: the pages that wrote tasks before
 * `codex_contained_writes` keep their old code for switch off. Allowed only
 * while the switch is in lib/features/registry.ts (the self-test fails once it
 * is gone: delete the old paths and this list). `may`: zone files it imports,
 * by export.
 */
export const CODEX_SWITCH_ALLOWLIST = [
  { file: "components/pacing/detail/CampaignAskHelpDialog.tsx", may: {} },
  { file: "components/pacing/scenario/ScenarioPlannerContext.tsx", may: {} },
  { file: "components/pacing/scenario/ScenarioPlannerDrawer.tsx", may: {} },
  { file: "components/creative/CreativeAdminLanding.tsx", may: { "components/tasks/TaskFormDialog.tsx": ["TaskFormDialog"] } },
]

/** Files outside the zone that name /api/codex without calling it. */
export const CODEX_URL_PROSE = [
  "lib/api/tenantRouteInventory.ts", // the tenant route inventory matches the prefix
  "lib/features/registry.ts", // switch descriptions
]

const MESSAGE =
  "C-200: tasks are written only in Tasks. Read through a lib/codex read module or codexGet (lib/codex/readFetch), or link into /tasks (lib/codex/composeLink)."

/** `no-restricted-syntax` entries for a /api/codex URL in a string or template. */
export const CODEX_URL_SELECTORS = [
  { selector: "Literal[value=/\\/api\\/codex(?![\\w-])/]", message: MESSAGE },
  { selector: "TemplateElement[value.raw=/\\/api\\/codex(?![\\w-])/]", message: MESSAGE },
]

/** True for a repo path inside the Tasks zone. */
const inCodexZone = (file) => CODEX_ZONE.some((d) => file.startsWith(`${d}/`))
const globEscape = (file) => file.replace(/[[\]()*?{}!+@]/g, "\\$&")
const zoneGlobs = CODEX_ZONE.map((d) => `${d}/**`)

/** Where the URL selectors do not apply. */
export const CODEX_URL_IGNORES = [
  ...zoneGlobs,
  ...TESTS,
  ...CODEX_URL_PROSE,
  ...CODEX_SWITCH_ALLOWLIST.map((a) => globEscape(a.file)),
]

/**
 * Every import allowance by file: `module` the file may import, `names` the
 * exports it may take. A named writer's own modules, an allowlisted page's,
 * a caller's writer.
 */
export function codexAllowances() {
  const own = (e) => Object.entries(e.may).map(([module, names]) => ({ file: e.file, module, names }))
  return [
    ...CODEX_SERVER_WRITERS.flatMap((w) => [
      ...own(w),
      ...(w.callers === "any" ? [] : Object.entries(w.callers).map(([file, names]) => ({ file, module: w.file, names }))),
    ]),
    ...CODEX_SWITCH_ALLOWLIST.flatMap(own),
  ]
}

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
/** A regex (source) for the specifiers that name `module` from `file`: the `@/` alias or the relative path, any extension. */
export function codexSpecifier(file, module) {
  const bare = module.replace(/\.[cm]?[jt]sx?$/, "")
  const rel = path.posix.relative(path.posix.dirname(file), bare)
  return `^(${reEscape(`@/${bare}`)}|${reEscape(rel.startsWith(".") ? rel : `./${rel}`)})(\\.[cm]?[jt]sx?)?$`
}

/** `no-restricted-syntax` entries: `import()` and `require()` of an allowance take only its exports, destructured. */
function dynamicSelectors({ file, module, names }) {
  const re = codexSpecifier(file, module)
  const message = `C-200: from ${module} this file may import only ${names.join(", ")}, statically or as \`const { name } = await import(...)\`.`
  const destructured = `VariableDeclarator[init.argument.source.value=/${re}/] > ObjectPattern`
  return [
    `ImportExpression[source.value=/${re}/]:not(VariableDeclarator[id.type="ObjectPattern"] > AwaitExpression > ImportExpression)`,
    `${destructured} > Property[key.name!=/^(${names.map(reEscape).join("|")})$/]`,
    `${destructured} > RestElement`,
    `CallExpression[callee.name="require"][arguments.0.value=/${re}/]`,
  ].map((selector) => ({ selector, message }))
}

/**
 * The `import/no-restricted-paths` zones for a file outside the zone when
 * `outside`, else for a zone file. `file` null: no allowance.
 */
function codexZones(file, outside) {
  const may = codexAllowances().filter((a) => a.file === file).map((a) => a.module)
  const zones = []
  if (outside) {
    for (const from of CODEX_ZONE) {
      const except = [...(from === "lib/codex" ? CODEX_READ_MODULES : []), ...may]
        .filter((m) => m.startsWith(`${from}/`))
        .map((m) => m.slice(from.length + 1))
      zones.push({ target: ".", from, except, message: MESSAGE })
    }
  }
  for (const w of CODEX_SERVER_WRITERS) {
    if (w.callers === "any" || w.file === file || file in w.callers) continue
    zones.push({ target: ".", from: w.file, message: `C-200 exception (${w.why}): only its named callers may import it.` })
  }
  return zones
}

/**
 * Flat config blocks for the import boundary: outside the zone, inside it,
 * then one block per governed file (named writers, their callers, allowlisted
 * pages). A later block replaces a rule's options, so each
 * per-file block repeats what the file gets from the rest of the config:
 * `restrictedImports` (the `no-restricted-imports` patterns every file has)
 * and `syntaxFor(file)` (its other `no-restricted-syntax` selectors).
 */
export function codexImportBlocks(root, { restrictedImports, syntaxFor }) {
  const paths = (zones) => ({
    "import/no-restricted-paths": zones.length ? ["error", { basePath: root, zones }] : "off",
  })
  const allowances = codexAllowances()
  const governed = [...new Set([...allowances.map((a) => a.file), ...CODEX_SERVER_WRITERS.map((w) => w.file)])]
  return [
    { files: CODEX_SOURCE, ignores: [...zoneGlobs, ...TESTS], rules: paths(codexZones(null, true)) },
    { files: zoneGlobs, ignores: TESTS, rules: paths(codexZones(null, false)) },
    ...governed.map((file) => {
      const own = allowances.filter((a) => a.file === file)
      const syntax = [...syntaxFor(file), ...own.flatMap(dynamicSelectors)]
      const imports = own.map((a) => ({
        regex: codexSpecifier(file, a.module),
        caseSensitive: true,
        allowImportNames: a.names,
        message: `C-200: ${file} may import only ${a.names.join(", ")} from ${a.module}.`,
      }))
      return {
        files: [globEscape(file)],
        rules: {
          ...paths(codexZones(file, !inCodexZone(file))),
          "no-restricted-imports": ["error", { patterns: [...restrictedImports, ...imports] }],
          "no-restricted-syntax": syntax.length ? ["error", ...syntax] : "off",
        },
      }
    }),
  ]
}

/** The URL selectors for a file (named files are never tests). */
export const codexUrlSelectorsFor = (file) =>
  inCodexZone(file) || CODEX_URL_PROSE.includes(file) || CODEX_SWITCH_ALLOWLIST.some((a) => a.file === file) ? [] : CODEX_URL_SELECTORS
