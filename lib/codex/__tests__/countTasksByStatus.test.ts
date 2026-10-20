/**
 * countTasksByStatus SQL shape (no database).
 *
 * Prod 42803 (Oct 2026): a parameterised CASE in SELECT and GROUP BY got
 * separate $n placeholders, so Postgres saw two different expressions.
 * These tests render the real query through drizzle.mock() and pin that the
 * GROUP BY has no bind parameters and matches the selected column.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { drizzle } from "drizzle-orm/postgres-js"

import type { Db } from "@/db"
import * as schema from "@/db/schema"
import { countTasksByStatus } from "../repo.js"

type Captured = { sql: string; params: unknown[] }

/**
 * Wraps drizzle.mock() so builder chains render SQL and resolve to `rows`
 * when awaited, instead of hitting a driver.
 */
function capturingDb(rows: unknown[]): { db: Db; captured: Captured[] } {
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
              resolve(rows)
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

function groupByClause(sqlText: string): string {
  const m = /group by (.*)$/i.exec(sqlText)
  assert.ok(m, `expected a GROUP BY in: ${sqlText}`)
  return m[1].trim()
}

test("countTasksByStatus groups by the raw status column with no bind params", async () => {
  const { db, captured } = capturingDb([])
  await countTasksByStatus(
    {
      mineForEmail: "luke.fitzpatrick@assembledmedia.com.au",
      status: ["backlog", "todo", "in_progress", "waiting", "done"],
    },
    db
  )
  assert.equal(captured.length, 1)
  const group = groupByClause(captured[0].sql)
  assert.equal(group, `"tasks"."status"`)
  assert.doesNotMatch(group, /\$\d/)
  assert.match(captured[0].sql, /^select "status", count\(\*\) from "tasks"/i)
})

test("countTasksByStatus folds unknown statuses into todo", async () => {
  const { db } = capturingDb([
    { status: "todo", c: 2 },
    { status: "legacy_open", c: 1 },
    { status: "done", c: 4 },
    { status: "in_progress", c: "3" },
  ])
  const counts = await countTasksByStatus({}, db)
  assert.deepEqual(counts, {
    backlog: 0,
    todo: 3,
    in_progress: 3,
    waiting: 0,
    done: 4,
  })
})
