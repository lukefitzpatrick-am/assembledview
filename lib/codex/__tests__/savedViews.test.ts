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
  canonicalFiltersForScreen,
  parseSavedViewScreen,
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
  listSavedViews,
  savedViewRowToApi,
  SavedViewsLimitError,
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

/** A builder's SQL (`toSQL`), or a raw `execute` query's (`getQuery`). */
function queryOf(obj: object): Captured {
  const q = obj as { toSQL?: () => Captured; getQuery?: () => Captured }
  return typeof q.toSQL === "function" ? q.toSQL() : q.getQuery!()
}

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
              const built = queryOf(obj)
              captured.push({ sql: built.sql, params: [...built.params] })
              const next = script.shift()
              if (next instanceof Error) reject(next)
              else resolve(next ?? [])
            } catch (error) {
              reject(error)
            }
          }
        }
        if (prop === "transaction") {
          return async (fn: (tx: unknown) => Promise<unknown>) => {
            captured.push({ sql: "begin", params: [] })
            return fn(wrap(obj))
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

/**
 * A small Postgres stand-in for concurrent creates: READ COMMITTED (a count
 * sees committed rows only), inserts commit when the transaction ends, and
 * pg_advisory_xact_lock blocks until the holder's transaction ends. Every
 * statement yields, so two creates interleave. Only the marker read may run
 * outside the transaction.
 */
function concurrentDb(committed: Array<{ ownerEmail: string }>) {
  const base = drizzle.mock({ schema })
  const locks = new Map<string, Promise<void>>()
  const statements: string[] = []
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
  const makeTx = (staged: Array<{ ownerEmail: string }>, held: Array<() => void>, inTx: boolean) => {
    const wrap = (target: object): unknown =>
      new Proxy(target, {
        get(obj, prop, receiver) {
          if (prop === "then") {
            return async (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
              try {
                const { sql: text, params } = queryOf(obj)
                statements.push(text)
                await tick()
                if (!inTx) return reject(new Error(`outside the create transaction: ${text}`))
                if (/pg_advisory_xact_lock/.test(text)) {
                  const key = String(params[0])
                  while (locks.has(key)) await locks.get(key)
                  let release!: () => void
                  locks.set(key, new Promise<void>((r) => (release = r)))
                  held.push(() => {
                    locks.delete(key)
                    release()
                  })
                  return resolve([{}])
                }
                if (/^select count\(\*\)/.test(text)) {
                  const owner = String(params[0])
                  return resolve([{ n: committed.filter((r) => r.ownerEmail.toLowerCase() === owner).length }])
                }
                if (/^insert into "codex_saved_views"/.test(text)) {
                  const owner = String(params.find((p) => typeof p === "string" && p.includes("@")))
                  staged.push({ ownerEmail: owner })
                  return resolve([row({ ownerEmail: owner })])
                }
                reject(new Error(`unexpected SQL: ${text}`))
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
    return wrap(base)
  }
  const db = new Proxy(makeTx([], [], false) as object, {
    get(obj, prop, receiver) {
      if (prop === "transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>) => {
          const staged: Array<{ ownerEmail: string }> = []
          const held: Array<() => void> = []
          try {
            const out = await fn(makeTx(staged, held, true))
            committed.push(...staged)
            return out
          } finally {
            for (const release of held) release()
          }
        }
      }
      return Reflect.get(obj, prop, receiver)
    },
  }) as Db
  return { db, statements }
}

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

test("list: own or shared for the screen, owner compared lower-case; mine flag set", async () => {
  const { db, captured } = scriptedDb([[row(), row({ id: 4, ownerEmail: "sam@x.au", shared: true })]])
  const items = await listSavedViews("Luke@X.au", "tasks", db)
  const q = captured[0]
  assert.match(q.sql, /where \("codex_saved_views"\."screen" = \$1 and \(lower\("codex_saved_views"\."owner_email"\) = \$2 or "codex_saved_views"\."shared" = \$3\)\)/)
  assert.deepEqual(q.params.slice(0, 3), ["tasks", "luke@x.au", true])
  assert.deepEqual(items.map((v) => [v.id, v.mine]), [[3, true], [4, false]])
})

test("create: lower-cases the owner; refuses at the per-person limit", async () => {
  const input = { name: "A", screen: "tasks" as const, lens: "plan" as const, filters: {}, layout: null, group_by: null, shared: true }
  const okDb = scriptedDb([[{}], [{ n: 2 }], [row({ ownerEmail: "luke@x.au", shared: true })]])
  const view = await createSavedView("Luke@X.au", input, okDb.db)
  assert.equal(view.mine, true)
  // One transaction: the owner's lock, the owner's count, the insert (no marker read, B48).
  assert.deepEqual(
    okDb.captured.map((c) => c.sql.split(" ").slice(0, 2).join(" ")),
    ["begin", "select pg_advisory_xact_lock(hashtextextended($1,", "select count(*)", "insert into"]
  )
  assert.deepEqual(okDb.captured[1].params, ["codex_saved_views:luke@x.au"])
  assert.match(okDb.captured[2].sql, /from "codex_saved_views" where lower\("codex_saved_views"\."owner_email"\) = \$1$/)
  assert.deepEqual(okDb.captured[2].params, ["luke@x.au"])
  const insert = okDb.captured[3]
  assert.match(insert.sql, /^insert into "codex_saved_views"/)
  assert.ok(insert.params.includes("luke@x.au"))
  const fullDb = scriptedDb([[{}], [{ n: SAVED_VIEWS_PER_OWNER_MAX }]])
  await assert.rejects(createSavedView("luke@x.au", input, fullDb.db), SavedViewsLimitError)
  assert.equal(fullDb.captured.filter((c) => /^insert/.test(c.sql)).length, 0, "no insert at the limit")
})

test("create: two saves at 49 views at the same time keep the limit (one 409, never 51)", async () => {
  const input = { name: "A", screen: "tasks" as const, lens: "plan" as const, filters: {}, layout: null, group_by: null, shared: false }
  const committed = Array.from({ length: SAVED_VIEWS_PER_OWNER_MAX - 1 }, () => ({ ownerEmail: "luke@x.au" }))
  committed.push({ ownerEmail: "sam@x.au" })
  const { db, statements } = concurrentDb(committed)
  const results = await Promise.allSettled([
    createSavedView("luke@x.au", input, db),
    createSavedView("Luke@X.au", input, db),
  ])
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1)
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
  assert.equal(rejected.length, 1)
  assert.ok(rejected[0].reason instanceof SavedViewsLimitError)
  assert.equal(committed.filter((r) => r.ownerEmail === "luke@x.au").length, SAVED_VIEWS_PER_OWNER_MAX)
  assert.equal(statements.filter((s) => /pg_advisory_xact_lock/.test(s)).length, 2)
  // Another person's save is not held up by the limit or the lock.
  await createSavedView("sam@x.au", input, db)
  assert.equal(committed.filter((r) => r.ownerEmail === "sam@x.au").length, 2)
})

test("update and delete: owner only; someone else's shared view is not_owner, private is not_found", async () => {
  const none = scriptedDb([[]])
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

test("B40: screens are tasks or project:<id>; a project view keeps its screen and the list's filter keys", () => {
  assert.equal(parseSavedViewScreen("tasks"), "tasks")
  assert.equal(parseSavedViewScreen("project:12"), "project:12")
  for (const bad of ["projects", "project:0", "project:x", "project:", 3, null]) assert.equal(parseSavedViewScreen(bad), null)
  const input = parseSavedViewInput({ name: "Mia", screen: "project:12", layout: "board", group_by: "section", filters: { assignee: "mia@x.au", mba: "x", q: " a " } })
  assert.ok(input.ok)
  assert.equal(input.value.screen, "project:12")
  assert.deepEqual(input.value.filters, { q: "a", assignee: "mia@x.au" })
  assert.deepEqual(canonicalFiltersForScreen("tasks", { status: "todo", field_7: "o1" }), canonicalSavedViewFilters({ status: "todo" }))
  const api = savedViewRowToApi(row({ screen: "project:12", filters: { due: "week", status: "todo" } }), "luke@x.au")
  assert.equal(api.screen, "project:12")
  assert.deepEqual(api.filters, { due: "week" })
  assert.equal(savedViewRowToApi(row({ screen: "weird" }), "luke@x.au").screen, "tasks")
})

test("B42 My Work: a saved view keeps the tab", async () => {
  const { savedViewToolbarState, sanitiseSavedViewFilters } = await import("../savedViews.js")
  assert.deepEqual(sanitiseSavedViewFilters({ mywork: "following", status: "todo" }), { mywork: "following", status: "todo" })
  const state = savedViewToolbarState({ filters: { mywork: "assigned_by" }, layout: "board" })
  assert.equal(state.filters.myWork, "assigned_by")
  assert.equal(savedViewToolbarState({ filters: {}, layout: null }).filters.myWork, null)
})
