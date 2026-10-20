/**
 * V_CREATIVE_PERFORMANCE_DAILY mba_number fallbacks
 * (sql/snowflake/mart/views/creative_web_search_views.sql). The view is SQL,
 * so this reads the two REGEXP_SUBSTR patterns from the file and runs them
 * the way the view does: first match wins, group 1, case-insensitive.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const SQL = readFileSync(
  path.join(process.cwd(), "sql/snowflake/mart/views/creative_web_search_views.sql"),
  "utf8",
)

function mbaPatterns(): RegExp[] {
  const start = SQL.indexOf("CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY")
  const from = SQL.indexOf("NULLIF(TRIM(m.mba_number)", start)
  const coalesce = SQL.slice(from, SQL.indexOf(") AS mba_number", from))
  const patterns = [...coalesce.matchAll(/'(\^[^']+\$)'/g)].map((m) => new RegExp(m[1]!, "i"))
  assert.equal(patterns.length, 2, "expected the coded and the no-code MBA patterns")
  return patterns
}

function viewMba(lineItemId: string): string | null {
  const id = lineItemId.trim().toLowerCase()
  for (const re of mbaPatterns()) {
    const m = id.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

test("coded line ids keep the prefix before the line code", () => {
  assert.equal(viewMba("hartm014sm1"), "hartm014")
  assert.equal(viewMba("golf025pv12"), "golf025")
  assert.equal(viewMba("candel001SM1"), "candel001")
})

test("bare MBAs and MBA plus line number with no code now match", () => {
  assert.equal(viewMba("hartm014"), "hartm014")
  assert.equal(viewMba("candel0011"), "candel001")
  assert.equal(viewMba("pgaaus0061"), "pgaaus006")
  assert.equal(viewMba("hartm0013"), "hartm001")
  assert.equal(viewMba("assembled001"), "assembled001")
})

test("platform ids and junk stay unmatched", () => {
  assert.equal(viewMba("120256089860390550"), null)
  assert.equal(viewMba("x9seqce3b43"), null)
  assert.equal(viewMba("hartm0140123"), null)
  assert.equal(viewMba("(not set)"), null)
})
