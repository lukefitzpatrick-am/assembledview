/**
 * C-200 (decision 3 B, S32 A, B51): tasks are written only in Tasks. The lint
 * module boundary that eslint.config.mjs applies: outside the zone, nothing
 * imports lib/codex (but its read modules), the /tasks UI or a Codex route
 * handler, and no string holds a /api/codex URL (read through `codexGet`).
 * Named server writers and the switch allowlist are the only exceptions.
 * Self-test: scripts/__tests__/eslint-codex-boundary.test.mjs.
 */

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
const CODEX_READ_MODULES = [
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
 * the zone modules it may import. `callers`: the only files that may import
 * it, the zone included ("any": every file).
 */
export const CODEX_SERVER_WRITERS = [
  {
    file: "lib/pacing/relabel/handlers.ts",
    may: ["lib/codex/repo.ts"],
    callers: [
      "app/api/pacing/relabels/route.ts",
      "app/api/pacing/relabels/[id]/route.ts",
      "app/api/pacing/relabels/preview/route.ts",
      "app/api/pacing/relabels/apply/route.ts",
      "app/api/pacing/relabels/[id]/revert/route.ts",
    ],
    why: "relabel apply, revert and block make a task for the person who acted",
  },
  {
    file: "lib/pacing/relabel/autoClose.ts",
    may: ["lib/codex/repo.ts"],
    callers: ["app/api/cron/pacing-digest/route.ts"],
    why: "the relabel auto-close completes the request task as system:relabel (C-264)",
  },
  {
    file: "lib/fireflies/proposalRepo.ts",
    may: ["lib/codex/repo.ts"],
    callers: [
      "lib/fireflies/runSync.ts",
      "app/api/codex/proposals/route.ts",
      "app/api/codex/proposals/expire-stale/route.ts",
      "app/api/codex/proposals/dismiss-all/route.ts",
      "app/api/codex/proposals/[id]/accept/route.ts",
      "app/api/codex/proposals/[id]/dismiss/route.ts",
      "app/api/codex/tasks/[id]/dismiss-auto/route.ts",
      "app/api/cron/codex-recurring/route.ts",
    ],
    why: "meeting action items: the Inbox accept and the Fireflies sync",
  },
  {
    file: "app/api/cron/codex-recurring/route.ts",
    may: ["lib/codex/runRecurring.ts"],
    callers: [],
    why: "the recurring task cron, system:recurring",
  },
  {
    file: "lib/auth0.ts",
    may: ["lib/codex/auth0LoginUpsert.ts"],
    callers: "any",
    why: "an admin's login adds or refreshes their roster row, fail soft, inside the login hook",
  },
  {
    file: "app/api/cron/auth0-roster-sync/route.ts",
    may: ["lib/codex/auth0RosterSync.ts"],
    callers: [],
    why: "the nightly Auth0 admin roster sync",
  },
  {
    file: "app/api/admin/auth0-roster-sync/route.ts",
    may: ["lib/codex/auth0RosterSync.ts"],
    callers: [],
    why: "an admin runs the same roster sync by hand",
  },
  {
    file: "app/api/cron/codex-notifications/route.ts",
    may: ["lib/codex/notificationsRepo.ts"],
    callers: [],
    why: "the daily cron writes due reminders and marks digests sent",
  },
]

/**
 * The switch allowlist: the pages that wrote tasks before
 * `codex_contained_writes` keep their old code for switch off. Allowed only
 * while the switch is in lib/features/registry.ts (the self-test fails once it
 * is gone: delete the old paths and this list). `may`: zone files it imports.
 */
export const CODEX_SWITCH_ALLOWLIST = [
  { file: "components/pacing/detail/CampaignAskHelpDialog.tsx", may: [] },
  { file: "components/pacing/scenario/ScenarioPlannerContext.tsx", may: [] },
  { file: "components/pacing/scenario/ScenarioPlannerDrawer.tsx", may: [] },
  { file: "components/creative/CreativeAdminLanding.tsx", may: ["components/tasks/TaskFormDialog.tsx"] },
]

/** Files outside the zone that name /api/codex without calling it. */
const CODEX_URL_PROSE = [
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
export const inCodexZone = (file) => CODEX_ZONE.some((d) => file.startsWith(`${d}/`))
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
 * The `import/no-restricted-paths` zones for a file outside the zone
 * (`inside` false) or in it. `file` null: no allowance (any other file).
 */
export function codexZones(file, inside) {
  const may = [...CODEX_SERVER_WRITERS, ...CODEX_SWITCH_ALLOWLIST].filter((e) => e.file === file).flatMap((e) => e.may)
  const zones = []
  if (!inside) {
    for (const from of CODEX_ZONE) {
      const except = [...(from === "lib/codex" ? CODEX_READ_MODULES : []), ...may]
        .filter((m) => m.startsWith(`${from}/`))
        .map((m) => m.slice(from.length + 1))
      zones.push({ target: ".", from, except, message: MESSAGE })
    }
  }
  for (const w of CODEX_SERVER_WRITERS) {
    if (w.callers === "any" || w.file === file || w.callers.includes(file)) continue
    zones.push({ target: ".", from: w.file, message: `C-200 exception (${w.why}): only its named callers may import it.` })
  }
  return zones
}

/** Flat config blocks for the import boundary: outside the zone, inside it, then each named file. */
export function codexImportBlocks(root) {
  const rule = (zones) => ({
    "import/no-restricted-paths": zones.length ? ["error", { basePath: root, zones }] : "off",
  })
  const named = [
    ...new Set([
      ...CODEX_SERVER_WRITERS.flatMap((w) => [w.file, ...(w.callers === "any" ? [] : w.callers)]),
      ...CODEX_SWITCH_ALLOWLIST.map((a) => a.file),
    ]),
  ]
  return [
    { files: CODEX_SOURCE, ignores: [...zoneGlobs, ...TESTS], rules: rule(codexZones(null, false)) },
    { files: zoneGlobs, ignores: TESTS, rules: rule(codexZones(null, true)) },
    ...named.map((file) => ({
      files: [globEscape(file)],
      rules: rule(codexZones(file, inCodexZone(file))),
    })),
  ]
}
