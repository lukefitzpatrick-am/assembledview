/**
 * Unit tests for insight library query filters + FTS shape (no live DB).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  bodyFullTextMatchShape,
  buildCampaignInsightsWhere,
} from "../queryCampaignInsights.js"

const QUERY_SRC = readFileSync(
  path.join(process.cwd(), "lib/insights/queryCampaignInsights.ts"),
  "utf8",
)

test("FTS predicate shape uses to_tsvector @@ plainto_tsquery (GIN path)", () => {
  const shape = bodyFullTextMatchShape()
  assert.match(shape, /to_tsvector\('english'::regconfig,\s*body\)/)
  assert.match(shape, /@@\s*plainto_tsquery\('english'::regconfig,\s*\$q\)/)

  // Assert the live query module wires FTS through bodyFullTextMatchSql — not JS filter.
  assert.match(QUERY_SRC, /function bodyFullTextMatchSql/)
  assert.match(
    QUERY_SRC,
    /to_tsvector\('english'::regconfig,\s*\$\{schema\.campaignInsights\.body\}\) @@ plainto_tsquery/,
  )
  assert.match(QUERY_SRC, /idx_campaign_insights_body_fts/)
  assert.match(QUERY_SRC, /parts\.push\(bodyFullTextMatchSql\(q\)\)/)
  assert.doesNotMatch(
    QUERY_SRC,
    /\.filter\(\s*\(.*=>.*\.body/s,
    "must not fetch-all-and-filter body in JS",
  )
})

test("default where hides superseded (live index path)", () => {
  const where = buildCampaignInsightsWhere({})
  assert.ok(where, "live-only default must emit a WHERE clause")
  assert.match(QUERY_SRC, /isNull\(schema\.campaignInsights\.supersededBy\)/)
})

test("filter combinations compose without throwing", () => {
  const where = buildCampaignInsightsWhere({
    clientId: 9,
    mbaNumber: "BICAU001",
    insightType: "delivery",
    source: "ava",
    q: "pacing",
    includeSuperseded: false,
    periodFrom: "2026-01",
    periodTo: "2026-06",
  })
  assert.ok(where)

  const exact = buildCampaignInsightsWhere({
    period: "2026-07",
    mbaNumber: "bicau001",
  })
  assert.ok(exact)
})

test("period range and exact period are both supported in source", () => {
  assert.match(QUERY_SRC, /periodFrom/)
  assert.match(QUERY_SRC, /periodTo/)
  assert.match(QUERY_SRC, /gte\(schema\.campaignInsights\.period/)
  assert.match(QUERY_SRC, /lte\(schema\.campaignInsights\.period/)
  // Invalid YYYY-MM ignored (still emits live-only default WHERE, no throw)
  const invalid = buildCampaignInsightsWhere({
    periodFrom: "July",
    includeSuperseded: true,
  })
  assert.equal(invalid, undefined)
})

test("includeSuperseded skips live-only null filter in source path", () => {
  assert.match(
    QUERY_SRC,
    /if \(!filters\.includeSuperseded\) \{\s*parts\.push\(isNull\(schema\.campaignInsights\.supersededBy\)\)/,
  )
  const live = buildCampaignInsightsWhere({ includeSuperseded: false, clientId: 1 })
  const all = buildCampaignInsightsWhere({ includeSuperseded: true, clientId: 1 })
  assert.ok(live)
  assert.ok(all)
})

test("offset pagination is implemented server-side", () => {
  assert.match(QUERY_SRC, /\.offset\(offset\)/)
  assert.match(QUERY_SRC, /hasMore/)
  assert.match(QUERY_SRC, /listCampaignInsightsPage/)
})
