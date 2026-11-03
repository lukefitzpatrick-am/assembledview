/**
 * B23fix (B23 review finding 10): the one-off case dedupe script reloads the
 * snapshot with an explicit column list. It must carry the later columns the
 * snapshot has, so a rerun keeps their values. The script connects on load,
 * so this checks its text.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const src = readFileSync(join(process.cwd(), "scripts/snowflake/snapshot-lower-dedupe.mjs"), "utf8")

test("optional columns: the two B23 columns and the two earlier ones, carried only when present", () => {
  assert.match(
    src,
    /const OPTIONAL_COLUMNS = \["NO_ADSERVING", "ASSUME_SPEND", "FIXED_COST_FROM", "FIXED_COST_BURSTS_JSON"\]/,
  )
  assert.match(src, /FROM ASSEMBLEDVIEW\.INFORMATION_SCHEMA\.COLUMNS/)
  assert.match(src, /const carried = OPTIONAL_COLUMNS\.filter\(\(c\) => present\.has\(c\)\)/)
})

test("the staging copy, the insert list and the select list all carry them", () => {
  assert.equal((src.match(/SYNCED_AT\$\{carriedList\}/g) ?? []).length, 3)
  assert.doesNotMatch(src, /XANO_CREATED_AT, SYNCED_AT\n\)/)
})
