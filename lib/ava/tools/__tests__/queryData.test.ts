/**
 * query_data: admins only, ava_data_query on, never on /tasks; one SELECT or
 * WITH statement, capped at the database and again before the model.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

import { avaToolDefinitionsForPage } from "../pageToolOffer"
import { QUERY_DATA_ROW_CAP, queryDataGate, queryDataTool, readOnlySql, shapeRows, wrapWithLimit } from "../queryData"
import { AVA_TOOL_TAGS } from "../toolAccess"

const tool = [{ name: "query_data" }, { name: "get_campaign_context" }]
const page = (pathname: string) => ({ route: { pathname } }) as never
const flags = (dataQuery: boolean) => ({ billingRevisions: false, trueUp: false, dataQuery })

test("readOnlySql keeps one SELECT or WITH and refuses the rest", () => {
  assert.equal(readOnlySql("  select 1;  "), "select 1")
  assert.equal(readOnlySql("WITH a AS (select 1) select * from a"), "WITH a AS (select 1) select * from a")
  for (const bad of ["delete from clients", "select 1; delete from clients", "select 1) q; drop table x; select (1", "update x set a=1", "", "explain select 1"]) {
    assert.equal(readOnlySql(bad), null, bad)
  }
})

test("wrapWithLimit asks for one row past the cap, and a trailing comment can't swallow the close", () => {
  const sql = wrapWithLimit("select 1 -- note")
  assert.match(sql, /\n\) ava_q limit 201$/)
  assert.equal(QUERY_DATA_ROW_CAP, 200)
})

test("shapeRows caps rows, cells and size, and says when it cut", () => {
  const rows = Array.from({ length: 250 }, (_, i) => ({ i, note: "x".repeat(900) }))
  const out = JSON.parse(shapeRows("supabase", rows))
  assert.equal(out.truncated, true)
  assert.ok(out.rowCount <= 200)
  assert.ok(out.rows[0].note.length <= 501)
  assert.ok(shapeRows("supabase", rows).length <= 60_000)
  const small = JSON.parse(shapeRows("snowflake", [{ a: 1 }]))
  assert.deepEqual(small, { source: "snowflake", rowCount: 1, truncated: false, rows: [{ a: 1 }] })
})

test("admins only", async () => {
  assert.equal(await queryDataGate({ roles: ["admin"] }), null)
  const refused = await queryDataGate({ roles: ["client"] as never })
  assert.equal(refused?.isError, true)
  const viaTool = await queryDataTool.execute({ source: "supabase", sql: "select 1" }, { roles: [] } as never)
  assert.equal(viaTool.isError, true)
})

test("offered only with ava_data_query on, and never on /tasks", () => {
  const names = (f: boolean, p: string) => avaToolDefinitionsForPage(tool, page(p), flags(f)).map((t) => t.name)
  assert.ok(!names(false, "/finance").includes("query_data"))
  assert.ok(names(true, "/finance").includes("query_data"))
  assert.ok(names(true, "/pacing/portfolio").includes("query_data"))
  assert.ok(!names(true, "/tasks").includes("query_data"))
  assert.equal(AVA_TOOL_TAGS.query_data.access, "read")
})

test("the switch is off by default and the Snowflake role file grants SELECT and USAGE only", async () => {
  const { featureDefinition } = await import("@/lib/features/registry")
  assert.equal(featureDefinition("ava_data_query")?.defaultOn, false)
  const sql = fs.readFileSync(path.join(process.cwd(), "sql/snowflake/roles/AVA_READONLY.sql"), "utf8")
  const grants = [...sql.matchAll(/^GRANT\s+(.+?)\s+ON\s/gim)].map((m) => m[1]!.toUpperCase())
  assert.ok(grants.length >= 6)
  for (const g of grants) assert.ok(g === "USAGE" || g === "SELECT", g)
  assert.doesNotMatch(sql, /^GRANT\s+(INSERT|UPDATE|DELETE|ALL|OWNERSHIP|CREATE)/im)
})
