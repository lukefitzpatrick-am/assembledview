import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { searchFixture } from "@/lib/pacing/channel/__tests__/fixtures"
import type { CampaignScheduleInput } from "../types.js"
import { assembleCampaignPacingRows } from "../assembleCampaignPacingRows.js"
import {
  servePortfolioSnapshot,
  snapshotCountTo,
  snapshotMatchesCountTo,
  type PortfolioSnapshotRecord,
} from "../servePortfolioSnapshot.js"
import { resolveAdminPacingDays } from "../../countTo.js"

const VIEW = "2026-10-22"
const COUNT_TO = "2026-10-21"

function octoberSchedule(amount: number): CampaignScheduleInput {
  const dollars = amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
  return {
    deliverySchedule: [
      {
        month: "October 2026",
        mediaCosts: { search: dollars },
        mediaTotal: dollars,
        feeTotal: "$0.00",
        totalAmount: dollars,
      },
    ],
    campaignBudget: amount,
  }
}

function octoberSearch(mba: string, start: string, end: string, spend: number) {
  return searchFixture({
    mbaNumber: mba,
    lineItemId: `${mba}se1`,
    campaignStartDate: start,
    campaignEndDate: end,
    lineItemStartDate: start,
    lineItemEndDate: end,
    totalLineItemBudget: 3_100,
    spendToDateLineTotal: spend,
    spendYesterday: 100,
    impressions: spend > 0 ? 1_000 : 0,
    clicks: spend > 0 ? 10 : 0,
  })
}

function assemble(countToDate: string | undefined, liveOnly = true) {
  return assembleCampaignPacingRows({
    asOfDate: VIEW,
    countToDate,
    allowedClientSlugs: null,
    liveOnly,
    search: [
      octoberSearch("p1oct001", "2026-10-01", "2026-10-31", 2_100),
      octoberSearch("p1oct002", "2026-10-22", "2026-10-31", 0),
      octoberSearch("p1oct003", "2026-10-01", "2026-10-21", 2_100),
    ],
    social: [],
    programmatic: [],
    adServing: [],
    direct: [],
    schedulesByMba: new Map([
      ["p1oct001", octoberSchedule(3_100)],
      ["p1oct002", octoberSchedule(1_000)],
      ["p1oct003", octoberSchedule(2_100)],
    ]),
  })
}

describe("portfolio counts to the count-to day (P1)", () => {
  it("expected and days elapsed stop at the count-to day", () => {
    const row = assemble(COUNT_TO).find((r) => r.mbaNumber === "p1oct001")
    assert.ok(row)
    assert.equal(row.countToDate, COUNT_TO)
    assert.equal(row.daysElapsed, 21)
    assert.equal(row.daysLeft, 10)
    assert.equal(Number(row.expectedToDate.toFixed(2)), 2_100)
    assert.equal(row.pace, "on_track")
    assert.equal(row.spendYesterday, 100)
  })

  it("without a count-to day the row counts to the view day, unstamped", () => {
    const row = assemble(undefined).find((r) => r.mbaNumber === "p1oct001")
    assert.ok(row)
    assert.equal(row.countToDate, undefined)
    assert.equal(row.daysElapsed, 22)
    assert.equal(Number(row.expectedToDate.toFixed(2)), 2_200)
  })

  it("a campaign starting on the view day is listed, not started, nothing expected", () => {
    const row = assemble(COUNT_TO).find((r) => r.mbaNumber === "p1oct002")
    assert.ok(row)
    assert.equal(row.pace, "not_started")
    assert.equal(row.expectedToDate, 0)
    assert.equal(row.daysElapsed, 0)
    assert.equal(row.channels[0]?.pace, "not_started")
  })

  it("a campaign that ended on the count-to day is fully expected", () => {
    // Not live on the view day, so only an all-campaigns build lists it.
    assert.equal(
      assemble(COUNT_TO).some((r) => r.mbaNumber === "p1oct003"),
      false,
    )
    const row = assemble(COUNT_TO, false).find((r) => r.mbaNumber === "p1oct003")
    assert.ok(row)
    assert.equal(Number(row.expectedToDate.toFixed(2)), 2_100)
    assert.equal(row.daysLeft, 0)
    assert.equal(row.pace, "on_track")
  })

  it("cron and route days are Melbourne today and yesterday", () => {
    assert.deepEqual(resolveAdminPacingDays(null, new Date("2026-10-21T22:30:00Z")), {
      asOfDate: VIEW,
      countToDate: COUNT_TO,
    })
  })
})

function record(rows: ReturnType<typeof assemble>, generatedAt = "2026-10-21T21:00:00.000Z"): PortfolioSnapshotRecord {
  return {
    asOfDate: VIEW,
    scopeKey: "all",
    liveOnly: true,
    rows,
    counts: { live: rows.length, behind: 0, on_track: rows.length, ahead: 0, over_pacing: 0, attention: 0 },
    generatedAt,
    durationMs: 1,
  }
}

describe("portfolio snapshot serving under P1", () => {
  const oldRule = record(assemble(undefined))
  const newRule = record(assemble(COUNT_TO), "2026-10-22T01:00:00.000Z")

  it("reads the count-to stamp off stored rows", () => {
    assert.equal(snapshotCountTo(oldRule), null)
    assert.equal(snapshotCountTo(newRule), COUNT_TO)
    assert.equal(snapshotMatchesCountTo(oldRule, COUNT_TO), false)
    assert.equal(snapshotMatchesCountTo(newRule, COUNT_TO), true)
    assert.equal(snapshotMatchesCountTo(oldRule, undefined), true)
  })

  it("admin rebuilds a row built before P1 and passes the count-to day", async () => {
    let builtWith: string | undefined
    const result = await servePortfolioSnapshot({
      asOf: VIEW,
      countToDate: COUNT_TO,
      liveOnly: true,
      scopeKey: "all",
      allowedClientSlugs: null,
      isAdmin: true,
      refresh: false,
      readSnapshot: async () => oldRule,
      buildAndStore: async (args) => {
        builtWith = args.countToDate
        return newRule
      },
      scheduleBuild: () => {
        throw new Error("admin builds inline")
      },
    })
    assert.equal(builtWith, COUNT_TO)
    assert.equal(result.status, 200)
    if (result.status !== 200) return
    assert.equal(result.body.countTo, COUNT_TO)
    assert.equal(result.body.stale, undefined)
  })

  it("client gets the old row as stale while a build is scheduled", async () => {
    let scheduled = 0
    const result = await servePortfolioSnapshot({
      asOf: VIEW,
      countToDate: COUNT_TO,
      liveOnly: true,
      scopeKey: "acme",
      allowedClientSlugs: new Set(["acme"]),
      isAdmin: false,
      refresh: false,
      readSnapshot: async () => oldRule,
      buildAndStore: async () => newRule,
      scheduleBuild: () => {
        scheduled += 1
      },
    })
    assert.equal(scheduled, 1)
    assert.equal(result.status, 200)
    if (result.status !== 200) return
    assert.equal(result.body.stale?.asOf, VIEW)
    assert.equal(result.body.countTo, undefined)
  })

  it("a row already counted to the count-to day is a hit", async () => {
    const result = await servePortfolioSnapshot({
      asOf: VIEW,
      countToDate: COUNT_TO,
      liveOnly: true,
      scopeKey: "all",
      allowedClientSlugs: null,
      isAdmin: true,
      refresh: false,
      readSnapshot: async () => newRule,
      buildAndStore: async () => {
        throw new Error("should not build on a hit")
      },
      scheduleBuild: () => {
        throw new Error("should not schedule on a hit")
      },
    })
    assert.equal(result.status, 200)
    if (result.status !== 200) return
    assert.equal(result.body.generated_at, newRule.generatedAt)
    assert.equal(result.body.countTo, COUNT_TO)
  })
})
