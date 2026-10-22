import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { lineCardFromSearch } from "../../channel/lineCardModel.js"
import { searchFixture } from "../../channel/__tests__/fixtures.js"
import { p6FixtureRows } from "../../portfolio/__tests__/p6Fixture.js"
import { assembleCampaignDetailPayload } from "../assembleCampaignDetailPayload.js"
import type { DailyFactPoint } from "../dailyFromFacts.js"

const VIEW = "2026-09-16"
const COUNT_TO = "2026-09-15"

function fact(date: string, spend: number): DailyFactPoint {
  return {
    date,
    channelKey: "search",
    channelLabel: "Search · Google Ads",
    lineItemId: "jayco001se1",
    spend,
    impressions: 1_000,
    clicks: 10,
    views: 0,
  }
}

describe("pacing modal counts to the count-to day (P1)", () => {
  const row = p6FixtureRows().find((r) => r.mbaNumber === "jayco001")!
  const line = lineCardFromSearch(searchFixture(), COUNT_TO)
  const facts = [fact("2026-09-14", 300), fact(COUNT_TO, 100), fact(VIEW, 50)]

  it("bursts stop at the count-to day and ignore later facts", () => {
    const payload = assembleCampaignDetailPayload({
      row,
      lines: [line],
      asOf: VIEW,
      countTo: COUNT_TO,
      dailyFacts: facts,
    })
    assert.equal(payload.countTo, COUNT_TO)
    const september = payload.bursts.find((b) => b.start === "2026-09-01")
    assert.ok(september)
    assert.equal(september.spend, 400)
    // 15 of 30 days of a $10,000 burst.
    assert.equal(Math.round(september.expected), 5_000)
  })

  it("the daily chart still runs to the view day", () => {
    const payload = assembleCampaignDetailPayload({
      row,
      lines: [line],
      asOf: VIEW,
      countTo: COUNT_TO,
      dailyFacts: facts,
    })
    assert.ok(payload.daily.table.some((day) => day.date === VIEW))
  })

  it("without a count-to day the payload is unchanged", () => {
    const payload = assembleCampaignDetailPayload({
      row,
      lines: [line],
      asOf: VIEW,
      dailyFacts: facts,
    })
    assert.equal("countTo" in payload, false)
    const september = payload.bursts.find((b) => b.start === "2026-09-01")
    assert.equal(september?.spend, 450)
    assert.equal(Math.round(september?.expected ?? 0), 5_333)
  })
})
