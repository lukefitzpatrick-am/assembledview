import assert from "node:assert/strict"
import test from "node:test"

import {
  UNMAPPED_DELIVERY_WINDOW_DAYS,
  buildPublishedLookupSql,
  buildUnmappedDeliverySql,
  filterUnmappedDeliveryByStem,
  getUnmappedDelivery,
  lookupCandidates,
  mapUnmappedDeliveryRow,
  mbaTokensInText,
  platformNameLabel,
  suggestUnmappedFix,
  summariseUnmappedDelivery,
} from "../unmappedDelivery.js"
import { buildUnmappedPlacementsSql, labelMapJoinSql, resolvedLineIsUnmappedSql } from "../unmappedPlacements.js"

const published = {
  lineIds: new Set(["pgaaus015sm3", "hartm001se8"]),
  mbas: new Set(["pgaaus015", "hartm001", "golf025"]),
}

function raw(over: Partial<ReturnType<typeof mapUnmappedDeliveryRow>> = {}) {
  return {
    channel: "Social - Meta",
    platformEntityId: "120200001",
    name: "Players Series SA Broadcast",
    campaignName: "PGA Tour 2026/27",
    account: null,
    firstDate: "2026-10-02",
    lastDate: "2026-10-30",
    spend: 1998.89,
    impressions: 410_000,
    currentLineItemId: null,
    ...over,
  }
}

test("SQL reads all three pacing facts over the window with the shared map-then-snapshot rule", () => {
  const sql = buildUnmappedDeliverySql()
  assert.match(sql, /ASSEMBLEDVIEW\.MART\.PACING_FACT/)
  assert.match(sql, /ASSEMBLEDVIEW\.MART\.SOCIAL_PACING_FACT/)
  assert.match(sql, /ASSEMBLEDVIEW\.MART\.SEARCH_PACING_FACT/)
  assert.equal((sql.match(/DATEADD\(day, -\?, CURRENT_DATE\(\)\)/g) ?? []).length, 3)
  assert.match(sql, /NOT ILIKE 'Social%'/)
  assert.match(sql, /CUSTOMER_ID/)
  assert.match(sql, /GROUP BY CH, PID/)
  assert.match(sql, /HAVING SUM\(COALESCE\(SP, 0\)\) <> 0 OR SUM\(COALESCE\(IM, 0\)\) <> 0/)
  // One copy of the rule: the same fragments the CM360 list uses.
  assert.ok(sql.includes(labelMapJoinSql("f", "m")))
  assert.ok(sql.includes(resolvedLineIsUnmappedSql("r.RID")))
  assert.ok(buildUnmappedPlacementsSql().includes(labelMapJoinSql("f", "m")))
  assert.ok(buildUnmappedPlacementsSql().includes(resolvedLineIsUnmappedSql("r.RESOLVED_LINE_ITEM_ID")))
  assert.equal(UNMAPPED_DELIVERY_WINDOW_DAYS, 30)
})

test("maps a Snowflake row: rounds spend, lower-cases the line id, blank account is null", () => {
  const row = mapUnmappedDeliveryRow({
    CHANNEL: "Search - Google Ads",
    PLATFORM_LINE_ITEM_ID: "987",
    NAME: "Ad group 1",
    CAMPAIGN_NAME: "PGA_Conversions_Institute_Search_April26",
    ACCOUNT: "  ",
    RESOLVED_LINE_ITEM_ID: " PGAAUS015SE9 ",
    FIRST_DATE: { toISOString: () => "2026-10-01T00:00:00.000Z" },
    LAST_DATE: "2026-10-30",
    SPEND: "1192.0499999",
    IMPRESSIONS: "4437",
  })
  assert.deepEqual(row, {
    channel: "Search - Google Ads",
    platformEntityId: "987",
    name: "Ad group 1",
    campaignName: "PGA_Conversions_Institute_Search_April26",
    account: null,
    firstDate: "2026-10-01",
    lastDate: "2026-10-30",
    spend: 1192.05,
    impressions: 4437,
    currentLineItemId: "pgaaus015se9",
  })
})

test("relabel: the name carries a published line the warehouse id does not", () => {
  const s = suggestUnmappedFix(raw({ name: "SA Awareness | pgaaus015sm3", currentLineItemId: null }), published)
  assert.equal(s.kind, "relabel")
  assert.equal(s.lineItemId, "pgaaus015sm3")
  assert.equal(s.mba, "pgaaus015")
  assert.match(s.action, /ad set name carries pgaaus015sm3, a published line\. Relabel it/)
})

test("add_line: a plan-style id that is not published, from the id or the name", () => {
  const fromId = suggestUnmappedFix(raw({ currentLineItemId: "pgaaus015sm9" }), published)
  assert.equal(fromId.kind, "add_line")
  assert.equal(fromId.lineItemId, "pgaaus015sm9")
  assert.equal(fromId.mba, "pgaaus015")
  const fromName = suggestUnmappedFix(raw({ name: "Traffic golf025sm7" }), published)
  assert.equal(fromName.kind, "add_line")
  assert.equal(fromName.lineItemId, "golf025sm7")
})

test("add_line: names a published MBA with no line id", () => {
  const s = suggestUnmappedFix(raw({ name: "WA PGA", campaignName: "PGAAUS015 Tour ads" }), published)
  assert.equal(s.kind, "add_line")
  assert.equal(s.mba, "pgaaus015")
  assert.equal(s.lineItemId, null)
  assert.match(s.action, /Add the line id to the ad set name/)
})

test("rename: nothing to go on, with the client stem from a CM360 campaign prefix", () => {
  const s = suggestUnmappedFix(raw({ channel: "Ad Serving - CM360", name: "300x250", campaignName: "bic-flex5_fy27" }), published)
  assert.equal(s.kind, "rename")
  assert.equal(s.mba, "BICAU")
  assert.match(s.action, /placement name/)
  const none = suggestUnmappedFix(raw({ name: "Ad group 1", campaignName: "Brand", channel: "Search - Google Ads" }), published)
  assert.equal(none.kind, "rename")
  assert.equal(none.mba, null)
  assert.match(none.action, /ad group name/)
})

test("an MBA token that is not published is not used", () => {
  const s = suggestUnmappedFix(raw({ name: "abcd123 test", campaignName: "x" }), published)
  assert.equal(s.kind, "rename")
})

test("platform name labels by channel", () => {
  assert.equal(platformNameLabel("Social - TikTok"), "ad set")
  assert.equal(platformNameLabel("Search - Microsoft Ads"), "ad group")
  assert.equal(platformNameLabel("PMax - Google Ads"), "asset group")
  assert.equal(platformNameLabel("Programmatic - Video"), "line item")
  assert.equal(platformNameLabel("Ad Serving - CM360"), "placement")
})

test("MBA tokens: word-bounded, unique, lower case", () => {
  assert.deepEqual(mbaTokensInText("PGAAUS015_Players | pgaaus015 and HARTM001x"), ["pgaaus015", "hartm001"])
  assert.deepEqual(mbaTokensInText("golf025-search golf0251"), ["golf025"])
  assert.deepEqual(mbaTokensInText(null), [])
})

test("summary groups by channel, largest spend first; stem filter matches mba, name or campaign", () => {
  const rows = [
    { ...raw({ channel: "Social - Meta", spend: 100.1, impressions: 10 }), suggestion: suggestUnmappedFix(raw(), published) },
    { ...raw({ channel: "Social - Meta", spend: 200.2, impressions: 5, platformEntityId: "2" }), suggestion: suggestUnmappedFix(raw(), published) },
    {
      ...raw({ channel: "Search - Google Ads", spend: 50, impressions: 1, name: "golf025se1", campaignName: "Golf" }),
      suggestion: suggestUnmappedFix(raw({ name: "golf025se1" }), published),
    },
  ]
  assert.deepEqual(summariseUnmappedDelivery(rows), [
    { channel: "Social - Meta", entities: 2, spend: 300.3, impressions: 15 },
    { channel: "Search - Google Ads", entities: 1, spend: 50, impressions: 1 },
  ])
  assert.equal(filterUnmappedDeliveryByStem(rows, "golf").length, 1)
  assert.equal(filterUnmappedDeliveryByStem(rows, "PGA").length, 2)
  assert.equal(filterUnmappedDeliveryByStem(rows, "").length, 3)
})

test("lookup SQL only asks for what it needs, and is skipped when there is nothing", () => {
  assert.equal(buildPublishedLookupSql(0, 0), null)
  const both = buildPublishedLookupSql(2, 1)!
  assert.match(both, /'line' AS KIND/)
  assert.match(both, /'mba' AS KIND/)
  assert.equal((both.match(/\?/g) ?? []).length, 3)
  const c = lookupCandidates([raw({ name: "x pgaaus015sm3" }), raw({ campaignName: "HARTM001 brand" })])
  assert.deepEqual(c.lineIds, ["pgaaus015sm3"])
  assert.deepEqual(c.mbas, ["pgaaus015", "hartm001"])
})

test("getUnmappedDelivery is read-only: two SELECTs, window binds, then the snapshot lookup", async () => {
  const calls: { sql: string; binds: unknown[]; label?: string }[] = []
  const result = await getUnmappedDelivery(async (sql, binds = [], options) => {
    calls.push({ sql, binds, label: options?.label })
    if (options?.label === "unmapped_delivery") {
      return [
        {
          CHANNEL: "Social - Meta",
          PLATFORM_LINE_ITEM_ID: "1",
          NAME: "SA Awareness pgaaus015sm3",
          CAMPAIGN_NAME: "PGA Tour",
          RESOLVED_LINE_ITEM_ID: null,
          FIRST_DATE: "2026-10-02",
          LAST_DATE: "2026-10-30",
          SPEND: 1940.99,
          IMPRESSIONS: 1000,
        },
      ]
    }
    return [
      { KIND: "line", VAL: "pgaaus015sm3" },
      { KIND: "mba", VAL: "pgaaus015" },
    ]
  })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0]!.binds, [30, 30, 30])
  assert.deepEqual(calls[1]!.binds, ["pgaaus015sm3", "pgaaus015"])
  for (const c of calls) assert.doesNotMatch(c.sql, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP)\b/i)
  assert.equal(result.windowDays, 30)
  assert.equal(result.rows[0]!.suggestion.kind, "relabel")
  assert.equal(result.rows[0]!.suggestion.lineItemId, "pgaaus015sm3")
  assert.deepEqual(result.summary, [{ channel: "Social - Meta", entities: 1, spend: 1940.99, impressions: 1000 }])
})
