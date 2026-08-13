/**
 * File-based pin of 0041 publisher_specs join seeds.
 * Never fuzzy; SCA/SEN stay ingest-only; id 61 is not a seed.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const MIGRATION = path.resolve("db/migrations/0041_publisher_specs.sql")

/** Verified live publishers.id map (18 catalogue rows + 2 suffix aliases). */
const EXPECTED_JOINS: Record<string, number | null> = {
  "assembled-programmatic": 2,
  "google-ads": 3,
  meta: 4,
  tiktok: 7,
  cartology: 10,
  nine: 11,
  youtube: 15,
  linkby: 22,
  "news-corp": 26,
  seven: 29,
  qms: 30,
  jcdecaux: 35,
  "ooh-media": 43,
  quantcast: 49,
  twitch: 66,
  "civic-outdoor": null,
  tonic: null,
  ten: null,
  "google-ads-dv360": 3,
  "youtube-dv360": 15,
}

function parseJoinSeeds(sql: string): Map<string, number | null> {
  const insert = sql.match(
    /INSERT INTO public\.publisher_specs[\s\S]*?ON CONFLICT \(publisher_slug\)/,
  )
  assert.ok(insert, "0041 must contain a publisher_specs VALUES insert")
  const out = new Map<string, number | null>()
  const re = /\('([a-z0-9-]+)',\s*(NULL|\d+),/g
  for (const match of insert[0].matchAll(re)) {
    const slug = match[1]
    const rawId = match[2]
    assert.equal(out.has(slug), false, `duplicate seed slug ${slug}`)
    out.set(slug, rawId === "NULL" ? null : Number(rawId))
  }
  return out
}

test("0041 join seed is the verified publishers.id map", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8")
  const joins = parseJoinSeeds(sql)
  assert.deepEqual(
    [...joins.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    Object.entries(EXPECTED_JOINS).sort((a, b) => a[0].localeCompare(b[0])),
  )
  assert.equal(joins.get("quantcast"), 49)
  assert.equal(joins.get("nine"), 11)
  assert.equal(joins.get("google-ads-dv360"), 3)
  assert.equal(joins.get("youtube-dv360"), 15)
  assert.equal(joins.get("civic-outdoor"), null)
  assert.equal(joins.get("tonic"), null)
  assert.equal(joins.get("ten"), null)
})

test("0041 does not seed SCA/SEN, id 61, or dump mi-library JSON", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8")
  const joins = parseJoinSeeds(sql)
  assert.equal(joins.has("sca"), false)
  assert.equal(joins.has("sen"), false)
  assert.equal([...joins.values()].includes(61), false)
  assert.equal([...joins.values()].includes(5), false)
  assert.match(sql, /0041_publisher_specs_join_seed/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.spec_runs/)
  assert.match(sql, /spec_json jsonb NOT NULL DEFAULT '\{\}'::jsonb/)
  assert.doesNotMatch(sql, /GRANT SELECT[\s\S]*ava_readonly/i)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  const insert = sql.match(
    /INSERT INTO public\.publisher_specs[\s\S]*?ON CONFLICT \(publisher_slug\)/,
  )
  assert.ok(insert)
  assert.doesNotMatch(insert[0], /spec_json/)
  assert.doesNotMatch(insert[0], /\{"/)
})
