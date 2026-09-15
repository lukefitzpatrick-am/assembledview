/**
 * Finance SQL joins the published cut via PUBLISHED_VERSION_JOIN_SQL
 * (pointer AND stamp). Documented SQL + source pins — no DB.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { bookedByPublisherMonthSqlText } from "@/lib/finance/sections/costsQuery"
import { payablesSqlText, receivablesSqlText } from "@/lib/finance/sections/summaryQuery"
import { PUBLISHED_VERSION_JOIN_SQL } from "@/lib/mediaplan/publishedVersionGuard"

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, "..", "..", "..", "..")

const Q = { fy: 2026, from: "2025-07", to: "2026-06", clientIds: [] as number[] }

function source(rel: string): string {
  return readFileSync(join(repo, rel), "utf8")
}

test("PUBLISHED_VERSION_JOIN_SQL is pointer plus stamp", () => {
  assert.equal(
    PUBLISHED_VERSION_JOIN_SQL,
    "v.id = m.published_version_id AND v.published_at IS NOT NULL"
  )
})

test("documented finance SQL interpolates the fragment", () => {
  assert.ok(receivablesSqlText(Q).includes(PUBLISHED_VERSION_JOIN_SQL))
  assert.ok(payablesSqlText(Q).includes(PUBLISHED_VERSION_JOIN_SQL))
  assert.ok(
    bookedByPublisherMonthSqlText({ ...Q, channels: [], publishers: [] }).includes(
      PUBLISHED_VERSION_JOIN_SQL
    )
  )
})

test("repointed finance/dashboard files do not keep a raw pointer join", () => {
  const files = [
    "lib/finance/sections/summaryQuery.ts",
    "lib/finance/sections/investment/cutQuery.ts",
    "lib/finance/sections/costsQuery.ts",
    "lib/finance/sections/clientPaysQuery.ts",
    "lib/finance/sections/investment/cutArQuery.ts",
    "lib/data/dashboardMonthlySpend.ts",
  ]
  const rawPointerJoin = /ON v\.id = m\.published_version_id\s*$/m
  for (const rel of files) {
    const text = source(rel)
    assert.ok(
      text.includes("PUBLISHED_VERSION_JOIN_SQL"),
      `${rel} must import/interpolate PUBLISHED_VERSION_JOIN_SQL`
    )
    assert.equal(
      rawPointerJoin.test(text),
      false,
      `${rel} still has a raw pointer-only ON clause`
    )
  }

  const probe = source("lib/finance/scheduleMonthsSource.ts")
  assert.match(probe, /isNotNull\(schema\.mediaPlanVersions\.publishedAt\)/)
  assert.match(probe, /eq\(schema\.mediaPlanMasters\.publishedVersionId/)
})
