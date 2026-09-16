import assert from "node:assert/strict"
import test from "node:test"

import {
  CM360_PACING_CHANNEL,
  UNMAPPED_PLACEMENTS_WINDOW_DAYS,
  applyLabelMapThenResolve,
  buildUnmappedPlacementsSql,
  getUnmappedPlacements,
  mapUnmappedPlacementRow,
  resolvedLineItemIsUnmapped,
} from "../unmappedPlacements.js"

test("resolved line is unmapped when null, empty, or missing from published ids", () => {
  const published = new Set(["bicau006pv4", "sinch001dd1"])
  assert.equal(resolvedLineItemIsUnmapped(null, published), true)
  assert.equal(resolvedLineItemIsUnmapped("", published), true)
  assert.equal(resolvedLineItemIsUnmapped("   ", published), true)
  assert.equal(resolvedLineItemIsUnmapped("ghost001pv1", published), true)
  assert.equal(resolvedLineItemIsUnmapped("BICAU006PV4", published), false)
  assert.equal(resolvedLineItemIsUnmapped("  bicau006pv4  ", published), false)
})

test("LABEL_MAP id wins so a mapped placement is treated as published when the mapped id exists", () => {
  const published = new Set(["bicau006pv4"])
  const resolved = applyLabelMapThenResolve(null, "BICAU006PV4")
  assert.equal(resolved, "BICAU006PV4")
  assert.equal(resolvedLineItemIsUnmapped(resolved, published), false)
})

test("fact LINE_ITEM_ID is used when LABEL_MAP has no active mapping", () => {
  assert.equal(applyLabelMapThenResolve("bicau006pv4", null), "bicau006pv4")
  assert.equal(applyLabelMapThenResolve("bicau006pv4", "  "), "bicau006pv4")
  assert.equal(applyLabelMapThenResolve(null, null), null)
})

test("SQL applies LABEL_MAP first, then 60-day CM360 PACING_FACT against published snapshot ids", () => {
  const sql = buildUnmappedPlacementsSql()
  assert.match(sql, /ASSEMBLEDVIEW\.MART\.PACING_FACT/i)
  assert.match(sql, /ASSEMBLEDVIEW\.MART\.LINE_ITEM_LABEL_MAP/i)
  assert.match(sql, /ASSEMBLEDVIEW\.MART\.XANO_LINE_ITEMS_SNAPSHOT/i)
  assert.match(sql, /Ad Serving - CM360/)
  assert.match(sql, /DATEADD\(\s*day\s*,\s*-\s*\?\s*,\s*CURRENT_DATE\(\)\s*\)/i)
  assert.match(sql, /GROUP BY/i)
  assert.match(sql, /CAMPAIGN_NAME/i)
  assert.equal(CM360_PACING_CHANNEL, "Ad Serving - CM360")
  assert.equal(UNMAPPED_PLACEMENTS_WINDOW_DAYS, 60)
})

test("maps a Snowflake row and derives suggested MBA from the campaign prefix", () => {
  const row = mapUnmappedPlacementRow({
    PLACEMENT_NAME: "bic-flex5_fy27-twitch-progvideo-1920x1080--flex5_15sec",
    CAMPAIGN_NAME: "bic-flex5_fy27",
    FIRST_DATE: "2026-08-26",
    LAST_DATE: "2026-09-02",
    IMPRESSIONS: 14534,
  })
  assert.deepEqual(row, {
    placementName: "bic-flex5_fy27-twitch-progvideo-1920x1080--flex5_15sec",
    campaignName: "bic-flex5_fy27",
    firstDate: "2026-08-26",
    lastDate: "2026-09-02",
    impressions: 14534,
    suggestedMba: "BICAU",
  })
})

test("getUnmappedPlacements is read-only and maps query rows", async () => {
  const calls: { sql: string; binds: unknown[] }[] = []
  const rows = await getUnmappedPlacements(async (sql, binds = []) => {
    calls.push({ sql, binds })
    return [
      {
        PLACEMENT_NAME: "bic-flex5_fy27-twitch-progvideo-1920x1080--flex5_30sec",
        CAMPAIGN_NAME: "bic-flex5_fy27",
        FIRST_DATE: { toISOString: () => "2026-08-26T00:00:00.000Z" },
        LAST_DATE: "2026-09-02",
        IMPRESSIONS: "25629",
      },
    ]
  })

  assert.equal(calls.length, 1)
  assert.match(calls[0]!.sql, /LINE_ITEM_LABEL_MAP/)
  assert.deepEqual(calls[0]!.binds, [UNMAPPED_PLACEMENTS_WINDOW_DAYS])
  assert.equal(rows[0]?.impressions, 25629)
  assert.equal(rows[0]?.suggestedMba, "BICAU")
  assert.equal(rows[0]?.firstDate, "2026-08-26")
})
