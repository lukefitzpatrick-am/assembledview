import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { countPortfolioRows } from "../assembleCampaignPacingRows.js"
import { p6FixtureRows } from "./p6Fixture.js"

describe("assembleCampaignPacingRows fixtures", () => {
  const rows = p6FixtureRows()
  const byMba = Object.fromEntries(rows.map((row) => [row.mbaNumber, row]))

  it("returns one row per campaign in attention-then-healthy order", () => {
    assert.deepEqual(
      rows.map((row) => row.mbaNumber),
      ["letsgo001", "jayco001", "candel001", "hartm012", "BICAU002", "PGAAUS014"],
    )
  })

  it("letsgo001 is ahead / over-pacing with a daily-rate why", () => {
    const row = byMba.letsgo001
    assert.equal(row.pace, "ahead")
    assert.ok(row.spendPct > 110)
    assert.ok(row.projectedFinish != null && row.projectedFinish > row.budget * 1.15)
    assert.match(
      row.why,
      /Search is spending at 1\.3× the daily plan; projected finish \$117,949 against \$100,000\./,
    )
  })

  it("jayco001 is behind with mixed channel copy", () => {
    const row = byMba.jayco001
    assert.equal(row.pace, "behind")
    const searchCh = row.channels.find((ch) => ch.channelKey === "search")
    const socialCh = row.channels.find((ch) => ch.channelKey === "social-meta")
    assert.equal(searchCh?.pace, "behind")
    assert.equal(socialCh?.pace, "on_track")
    assert.match(row.why, /Search is 63% of expected; Social · Meta on track\./)
  })

  it("candel001 is no_source", () => {
    const row = byMba.candel001
    assert.equal(row.pace, "no_source")
    assert.equal(row.channels[0]?.sourceState, "no_source")
    assert.equal(
      row.why,
      "Prog video · Mystery Dsp has no source connected, so the campaign cannot read on track.",
    )
  })

  it("BICAU002 is on track with BVOD behind", () => {
    const row = byMba.BICAU002
    assert.equal(row.pace, "on_track")
    const bvodCh = row.channels.find((ch) => ch.channelKey === "bvod")
    assert.equal(bvodCh?.pace, "behind")
    assert.equal(bvodCh?.spendMode, "actual")
    assert.equal(bvodCh?.spendToDate, 0)
    assert.deepEqual(row.kpi, { tracked: 1, total: 1 })
    assert.match(row.why, /Delivery is 96% of expected with 106 days left\./)
  })

  it("hartm012 is no_delivery after 2+ days with zero rows", () => {
    const row = byMba.hartm012
    assert.equal(row.pace, "no_delivery")
    assert.ok(row.daysElapsed >= 2)
    assert.equal(row.spendToDate, 0)
    assert.equal(row.why, `${row.daysElapsed} days in flight and no rows from Search.`)
  })

  it("PGAAUS014 is on track", () => {
    const row = byMba.PGAAUS014
    assert.equal(row.pace, "on_track")
    assert.match(row.why, /Delivery is 98% of expected with 106 days left\./)
  })

  it("counts live / behind / on_track / ahead / over_pacing / attention", () => {
    assert.deepEqual(countPortfolioRows(rows), {
      live: 6,
      behind: 1,
      on_track: 2,
      ahead: 1,
      over_pacing: 1,
      attention: 4,
    })
  })
})
