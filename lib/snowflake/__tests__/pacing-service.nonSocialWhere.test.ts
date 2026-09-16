import assert from "node:assert/strict"
import test from "node:test"

import { bulkNonSocialChannelWhere } from "../bulkNonSocialChannelWhere"

test("bulk non-social WHERE admits Programmatic - OOH", () => {
  const where = bulkNonSocialChannelWhere()
  const sql = `
    SELECT CHANNEL FROM ASSEMBLEDVIEW.MART.PACING_FACT
    WHERE ${where}
  `
  assert.match(sql, /LIKE '%programmatic%'/)
  assert.match(sql, /LIKE '%ooh%'/)
  assert.match(sql, /LIKE '%display%'/)
  assert.match(sql, /LIKE '%video%'/)
  assert.match(sql, /LIKE '%ad serving%'/)
  assert.match(
    sql,
    /\(LOWER\(CHANNEL\) LIKE '%programmatic%' AND LOWER\(CHANNEL\) LIKE '%ooh%'\)/,
  )
})
