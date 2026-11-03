/**
 * B23fix (B23 review finding 10): in the B19 publisher merge SQL, step 2
 * checks the "already ran" marker before the step 0 backup guard, so a rerun
 * after the backups are dropped says the merge already ran. Both still abort.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const sql = readFileSync(
  join(process.cwd(), "db/migrations/manual/2026-11-03_B19_publisher_merge_SUPABASE.sql"),
  "utf8",
)
const step2 = sql.slice(sql.indexOf("-- STEP 2. Merge"), sql.indexOf("-- Guard 1:"))

test("step 2: the marker check comes before the backup guard; both raise", () => {
  const marker = step2.indexOf("WHERE key = 'b19_publisher_merge'")
  const backup = step2.indexOf("to_regclass('public.b19_backup_publishers_20261103')")
  assert.ok(marker > 0 && backup > 0, "both guards are in step 2")
  assert.ok(marker < backup, "marker first")
  assert.match(step2, /RAISE EXCEPTION 'Aborted: marker b19_publisher_merge exists, the merge already ran\.'/)
  assert.match(step2, /RAISE EXCEPTION 'Aborted, nothing changed: run step 0 first'/)
})
