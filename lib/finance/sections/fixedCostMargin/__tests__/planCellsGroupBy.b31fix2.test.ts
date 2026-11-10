/**
 * B31fix2 H1: with `fixed_cost_margin_from_date` on, the plan cells SQL adds
 * `li.fixed_cost_from` as select column 16. B31 grouped it as `, 15`, which is
 * `SUM(sm.amount_cents)`, and live Postgres rejected the query (42803), so the
 * whole margin report would return 500. The date is now grouped by name.
 *
 * The guard: for both switch states, every GROUP BY ordinal names a select
 * column with no aggregate, and every other select column is grouped. The
 * guard fails closed on SQL it can't parse. Live (read only, 10 Nov): the
 * switch-on text returns 990 rows, the same rows as switch off.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import { PgDialect } from "drizzle-orm/pg-core"

import { planCellsSql } from "../query.js"
import { checkGroupBy } from "./fixtures/sqlGroupBy.js"

const dialect = new PgDialect()
const render = (on: boolean, clientIds: number[] = []) => dialect.sqlToQuery(planCellsSql({ clientIds }, on)).sql

/** sha256 of the switch-off text (all clients) at patch 0154, before B31fix2. Off must never move. */
const OFF_SQL_SHA256 = "4e036ed9e05ce1c970a9611514f8d66eabcf4cbcafa795bca1747bf02f87e805"

test("switch off: the plan cells SQL text is byte-identical to before", () => {
  assert.equal(createHash("sha256").update(render(false)).digest("hex"), OFF_SQL_SHA256)
})

for (const on of [false, true]) {
  for (const clientIds of [[], [24, 31]]) {
    test(`GROUP BY guard: switch ${on ? "on" : "off"}, clients ${clientIds.length ? clientIds.join(",") : "all"}`, () => {
      const r = checkGroupBy(render(on, clientIds))
      assert.deepEqual(r.problems, [])
      assert.equal(r.columns.length, on ? 16 : 15)
      const aggregates = r.columns.filter((c) => c.aggregate).map((c) => `${c.position} ${c.alias}`)
      assert.deepEqual(aggregates, ["15 amount_cents"])
      assert.deepEqual(r.groupBy, [...Array.from({ length: 14 }, (_, i) => String(i + 1)), ...(on ? ["li.fixed_cost_from"] : [])])
      if (on) assert.equal(r.columns[15]!.alias, "fixed_cost_from")
    })
  }
}

// ---------------------------------------------------------------------------
// The guard catches the H1 class, and fails closed
// ---------------------------------------------------------------------------

const ON = render(true)
const GROUP_TAIL = "13, 14, li.fixed_cost_from\n"

test("guard: B31's `, 15` (the SUM) is caught", () => {
  assert.ok(ON.includes(GROUP_TAIL))
  const r = checkGroupBy(ON.replace(GROUP_TAIL, "13, 14, 15\n"))
  assert.ok(r.problems.some((p) => /GROUP BY 15 is an aggregate \(amount_cents\): Postgres 42803/.test(p)), r.problems.join("; "))
  // And the date column it meant to group is left ungrouped.
  assert.ok(r.problems.some((p) => /select column 16 \(fixed_cost_from\) is not grouped/.test(p)), r.problems.join("; "))
})

test("guard: `, 16` by ordinal is also accepted (the fix shape is not what the guard pins)", () => {
  assert.deepEqual(checkGroupBy(ON.replace(GROUP_TAIL, "13, 14, 16\n")).problems, [])
})

test("guard: an ordinal past the select list, a repeat, a dropped column", () => {
  assert.ok(checkGroupBy(ON.replace(GROUP_TAIL, "13, 14, 17\n")).problems.some((p) => /only 16 select columns/.test(p)))
  assert.ok(checkGroupBy(ON.replace(GROUP_TAIL, "13, 14, 14, li.fixed_cost_from\n")).problems.some((p) => /14 repeated/.test(p)))
  assert.ok(checkGroupBy(ON.replace(GROUP_TAIL, "13, li.fixed_cost_from\n")).problems.some((p) => /select column 14 \(month\) is not grouped/.test(p)))
  assert.ok(checkGroupBy(ON.replace(GROUP_TAIL, "13, 14\n")).problems.some((p) => /select column 16 \(fixed_cost_from\) is not grouped/.test(p)))
})

test("guard fails closed on SQL it can't read", () => {
  const unparsed = (text: string) => {
    const r = checkGroupBy(text)
    assert.ok(r.problems.some((p) => p.startsWith("unparsed:")), `${r.problems.join("; ")} for ${text.slice(-80)}`)
  }
  unparsed(ON.replace(GROUP_TAIL, "13, 14, li.fixed_cost_from -- note\n"))
  unparsed(ON.replace(GROUP_TAIL, "13, 14, li.fixed_cost_from\n HAVING SUM(sm.amount_cents) > 0\n"))
  unparsed(ON.replace(GROUP_TAIL, "13, 14, LOWER(li.fixed_cost_from::text)\n"))
  unparsed(ON.replace(" AS fixed_cost_from\n", "\n"))
  unparsed(ON.replace("SUM(sm.amount_cents)::bigint", "SUM(sm.amount_cents) OVER ()"))
  unparsed(ON.replace("'Unknown'", "'Unknown"))
  unparsed(`${ON} UNION ALL ${ON}`)
  unparsed(ON.replace("GROUP BY", "GROUP  BY 1 GROUP BY"))
  unparsed("SELECT 1 AS one FROM t")
})

test("guard fails closed on a comment that would hide the H1 bug from a reader that skipped comments", () => {
  // Postgres sees 16 columns and GROUP BY 15 = the SUM (42803). A reader that
  // took the comment as a column would see 17, with 15 the constant "1 AS a".
  const hidden = ON.replace("      SUM(sm.amount_cents)", "      -- 1 AS a,\n      SUM(sm.amount_cents)").replace(
    GROUP_TAIL,
    "13, 14, 15, li.fixed_cost_from\n",
  )
  const r = checkGroupBy(hidden)
  assert.ok(r.problems.length > 0)
  assert.ok(r.problems.every((p) => p.startsWith("unparsed:")), r.problems.join("; "))
})

test("guard reads through literals: commas, brackets and keywords inside quotes are text", () => {
  const r = checkGroupBy(
    "SELECT t.a AS a, COALESCE(t.b, 'x, ) FROM GROUP BY') AS b, COUNT(*) AS n FROM t GROUP BY 1, 2",
  )
  assert.deepEqual(r.problems, [])
  assert.deepEqual(r.columns.map((c) => c.aggregate), [false, false, true])
})
