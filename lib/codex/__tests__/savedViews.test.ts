/**
 * Codex saved views (F8, B37): pure helpers and the store against a
 * capturing drizzle.mock() (no database).
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { drizzle } from "drizzle-orm/postgres-js"

import type { Db } from "@/db"
import * as schema from "@/db/schema"
import { serializeTasksFilterParams } from "../queryHelpers.js"
import {
  canonicalSavedViewFilters,
  filtersFromQueryString,
  parseSavedViewInput,
  parseSavedViewParam,
  parseSavedViewPatch,
  sanitiseSavedViewFilters,
  savedViewHref,
  savedViewMatches,
  savedViewToolbarState,
  withSavedViewParam,
} from "../savedViews.js"
import {
  createSavedView,
  deleteSavedView,
  isMissingSavedViewsTable,
  listSavedViews,
  resetSavedViewsMarkerCacheForTests,
  savedViewRowToApi,
  SavedViewsLimitError,
  SavedViewsUnavailableError,
  SAVED_VIEWS_PER_OWNER_MAX,
  updateSavedView,
} from "../savedViewsRepo.js"

// ---------- pure ----------

test("filters: known keys with short string values only", () => {
  assert.deepEqual(
    sanitiseSavedViewFilters({ status: " todo ", view: "list", task: "4", evil: "x", q: 7, client: "", mba: "x".repeat(201) }),
    { status: "todo" }
  )
  assert.deepEqual(sanitiseSavedViewFilters(null), {})
  assert.deepEqual(sanitiseSavedViewFilters(["status"]), {})
})

test("filters from a query string drop view and task", () => {
  assert.deepEqual(filtersFromQueryString("status=todo&view=list&task=9&all=1"), { status: "todo", all: "1" })
})

test("canonical filters equal what the page writes for the same state", () => {
  const qs = serializeTasksFilterParams({ statuses: ["todo", "waiting"], mine: false, clientId: "12", sort: "priority_desc" })
  assert.deepEqual(canonicalSavedViewFilters(filtersFromQueryString(qs)), filtersFromQueryString(qs))
  // Defaults drop out: My tasks and due_asc are the omitted defaults.
  assert.deepEqual(canonicalSavedViewFilters({ sort: "due_asc" }), {})
})

test("a view matches the toolbar when filters and layout agree", () => {
  const view = { filters: { status: "todo", all: "1" }, layout: "list" as const }
  assert.equal(savedViewMatches(view, { filters: { all: "1", status: "todo" }, layout: "list" }), true)
  assert.equal(savedViewMatches(view, { filters: { all: "1", status: "todo" }, layout: "board" }), false)
  assert.equal(savedViewMatches(view, { filters: { all: "1" }, layout: "list" }), false)
  assert.equal(savedViewMatches({ ...view, layout: null }, { filters: { status: "todo", all: "1" }, layout: "board" }), true)
})

test("?view=: a positive whole number is a saved view; list and board are the layout", () => {
  assert.equal(parseSavedViewParam("12"), 12)
  assert.equal(parseSavedViewParam("list"), null)
  assert.equal(parseSavedViewParam("board"), null)
  assert.equal(parseSavedViewParam("0"), null)
  assert.equal(parseSavedViewParam("-3"), null)
  assert.equal(parseSavedViewParam("1e3"), null)
  assert.equal(parseSavedViewParam("99999999999999999"), null)
  assert.equal(parseSavedViewParam(null), null)
})

test("view links: filters plus view=<id>; the active view replaces the layout param", () => {
  assert.equal(savedViewHref({ id: 5, filters: { status: "todo" } }), "/tasks?status=todo&view=5")
  assert.equal(withSavedViewParam("status=todo&view=list", 5), "status=todo&view=5")
  assert.equal(withSavedViewParam("status=todo&view=list", null), "status=todo&view=list")
})

test("create body: name required and capped, defaults, enums checked, filters canonical", () => {
  const ok = parseSavedViewInput({ name: "  My   SEO  ", filters: { status: "todo", sort: "due_asc", view: "list" }, layout: "list" })
  assert.deepEqual(ok, {
    ok: true,
    value: { name: "My SEO", screen: "tasks", lens: "plan", filters: { status: "todo" }, layout: "list", group_by: null, shared: false },
  })
  assert.equal(parseSavedViewInput({ name: "" }).ok, false)
  assert.equal(parseSavedViewInput({ name: "x".repeat(81) }).ok, false)
  assert.equal(parseSavedViewInput({ name: "a", screen: "projects" }).ok, false)
  assert.equal(parseSavedViewInput({ name: "a", lens: "zen" }).ok, false)
  assert.equal(parseSavedViewInput({ name: "a", layout: "gantt" }).ok, false)
  assert.equal(parseSavedViewInput({ name: "a", group_by: "client" }).ok, false)
  assert.equal(parseSavedViewInput({ name: "a", filters: "status=todo" }).ok, false)
  assert.equal(parseSavedViewInput({ name: "a", shared: "yes" }).ok, false)
  assert.equal(parseSavedViewInput(null).ok, false)
})

test("patch body: name and or shared; something to change", () => {
  assert.deepEqual(parseSavedViewPatch({ name: " New " }), { ok: true, value: { name: "New" } })
  assert.deepEqual(parseSavedViewPatch({ shared: true }), { ok: true, value: { shared: true } })
  assert.equal(parseSavedViewPatch({}).ok, false)
  assert.equal(parseSavedViewPatch({ shared: 1 }).ok, false)
  assert.equal(parseSavedViewPatch({ name: "" }).ok, false)
})

test("a saved view round-trips: toolbar state -> filters -> toolbar state shows the same query", () => {
  const cases = [
    { statuses: ["todo", "waiting"], mine: false, clientId: "12", sort: "priority_desc", search: "seo" },
    { myWeek: true, mine: true, category: "reporting" },
    { unassigned: true, mine: false, noClient: true, overdue: true, sources: ["ava"], priorities: ["high"] },
    { mine: false, assigneeEmail: "alex@x.au", createdByEmail: "luke@x.au", dueFrom: "2026-11-01", dueTo: "2026-11-30", mbaNumber: "KRUS015" },
  ]
  for (const c of cases) {
    const qs = serializeTasksFilterParams({ ...c, view: "list" })
    const view = { filters: filtersFromQueryString(qs), layout: "list" as const }
    const state = savedViewToolbarState(view)
    const again = serializeTasksFilterParams({ ...state.filters, sort: state.sort, view: state.layout })
    assert.equal(again, qs, JSON.stringify(c))
    assert.equal(savedViewMatches(view, { filters: filtersFromQueryString(again), layout: "list" }), true)
  }
})

// ---------- store ----------

type Captured = { sql: string; params: unknown[] }

/** Each awaited query takes the next entry: rows, or an Error to throw. */
function scriptedDb(script: Array<unknown[] | Error>): { db: Db; captured: Captured[] } {
  const base = drizzle.mock({ schema })
  const captured: Captured[] = []
  const wrap = (target: object): unknown =>
    new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
            try {
              const built = (obj as { toSQL: () => Captured }).toSQL()
              captured.push({ sql: built.sql, params: [...built.params] })
              const next = script.shift()
              if (next instanceof Error) reject(next)
              else resolve(next ?? [])
            } catch (error) {
              reject(error)
            }
          }
        }
        const value = Reflect.get(obj, prop, receiver)
        if (typeof value !== "function") return value
        return (...args: unknown[]) => {
          const out = value.apply(obj, args)
          return out && typeof out === "object" ? wrap(out) : out
        }
      },
    })
  return { db: wrap(base) as Db, captured }
}

const MARKER = [{ key: "0117_codex_saved_views" }]
const row = (over: Record<string, unknown> = {}) => ({
  id: 3,
  ownerEmail: "luke@x.au",
  name: "Mine",
  screen: "tasks",
  lens: "plan",
  filters: { status: "todo" },
  layout: "list",
  groupBy: null,
  shared: false,
  createdAt: "2026-11-13T00:00:00Z",
  ...over,
})

test("no marker: unavailable, and the table is never queried", async () => {
  resetSavedViewsMarkerCacheForTests()
  const { db, captured } = scriptedDb([[]])
  await assert.rejects(listSavedViews("luke@x.au", "tasks", db), SavedViewsUnavailableError)
  assert.equal(captured.length, 1)
  assert.match(captured[0].sql, /from "migration_markers"/)
})

test("marker present but table missing (42P01): unavailable", async () => {
  resetSavedViewsMarkerCacheForTests()
  const missing = Object.assign(new Error('relation "codex_saved_views" does not exist'), { code: "42P01" })
  const { db } = scriptedDb([MARKER, missing])
  await assert.rejects(listSavedViews("luke@x.au", "tasks", db), SavedViewsUnavailableError)
  assert.equal(isMissingSavedViewsTable({ cause: { code: "42P01" } }), true)
  assert.equal(isMissingSavedViewsTable(new Error("connection reset")), false)
})

test("list: own or shared for the screen, owner compared lower-case; mine flag set", async () => {
  resetSavedViewsMarkerCacheForTests()
  const { db, captured } = scriptedDb([MARKER, [row(), row({ id: 4, ownerEmail: "sam@x.au", shared: true })]])
  const items = await listSavedViews("Luke@X.au", "tasks", db)
  const q = captured[1]
  assert.match(q.sql, /where \("codex_saved_views"\."screen" = \$1 and \(lower\("codex_saved_views"\."owner_email"\) = \$2 or "codex_saved_views"\."shared" = \$3\)\)/)
  assert.deepEqual(q.params.slice(0, 3), ["tasks", "luke@x.au", true])
  assert.deepEqual(items.map((v) => [v.id, v.mine]), [[3, true], [4, false]])
})

test("marker is cached once seen", async () => {
  resetSavedViewsMarkerCacheForTests()
  const first = scriptedDb([MARKER, []])
  await listSavedViews("luke@x.au", "tasks", first.db)
  const second = scriptedDb([[]])
  await listSavedViews("luke@x.au", "tasks", second.db)
  assert.equal(second.captured.length, 1)
  assert.match(second.captured[0].sql, /from "codex_saved_views"/)
})

test("create: lower-cases the owner; refuses at the per-person limit", async () => {
  resetSavedViewsMarkerCacheForTests()
  const input = { name: "A", screen: "tasks" as const, lens: "plan" as const, filters: {}, layout: null, group_by: null, shared: true }
  const okDb = scriptedDb([MARKER, [{ n: 2 }], [row({ ownerEmail: "luke@x.au", shared: true })]])
  const view = await createSavedView("Luke@X.au", input, okDb.db)
  assert.equal(view.mine, true)
  const insert = okDb.captured[2]
  assert.match(insert.sql, /^insert into "codex_saved_views"/)
  assert.ok(insert.params.includes("luke@x.au"))
  const fullDb = scriptedDb([[{ n: SAVED_VIEWS_PER_OWNER_MAX }]])
  await assert.rejects(createSavedView("luke@x.au", input, fullDb.db), SavedViewsLimitError)
  assert.equal(fullDb.captured.length, 1, "no insert at the limit")
})

test("update and delete: owner only; someone else's shared view is not_owner, private is not_found", async () => {
  resetSavedViewsMarkerCacheForTests()
  const none = scriptedDb([MARKER, []])
  assert.deepEqual(await updateSavedView(9, "luke@x.au", { name: "B" }, none.db), { ok: false, reason: "not_found" })
  const shared = scriptedDb([[{ ownerEmail: "sam@x.au", shared: true }]])
  assert.deepEqual(await updateSavedView(9, "luke@x.au", { name: "B" }, shared.db), { ok: false, reason: "not_owner" })
  assert.equal(shared.captured.length, 1, "no write for a non-owner")
  const priv = scriptedDb([[{ ownerEmail: "sam@x.au", shared: false }]])
  assert.deepEqual(await deleteSavedView(9, "luke@x.au", priv.db), { ok: false, reason: "not_found" })
  assert.equal(priv.captured.length, 1, "no delete for a non-owner")

  const own = scriptedDb([[{ ownerEmail: "LUKE@x.au", shared: false }], [row({ name: "B" })]])
  const updated = await updateSavedView(3, "luke@x.au", { name: "B" }, own.db)
  assert.equal(updated.ok, true)
  assert.match(own.captured[1].sql, /^update "codex_saved_views" set "name" = \$1 where \("codex_saved_views"\."id" = \$2 and lower\("codex_saved_views"\."owner_email"\) = \$3\)/)

  const del = scriptedDb([[{ ownerEmail: "luke@x.au", shared: true }], [{ id: 3 }]])
  assert.deepEqual(await deleteSavedView(3, "luke@x.au", del.db), { ok: true })
  assert.match(del.captured[1].sql, /^delete from "codex_saved_views" where \("codex_saved_views"\."id" = \$1 and lower\("codex_saved_views"\."owner_email"\) = \$2\)/)
})

test("row mapping: bad layout and lens fall back; filters sanitised", () => {
  const view = savedViewRowToApi(
    row({ layout: "gantt", lens: "zen", filters: { status: "todo", view: "list", hack: "1" } }) as never,
    "other@x.au"
  )
  assert.equal(view.layout, null)
  assert.equal(view.lens, "plan")
  assert.deepEqual(view.filters, { status: "todo" })
  assert.equal(view.mine, false)
})
