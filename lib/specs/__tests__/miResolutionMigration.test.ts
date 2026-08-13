import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const MIGRATION = path.resolve("db/migrations/0044_mi_resolution.sql")

test("0044 adds mi_resolution jsonb on media_plan_versions, not 0043", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8")
  assert.match(sql, /ALTER TABLE(?: IF EXISTS)? public\.media_plan_versions/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS mi_resolution jsonb/i)
  assert.doesNotMatch(sql, /GRANT SELECT[\s\S]*ava_readonly/i)
  assert.match(sql, /0043 reserved for CX2-9/)
})
