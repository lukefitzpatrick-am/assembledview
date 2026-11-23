import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPublishedLookupSql,
  getUnmappedDelivery,
  lookupCandidates,
  suggestUnmappedFix,
} from "../unmappedDelivery.js"

function raw(over: Partial<Parameters<typeof suggestUnmappedFix>[0]> = {}) {
  return {
    channel: "Ad Serving - CM360",
    platformEntityId: "555",
    name: "300x250",
    campaignName: "Brand",
    account: null,
    firstDate: "2026-11-01",
    lastDate: "2026-11-20",
    spend: 0,
    impressions: 1000,
    currentLineItemId: "pgaaus010ml1",
    ...over,
  }
}

const lines = new Map([
  [
    "pgaaus010",
    [
      { lineItemId: "pgaaus010dd1", lineChannel: "digi_display" },
      { lineItemId: "pgaaus010pd1", lineChannel: "prog_display" },
      { lineItemId: "pgaaus010dd2", lineChannel: "digi_display" },
      { lineItemId: "pgaaus010sm1", lineChannel: "social" },
      { lineItemId: "pgaaus010dv1", lineChannel: "digi_video" },
    ],
  ],
])
const published = { lineIds: new Set<string>(), mbas: new Set(["pgaaus010"]), linesByMba: lines }

test("S5: an ML id with one published line of the same MBA, number and channel is a relabel to it", () => {
  const s = suggestUnmappedFix(raw({ channel: "Ad Serving - CM360" }), {
    ...published,
    linesByMba: new Map([["pgaaus010", lines.get("pgaaus010")!.filter((l) => l.lineItemId !== "pgaaus010dv1")]]),
  })
  assert.equal(s.kind, "relabel")
  assert.equal(s.lineItemId, "pgaaus010dd1")
  assert.equal(s.mba, "pgaaus010")
  assert.match(s.action, /pgaaus010ml1 uses the legacy ML code \(before May 2026\)\. The plan now uses specific codes\. The only published line .* is pgaaus010dd1\. Relabel it/)
})

test("S5: the channel family must fit (social and programmatic lines are not CM360 targets)", () => {
  const s = suggestUnmappedFix(raw({ channel: "Programmatic - Display" }), published)
  assert.match(s.action, /\. pgaaus010pd1 has the same MBA, number and channel/)
  const social = suggestUnmappedFix(raw({ channel: "Social - Meta" }), published)
  assert.match(social.action, /\. pgaaus010sm1 has the same MBA, number and channel/)
})

test("S5 (L9): with no spend and one candidate, only CM360 is a pre-filled relabel; any other channel goes to Match", () => {
  const one = new Map([["pgaaus010", lines.get("pgaaus010")!.filter((l) => l.lineItemId !== "pgaaus010dv1")]])
  const cm = suggestUnmappedFix(raw({ channel: "Ad Serving - CM360" }), { ...published, linesByMba: one })
  assert.equal(cm.kind, "relabel")
  assert.equal(cm.lineItemId, "pgaaus010dd1")
  for (const channel of ["Social - Meta", "Programmatic - Display"]) {
    const s = suggestUnmappedFix(raw({ channel, spend: 0 }), published)
    assert.equal(s.kind, "match", channel)
    assert.equal(s.lineItemId, "pgaaus010ml1", channel)
  }
})

test("S5: more than one fit names them all and sends the planner to Match (the user picks, we never do)", () => {
  const s = suggestUnmappedFix(raw({ channel: "Ad Serving - CM360" }), published)
  assert.equal(s.kind, "match")
  assert.equal(s.lineItemId, "pgaaus010ml1")
  assert.match(s.action, /pgaaus010dd1 or pgaaus010dv1 have the same MBA, number and channel/)
})

test("S5 (H1): a no-code Meta id with spend names its line but goes to Match, never a pre-filled relabel (RL2 duplicates)", () => {
  const s = suggestUnmappedFix(raw({ channel: "Social - Meta", currentLineItemId: "pgaaus0101", spend: 412.5 }), published)
  assert.equal(s.kind, "match")
  assert.equal(s.lineItemId, "pgaaus0101")
  assert.match(s.action, /pgaaus0101 is missing its media code\. pgaaus010sm1 has the same MBA, number and channel\. Check it on the Match tab for pgaaus010/)
  const noSpend = suggestUnmappedFix(raw({ channel: "Social - Meta", currentLineItemId: "pgaaus0101" }), published)
  assert.equal(noSpend.kind, "match")
  assert.equal(noSpend.lineItemId, "pgaaus0101")
  const coded = suggestUnmappedFix(raw({ channel: "Social - Meta", currentLineItemId: "pgaaus010sm9" }), published)
  assert.equal(coded.kind, "add_line")
  assert.match(coded.action, /is not a published line on pgaaus010/)
})

test("S5: no published line with that number keeps the add_line advice", () => {
  const s = suggestUnmappedFix(raw({ currentLineItemId: "pgaaus010ml7" }), published)
  assert.equal(s.kind, "add_line")
  assert.match(s.action, /pgaaus010ml7 is not a published line/)
})

test("S5: lookup asks for the published lines of legacy MBAs only", () => {
  const c = lookupCandidates([raw(), raw({ currentLineItemId: "hartm001se2" }), raw({ currentLineItemId: null, name: "x golf025ml3" })])
  assert.deepEqual(c.legacyMbas, ["pgaaus010", "golf025"])
  const sql = buildPublishedLookupSql(0, 0, 2)!
  assert.match(sql, /'mline' AS KIND/)
  assert.match(sql, /SOURCE_TABLE/)
  assert.equal((sql.match(/\?/g) ?? []).length, 2)
  assert.doesNotMatch(buildPublishedLookupSql(1, 1)!, /mline/)
})

test("S5: getUnmappedDelivery binds the legacy MBAs last and suggests from the mline rows", async () => {
  const binds: unknown[][] = []
  const result = await getUnmappedDelivery(async (_sql, b = [], options) => {
    binds.push(b)
    if (options?.label === "unmapped_delivery") {
      return [
        {
          CHANNEL: "Ad Serving - CM360",
          PLATFORM_LINE_ITEM_ID: "555",
          NAME: "300x250",
          CAMPAIGN_NAME: "PGAAUS010 brand",
          RESOLVED_LINE_ITEM_ID: "PGAAUS010ML1",
          FIRST_DATE: "2026-11-01",
          LAST_DATE: "2026-11-20",
          SPEND: 0,
          IMPRESSIONS: 10,
        },
      ]
    }
    return [
      { KIND: "mba", VAL: "pgaaus010" },
      { KIND: "mline", VAL: "PGAAUS010DD1", CH: "digi_display" },
      { KIND: "mline", VAL: "pgaaus010sm1", CH: "social" },
    ]
  })
  assert.deepEqual(binds[1], ["pgaaus010", "pgaaus010"])
  assert.equal(result.rows[0]!.suggestion.kind, "relabel")
  assert.equal(result.rows[0]!.suggestion.lineItemId, "pgaaus010dd1")
})
