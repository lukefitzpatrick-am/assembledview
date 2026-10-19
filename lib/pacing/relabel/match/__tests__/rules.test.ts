import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildMatchSuggestions,
  classifyMatch,
  familiesCompatible,
  lineIdInName,
  outsideLineDates,
  parseMatchLineId,
  planFamily,
  summariseMatch,
  warehouseFamily,
  type RawMatchEntity,
} from "@/lib/pacing/relabel/match/rules"
import type { MatchPlanLine } from "@/lib/pacing/relabel/match/types"

type RawLine = Omit<MatchPlanLine, "delivered" | "entityCount">

function line(id: string, lineChannel: string, start = "2026-01-01", end = "2026-12-31"): RawLine {
  return { lineItemId: id, mbaNumber: id.replace(/[a-z]+\d+$/i, ""), lineChannel, platform: "", buyType: "", startDate: start, endDate: end }
}

function entity(partial: Partial<RawMatchEntity> & Pick<RawMatchEntity, "channel" | "platformEntityId" | "lineItemId">): RawMatchEntity {
  return {
    name: partial.lineItemId,
    campaignName: "",
    firstDate: "2026-01-25",
    lastDate: "2026-10-19",
    spend: 100,
    impressions: 1000,
    ...partial,
  }
}

// hartm001 v26 as it stood on 20 Oct 2026 (after the FX1 DV360 parser fix).
const LINES: RawLine[] = [
  line("hartm001pd1", "prog_display"),
  line("hartm001pd2", "prog_display"),
  line("hartm001pd3", "prog_display"),
  line("hartm001pv1", "prog_video"),
  line("hartm001pv2", "prog_video"),
  line("hartm001sm1", "social"),
  line("hartm001sm2", "social"),
  line("hartm001se1", "search"),
  line("hartm001se9", "search", "2026-05-01", "2026-06-30"),
]

const ENTITIES: RawMatchEntity[] = [
  entity({ channel: "Programmatic - Video", platformEntityId: "k-ml1-a", lineItemId: "hartm001ml1", name: "contextual_men 55+ targeting-hartm001ML1", spend: 40000 }),
  entity({ channel: "Programmatic - Video", platformEntityId: "k-ml1-b", lineItemId: "hartm001ml1", name: "contextual_men 55+ v2-hartm001ML1", spend: 27264.62 }),
  entity({ channel: "Programmatic - Video", platformEntityId: "k-ml2", lineItemId: "hartm001ml2", spend: 49803.43 }),
  entity({ channel: "Programmatic - Display", platformEntityId: "k-pd1", lineItemId: "hartm001pd1", spend: 26672.68 }),
  entity({ channel: "Social - Meta", platformEntityId: "120239667850810540", lineItemId: "hartm001sm1", firstDate: "2026-01-25", lastDate: "2026-03-18", spend: 5755.81 }),
  entity({ channel: "Social - Meta", platformEntityId: "legacy-1", lineItemId: "hartm0011", firstDate: "2026-01-25", lastDate: "2026-03-18", spend: 5755.81 }),
  entity({ channel: "Social - Meta", platformEntityId: "typo-2", lineItemId: "hartm0012", firstDate: "2026-02-01", lastDate: "2026-03-18", spend: 4542.42 }),
  entity({ channel: "Search - Google Ads", platformEntityId: "se1", lineItemId: "hartm001se1", firstDate: "2025-04-06", lastDate: "2026-10-20", spend: 359569.01 }),
  entity({ channel: "Programmatic - Display", platformEntityId: "nohash", lineItemId: "0f3c9a1b2d4e5f60718293a4b5c6d7e8", name: "molicare-annual_plan-display-men_inco", spend: 500 }),
]

describe("parseMatchLineId", () => {
  it("splits MBA, code and number", () => {
    assert.deepEqual(parseMatchLineId("hartm001PD1"), { mba: "hartm001", code: "pd", num: 1 })
    assert.deepEqual(parseMatchLineId("bicau002pv12"), { mba: "bicau002", code: "pv", num: 12 })
    assert.deepEqual(parseMatchLineId("abc001prod2"), { mba: "abc001", code: "prod", num: 2 })
  })
  it("reads an id with the media code missing", () => {
    assert.deepEqual(parseMatchLineId("hartm0011"), { mba: "hartm001", code: null, num: 1 })
  })
  it("returns null for empty input", () => {
    assert.equal(parseMatchLineId(""), null)
    assert.equal(parseMatchLineId(null), null)
  })
})

describe("lineIdInName", () => {
  it("finds a plan token anywhere in a name", () => {
    assert.equal(lineIdInName("molicare-annual_performance-skin-display-jan26-hartm001PD2"), "hartm001pd2")
    assert.equal(lineIdInName("molicare-annual_plan-display-men_inco"), null)
  })
})

describe("channel families", () => {
  it("keeps programmatic video and display apart", () => {
    assert.equal(familiesCompatible(warehouseFamily("Programmatic - Video"), planFamily("prog_video")), true)
    assert.equal(familiesCompatible(warehouseFamily("Programmatic - Video"), planFamily("prog_bvod")), true)
    assert.equal(familiesCompatible(warehouseFamily("Programmatic - Video"), planFamily("prog_display")), false)
    assert.equal(familiesCompatible(warehouseFamily("Social - Meta"), planFamily("social")), true)
    assert.equal(familiesCompatible(warehouseFamily("Social - Meta"), planFamily("search")), false)
  })
})

describe("outsideLineDates", () => {
  it("allows 7 days of slack either side", () => {
    assert.equal(outsideLineDates({ firstDate: "2025-12-25", lastDate: "2026-01-05" }, { startDate: "2026-01-01", endDate: "2026-12-31" }), false)
    assert.equal(outsideLineDates({ firstDate: "2025-12-24", lastDate: "2026-01-05" }, { startDate: "2026-01-01", endDate: "2026-12-31" }), true)
    assert.equal(outsideLineDates({ firstDate: "2026-05-01", lastDate: "2026-07-08" }, { startDate: "2026-05-01", endDate: "2026-06-30" }), true)
  })
})

describe("classifyMatch", () => {
  const { entities, lines } = classifyMatch(ENTITIES, LINES, ["hartm001"])
  const byId = new Map(entities.map((e) => [e.platformEntityId, e]))

  it("gives each entity a status", () => {
    assert.equal(byId.get("k-pd1")?.status, "matched")
    assert.equal(byId.get("k-ml1-a")?.status, "not_on_plan")
    assert.equal(byId.get("typo-2")?.status, "not_on_plan")
    assert.equal(byId.get("nohash")?.status, "no_plan_id")
    assert.equal(byId.get("se1")?.status, "check_dates")
  })

  it("marks a legacy row with the same dates and spend as a duplicate", () => {
    const dup = byId.get("legacy-1")
    assert.equal(dup?.status, "duplicate")
    assert.equal(dup?.duplicateOf, "Social - Meta|120239667850810540")
  })

  it("sums delivered spend per line, check_dates included", () => {
    const get = (id: string) => lines.find((l) => l.lineItemId === id)
    assert.equal(get("hartm001pd1")?.delivered, 26672.68)
    assert.equal(get("hartm001se1")?.delivered, 359569.01)
    assert.equal(get("hartm001pv1")?.entityCount, 0)
  })

  it("builds suggestions in order: high, check, duplicate", () => {
    const suggestions = buildMatchSuggestions(entities, lines)
    const ml1 = suggestions.find((s) => s.targetLineIds[0] === "hartm001pv1")
    assert.equal(ml1?.kind, "high")
    assert.equal(ml1?.entityKeys.length, 2, "both ML1 entities are grouped")
    assert.equal(Math.round((ml1?.spend ?? 0) * 100), 6726462)

    const typo = suggestions.find((s) => s.entityKeys.includes("Social - Meta|typo-2"))
    assert.equal(typo?.kind, "high")
    assert.deepEqual(typo?.targetLineIds, ["hartm001sm2"])

    const dup = suggestions.find((s) => s.kind === "duplicate")
    assert.deepEqual(dup?.targetLineIds, [])
    assert.ok(dup?.entityKeys.includes("Social - Meta|legacy-1"))

    const kinds = suggestions.map((s) => s.kind)
    assert.deepEqual([...kinds].sort((a, b) => ["high", "check", "duplicate"].indexOf(a) - ["high", "check", "duplicate"].indexOf(b)), kinds)
  })

  it("summarises unmatched spend without duplicates", () => {
    const summary = summariseMatch(entities, lines, buildMatchSuggestions(entities, lines))
    assert.equal(summary.unmatchedCount, 5)
    assert.equal(Math.round(summary.unmatchedSpend * 100), Math.round((40000 + 27264.62 + 49803.43 + 4542.42 + 500) * 100))
    assert.equal(summary.checkDatesCount, 1)
  })
})

describe("buildMatchSuggestions with more than one target", () => {
  it("lists every fitting line and does not pick", () => {
    const lines: RawLine[] = [line("abcde001pv1", "prog_video"), line("abcde001pb1", "prog_bvod")]
    const { entities, lines: classified } = classifyMatch(
      [entity({ channel: "Programmatic - Video", platformEntityId: "x", lineItemId: "abcde001ml1" })],
      lines,
      ["abcde001"],
    )
    const [suggestion] = buildMatchSuggestions(entities, classified)
    assert.equal(suggestion?.kind, "check")
    assert.deepEqual([...(suggestion?.targetLineIds ?? [])].sort(), ["abcde001pb1", "abcde001pv1"])
  })

  it("only offers a different-code line when it has no delivery", () => {
    const lines: RawLine[] = [line("abcde001pd1", "prog_display")]
    const raw = [
      entity({ channel: "Programmatic - Display", platformEntityId: "on", lineItemId: "abcde001pd1" }),
      entity({ channel: "Programmatic - Display", platformEntityId: "off", lineItemId: "abcde001dd1", spend: 77 }),
    ]
    const { entities, lines: classified } = classifyMatch(raw, lines, ["abcde001"])
    assert.deepEqual(buildMatchSuggestions(entities, classified).filter((s) => s.kind !== "duplicate"), [])
  })
})
