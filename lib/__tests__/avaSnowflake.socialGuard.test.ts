import assert from "node:assert/strict"
import test from "node:test"

import { avaFactsSql } from "../avaSnowflakeSql"

const SOCIAL_PACING_TABLE = "ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT"

const SELECT = "SELECT SUM(AMOUNT_SPENT) AS SPEND_TO_DATE"
const WHERE = "WHERE LOWER(LINE_ITEM_ID) LIKE ?"

test("PACING_FACT reads leave out the legacy Social rows", () => {
  const sql = avaFactsSql(SELECT, "ASSEMBLEDVIEW.MART.PACING_FACT", WHERE)
  assert.match(sql, /FROM ASSEMBLEDVIEW\.MART\.PACING_FACT WHERE .* AND CHANNEL NOT ILIKE 'Social%'$/)
})

test("SOCIAL_PACING_FACT reads are unchanged", () => {
  const sql = avaFactsSql(SELECT, SOCIAL_PACING_TABLE, WHERE)
  assert.equal(sql, `${SELECT} FROM ${SOCIAL_PACING_TABLE} ${WHERE}`)
  assert.doesNotMatch(sql, /NOT ILIKE/)
})
