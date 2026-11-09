/**
 * B31 FC9 (C2): MART.VW_PLATFORM_SPEND_LINE_DAY is the platform spend month
 * view grouped by day as well. Its body must stay the month view's body
 * (sources, relabel through label_map_one, filters), so a day split of a
 * month adds back to that month. The migration holds the same text as the
 * views file, keeps grants (COPY GRANTS) and grants the same three roles.
 * The label map fan-out guard (labelMapFanOut.b29.test.ts) scans it too.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const MART = join(here, "../../../sql/snowflake/mart")
const read = (rel: string) => readFileSync(join(MART, rel), "utf8")

const DAY_VIEW = "views/vw_platform_spend_line_day.sql"
const MONTH_VIEW = "views/vw_platform_spend_line_month.sql"
const MIGRATION = "migrations/2026-11-10_FC9_platform_spend_line_day_ACCOUNTADMIN.sql"

function createBlock(sql: string, view: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.${view}`)
  assert.ok(start >= 0, `no CREATE for ${view}`)
  const lastGrant = sql.lastIndexOf(`GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.${view}`)
  assert.ok(lastGrant > start, `no GRANT for ${view}`)
  return sql.slice(start, sql.indexOf(";", lastGrant) + 1)
}

/** From the first CTE to the end of all_rows: the part both views share. */
function sharedBody(sql: string): string {
  const start = sql.indexOf("WITH dv360 AS (")
  const end = sql.indexOf("\nSELECT\n  LOWER(TRIM(line_item_id))")
  assert.ok(start > 0 && end > start, "body markers")
  return sql.slice(start, end)
}

describe("VW_PLATFORM_SPEND_LINE_DAY (FC9)", () => {
  it("the migration holds the same view text as the views file", () => {
    assert.equal(
      createBlock(read(MIGRATION), "VW_PLATFORM_SPEND_LINE_DAY"),
      createBlock(read(DAY_VIEW), "VW_PLATFORM_SPEND_LINE_DAY"),
    )
  })

  it("shares the month view's body (B29 LM1 text) up to the final SELECT", () => {
    assert.equal(sharedBody(read(DAY_VIEW)), sharedBody(read(MONTH_VIEW)))
    assert.match(sharedBody(read(DAY_VIEW)), /LEFT JOIN label_map_one m/)
  })

  it("groups by day: DATE_DAY in the columns, the SELECT and the GROUP BY", () => {
    const block = createBlock(read(DAY_VIEW), "VW_PLATFORM_SPEND_LINE_DAY")
    assert.match(
      block,
      /COPY GRANTS \(\n  LINE_ITEM_ID,\n  DATE_DAY,\n  MONTH,\n  SOURCE,\n  CHANNEL,\n  AMOUNT_SPENT,\n  MEDIA_COST,\n  IMPRESSIONS,\n  ROW_COUNT\n\) AS/,
    )
    assert.match(block, /date_day +AS DATE_DAY,/)
    assert.match(block, /GROUP BY 1, 2, 3, 4, 5;/)
    assert.doesNotMatch(block, /FIRST_DAY|LAST_DAY/)
  })

  it("keeps grants on a re-run and grants the app and Claude roles", () => {
    const block = createBlock(read(MIGRATION), "VW_PLATFORM_SPEND_LINE_DAY")
    assert.match(block, /^CREATE OR REPLACE VIEW ASSEMBLEDVIEW\.MART\.VW_PLATFORM_SPEND_LINE_DAY COPY GRANTS \(/)
    for (const role of ["AV_APP_WRITE_ROLE", "AV_APP_READ_ROLE", "CLAUDE_RW"]) {
      assert.match(block, new RegExp(`GRANT SELECT ON VIEW ASSEMBLEDVIEW\\.MART\\.VW_PLATFORM_SPEND_LINE_DAY TO ROLE ${role};`))
    }
  })

  it("the migration has before and after checks and a rollback, all commented out", () => {
    const sql = read(MIGRATION)
    assert.match(sql, /----- Before -----/)
    assert.match(sql, /----- After -----/)
    assert.match(sql, /-- DROP VIEW IF EXISTS ASSEMBLEDVIEW\.MART\.VW_PLATFORM_SPEND_LINE_DAY;/)
    // The only live statements: USE, the CREATE and the three GRANTs.
    const live = sql
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("--"))
      .join("\n")
    assert.equal((live.match(/;/g) ?? []).length, 2 + 1 + 3)
    assert.doesNotMatch(live, /\b(DELETE|UPDATE|INSERT|MERGE|DROP|TRUNCATE|ALTER)\b/i)
  })

  it("does not touch the month view", () => {
    assert.doesNotMatch(read(MIGRATION), /CREATE OR REPLACE VIEW ASSEMBLEDVIEW\.MART\.VW_PLATFORM_SPEND_LINE_MONTH/)
  })
})
