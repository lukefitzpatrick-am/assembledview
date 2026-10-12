import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assembleCampaignPacingRows } from "../../portfolio/assembleCampaignPacingRows.js"
import { p6AssembleInput, p6FixtureRows } from "../../portfolio/__tests__/p6Fixture.js"
import { campaignDisplayBand } from "../../portfolio/portfolioPresentation.js"
import { chooseCampaignDetailRow } from "../chooseCampaignDetailRow.js"

function bicauDetailRow() {
  const input = p6AssembleInput()
  const mba = "bicau002"
  const sameMba = (value: string) => value.trim().toLowerCase() === mba
  return assembleCampaignPacingRows({
    ...input,
    search: input.search.filter((row) => sameMba(row.mbaNumber)),
    social: input.social.filter((row) => sameMba(row.mbaNumber)),
    programmatic: input.programmatic.filter((row) => sameMba(row.mbaNumber)),
    adServing: input.adServing.filter((row) => sameMba(row.mbaNumber)),
    direct: input.direct.filter((group) => sameMba(group.mbaNumber)),
    schedulesByMba: input.schedulesByMba,
  }).find((row) => sameMba(row.mbaNumber))
}

describe("campaign detail rates the delivery schedule the portfolio uses", () => {
  it("BICAU002 detail status equals the portfolio row", () => {
    const portfolio = p6FixtureRows().find((row) => row.mbaNumber === "BICAU002")
    const fresh = bicauDetailRow()
    assert.ok(portfolio)
    assert.ok(fresh)
    assert.equal(fresh.expectedToDate, portfolio.expectedToDate)
    assert.equal(fresh.pace, portfolio.pace)
    assert.equal(campaignDisplayBand(fresh), campaignDisplayBand(portfolio))

    const kept = chooseCampaignDetailRow({
      mbaNumber: "BICAU002",
      snapshotRow: { ...portfolio, expectedToDate: portfolio.expectedToDate + 0.4 },
      freshRow: fresh,
      scheduleLoaded: true,
    })
    assert.equal(kept?.expectedToDate, portfolio.expectedToDate + 0.4)
    assert.equal(kept?.pace, portfolio.pace)
    assert.equal(campaignDisplayBand(kept!), campaignDisplayBand(portfolio))
  })

  it("uses the fresh schedule figure when the snapshot expected is more than $1 off", () => {
    const portfolio = p6FixtureRows().find((row) => row.mbaNumber === "BICAU002")
    const fresh = bicauDetailRow()
    assert.ok(portfolio)
    assert.ok(fresh)
    const warnings: string[] = []
    const original = console.warn
    console.warn = (message?: unknown) => {
      warnings.push(String(message))
    }
    try {
      const chosen = chooseCampaignDetailRow({
        mbaNumber: "BICAU002",
        snapshotRow: { ...portfolio, expectedToDate: portfolio.expectedToDate + 50, pace: "ahead" },
        freshRow: fresh,
        scheduleLoaded: true,
      })
      assert.equal(chosen, fresh)
      assert.equal(chosen?.pace, portfolio.pace)
      assert.equal(campaignDisplayBand(chosen!), campaignDisplayBand(portfolio))
      assert.match(
        warnings.join("\n"),
        /\[pacing-detail\] campaign expected differs from snapshot for BICAU002: snapshot .+ fresh .+/,
      )
    } finally {
      console.warn = original
    }
  })

  it("keeps the snapshot when no schedule was loaded", () => {
    const portfolio = p6FixtureRows().find((row) => row.mbaNumber === "BICAU002")
    const fresh = bicauDetailRow()
    assert.ok(portfolio)
    assert.ok(fresh)
    const chosen = chooseCampaignDetailRow({
      mbaNumber: "BICAU002",
      snapshotRow: portfolio,
      freshRow: { ...fresh, expectedToDate: 0, pace: "behind" },
      scheduleLoaded: false,
    })
    assert.equal(chosen, portfolio)
  })
})
