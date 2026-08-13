/**
 * File-based pin of 0046 publisher_specs deadline column seed.
 * Explicit per-slug numbers; prose-only / disagreeing rules stay NULL.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const MIGRATION = path.resolve("db/migrations/0046_publisher_specs_deadline_seed.sql")

/** Unique clean parse of vendored supply_deadline_* prose (parseSupplyDeadline). */
const EXPECTED_UPDATES: Record<string, { min: number; max: number; business: boolean }> = {
  cartology: { min: 5, max: 10, business: true },
  linkby: { min: 10, max: 15, business: true },
  "ooh-media": { min: 5, max: 10, business: true },
  seven: { min: 5, max: 5, business: true },
}

const NULL_SLUGS = [
  "assembled-programmatic",
  "google-ads",
  "meta",
  "tiktok",
  "nine",
  "youtube",
  "news-corp",
  "qms",
  "jcdecaux",
  "quantcast",
  "twitch",
  "civic-outdoor",
  "tonic",
  "ten",
  "google-ads-dv360",
  "youtube-dv360",
]

function parseDeadlineUpdates(sql: string): Map<string, { min: number; max: number; business: boolean }> {
  const out = new Map<string, { min: number; max: number; business: boolean }>()
  const re =
    /supply_deadline_min_days\s*=\s*(\d+)[\s\S]*?supply_deadline_max_days\s*=\s*(\d+)[\s\S]*?supply_deadline_business_days\s*=\s*(TRUE|FALSE)[\s\S]*?WHERE\s+publisher_slug\s*=\s*'([a-z0-9-]+)'/gi
  for (const match of sql.matchAll(re)) {
    const slug = match[4]!
    assert.equal(out.has(slug), false, `duplicate UPDATE for ${slug}`)
    out.set(slug, {
      min: Number(match[1]),
      max: Number(match[2]),
      business: match[3]!.toUpperCase() === "TRUE",
    })
  }
  return out
}

test("0046 seeds explicit per-slug deadline numbers from the SD-3 parser", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8")
  assert.match(sql, /0046_deadline_seed/)
  assert.match(sql, /AUTHOR ONLY/)
  assert.match(sql, /Do not drizzle-kit migrate/)
  assert.doesNotMatch(sql, /CREATE TABLE/i)
  const updates = parseDeadlineUpdates(sql)
  assert.deepEqual(
    [...updates.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    Object.entries(EXPECTED_UPDATES).sort((a, b) => a[0].localeCompare(b[0])),
  )
  for (const slug of NULL_SLUGS) {
    assert.equal(updates.has(slug), false, `${slug} must stay NULL (no UPDATE)`)
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(
      sql,
      new RegExp(`(?:^|[^a-z0-9-])${escaped}(?:[^a-z0-9-]|$)`, "m"),
      `${slug} must be listed in the NULL comment`,
    )
  }
})
