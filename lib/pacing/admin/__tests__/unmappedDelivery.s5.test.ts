import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPublishedLookupSql,
  daysUnmatched,
  getUnmappedDelivery,
  lookupCandidates,
  suggestUnmappedFix,
  supplierNoteDraft,
  supplierNoteDue,
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
      { KIND: "mline", VAL: "PGAAUS010DD1", CH: "MEDIA_PLAN_DIGI_DISPLAY" },
      { KIND: "mline", VAL: "pgaaus010sm1", CH: "media_plan_social" },
    ]
  })
  assert.deepEqual(binds[1], ["pgaaus010", "pgaaus010"])
  assert.equal(result.rows[0]!.suggestion.kind, "relabel")
  assert.equal(result.rows[0]!.suggestion.lineItemId, "pgaaus010dd1")
})

const queued = (over: Record<string, unknown> = {}) => ({
  ...raw({ channel: "Social - Meta", name: "Ad set A", campaignName: "Brand AU", currentLineItemId: null, spend: 1234.5 }),
  suggestion: { kind: "add_line" as const, mba: "pgaaus010", lineItemId: null, action: "x" },
  ...over,
})

test("S5: days unmatched counts calendar days from the first unmatched day; bad or future dates are 0", () => {
  assert.equal(daysUnmatched({ firstDate: "2026-11-20" }, "2026-11-23"), 3)
  assert.equal(daysUnmatched({ firstDate: "2026-11-23" }, "2026-11-23"), 0)
  assert.equal(daysUnmatched({ firstDate: "2026-11-25" }, "2026-11-23"), 0)
  assert.equal(daysUnmatched({ firstDate: "" }, "2026-11-23"), 0)
  assert.equal(daysUnmatched({ firstDate: "2026-13-40" }, "2026-11-23"), 0)
})

test("S5: no supplier note before 3 days; from 3 days a draft that asks for the line id", () => {
  assert.equal(supplierNoteDraft(queued({ firstDate: "2026-11-21" }), "2026-11-23"), null)
  const note = supplierNoteDraft(queued({ firstDate: "2026-11-20", account: "123" }), "2026-11-23")!
  assert.match(note, /^Hi,/)
  assert.match(note, /Delivery on Social - Meta has had no Assembled Media plan line id for at least 3 days/)
  assert.match(note, /Ad set: Ad set A \(555\)/)
  assert.match(note, /Campaign: Brand AU \(account 123\)/)
  assert.match(note, /2026-11-20 to 2026-11-20, \$1,234\.50 spend, 1,000 impressions/)
  assert.match(note, /Please put the plan line id \(it starts PGAAUS010\) in the ad set name\./)
})

test("S5: the note names the suggested line for a relabel, and asks which booking when nothing is known", () => {
  const relabel = supplierNoteDraft(
    queued({ suggestion: { kind: "relabel", mba: "pgaaus010", lineItemId: "pgaaus010sm1", action: "x" } }),
    "2026-11-30",
  )!
  assert.match(relabel, /Please put pgaaus010sm1 in the ad set name\./)
  const unknown = supplierNoteDraft(
    queued({ channel: "Ad Serving - CM360", suggestion: { kind: "rename", mba: null, lineItemId: null, action: "x" } }),
    "2026-11-30",
  )!
  assert.match(unknown, /Please tell us which booking this is, and put the plan line id in the placement name\./)
  assert.match(unknown, /Placement: Ad set A/)
})

test("S5fix (H1): any legacy row with spend goes to Match, whatever the channel; only no spend pre-fills", () => {
  const one = { ...published, linesByMba: new Map([["pgaaus010", [{ lineItemId: "pgaaus010dd1", lineChannel: "digi_display" }]]]) }
  for (const spend of [0.01, 5000]) {
    const s = suggestUnmappedFix(raw({ spend }), one)
    assert.equal(s.kind, "match", `spend ${spend}`)
    assert.equal(s.lineItemId, "pgaaus010ml1", "the target is never the pre-fill line")
    assert.match(s.action, /pgaaus010dd1 has the same MBA, number and channel\. Check it on the Match tab for pgaaus010/)
  }
  assert.equal(suggestUnmappedFix(raw({ spend: 0 }), one).kind, "relabel")
  assert.equal(suggestUnmappedFix(raw({ spend: -3 }), one).kind, "relabel", "a credit cannot double count spend")
})

test("S5fix (L4b): line ids, MBAs and legacy MBAs bind in that order", async () => {
  const binds: unknown[][] = []
  await getUnmappedDelivery(async (_sql, b = [], options) => {
    binds.push(b)
    if (options?.label !== "unmapped_delivery") return []
    return [
      { CHANNEL: "Social - Meta", PLATFORM_LINE_ITEM_ID: "1", NAME: "x hema001sm2", CAMPAIGN_NAME: "GOLF025 y", RESOLVED_LINE_ITEM_ID: "pgaaus0103", FIRST_DATE: "2026-11-01", LAST_DATE: "2026-11-02", SPEND: 1, IMPRESSIONS: 1 },
    ]
  })
  assert.deepEqual(binds[1], ["hema001sm2", "hema001", "golf025", "pgaaus010"])
  const sql = buildPublishedLookupSql(1, 1, 1)!
  const order = ["'line'", "'mba'", "'mline'"].map((k) => sql.indexOf(k))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
})

test("S5fix (M1): a note only when the supplier can fix the name", () => {
  const today = "2026-11-30"
  // The name already carries a current plan line id: ours to relabel or add, not the supplier's.
  assert.equal(supplierNoteDraft(queued({ name: "Brand pgaaus010sm1 AU", suggestion: { kind: "relabel", mba: "pgaaus010", lineItemId: "pgaaus010sm1", action: "x" } }), today), null)
  assert.equal(supplierNoteDraft(queued({ currentLineItemId: "pgaaus010sm9", suggestion: { kind: "add_line", mba: "pgaaus010", lineItemId: "pgaaus010sm9", action: "x" } }), today), null)
  // No plan line id at all: the MBA token row and the rename row.
  assert.ok(supplierNoteDraft(queued(), today))
  assert.ok(supplierNoteDraft(queued({ suggestion: { kind: "rename", mba: null, lineItemId: null, action: "x" } }), today))
  // An old id, sent to Match or pre-filled: the supplier must put the current id in.
  const old = supplierNoteDraft(queued({ currentLineItemId: "pgaaus010ml1", suggestion: { kind: "match", mba: "pgaaus010", lineItemId: "pgaaus010ml1", action: "x" } }), today)!
  assert.match(old, /has carried the old plan line id pgaaus010ml1 for at least \d+ days/)
  assert.match(old, /Please put the current plan line id \(it starts PGAAUS010\) in the ad set name\./)
  const noCode = supplierNoteDraft(queued({ currentLineItemId: "pgaaus0101", suggestion: { kind: "relabel", mba: "pgaaus010", lineItemId: "pgaaus010sm1", action: "x" } }), today)!
  assert.match(noCode, /Please put pgaaus010sm1 in the ad set name\./)
  assert.equal(supplierNoteDue(queued({ currentLineItemId: "pgaaus010sm9" }), today), false)
  assert.equal(supplierNoteDue(queued({ currentLineItemId: "pgaaus010ml9" }), today), true)
})
