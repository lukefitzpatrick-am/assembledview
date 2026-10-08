import assert from "node:assert/strict"
import test from "node:test"

import {
  enqueueMonthlyReportRuns,
  isMonthlyReportEnqueueDay,
  periodFromYearMonth,
  previousSydneyMonth,
  selectMonthlyReportMbas,
  type MonthlyReportMbaCandidate,
  type QueuedReportRun,
} from "@/lib/reports/selectMonthlyReportMbas"

test("previous Sydney month crosses the year boundary", () => {
  assert.deepEqual(previousSydneyMonth("2026-01-04"), {
    periodStart: "2025-12-01",
    periodEnd: "2025-12-31",
  })
  assert.equal(isMonthlyReportEnqueueDay("2026-01-04"), true)
  assert.equal(isMonthlyReportEnqueueDay("2026-01-05"), true)
  assert.equal(isMonthlyReportEnqueueDay("2026-01-06"), false)
  assert.deepEqual(previousSydneyMonth("2024-03-04"), {
    periodStart: "2024-02-01",
    periodEnd: "2024-02-29",
  })
  assert.deepEqual(periodFromYearMonth("2025-12"), {
    periodStart: "2025-12-01",
    periodEnd: "2025-12-31",
  })
  assert.deepEqual(periodFromYearMonth("2024-02"), {
    periodStart: "2024-02-01",
    periodEnd: "2024-02-29",
  })
  assert.equal(periodFromYearMonth("2025-13"), null)
  assert.equal(periodFromYearMonth("December"), null)
})

test("selection includes a booked plan that ended mid-month and excludes a planned one", () => {
  const period = previousSydneyMonth("2026-01-04")
  const booked: MonthlyReportMbaCandidate = {
    mbaNumber: "MBA-BOOKED",
    clientId: 11,
    masterCampaignStatus: "booked",
    versionCampaignStatus: "booked",
    campaignStart: "2025-11-01",
    campaignEnd: "2025-12-15",
  }
  const planned: MonthlyReportMbaCandidate = {
    mbaNumber: "MBA-PLANNED",
    clientId: 12,
    masterCampaignStatus: "planned",
    versionCampaignStatus: "planned",
    campaignStart: "2025-12-01",
    campaignEnd: "2025-12-31",
  }
  const cancelled: MonthlyReportMbaCandidate = {
    mbaNumber: "MBA-CANCELLED",
    clientId: 13,
    masterCampaignStatus: "cancelled",
    versionCampaignStatus: "booked",
    campaignStart: "2025-12-01",
    campaignEnd: "2025-12-31",
  }
  const endedBefore: MonthlyReportMbaCandidate = {
    mbaNumber: "MBA-ENDED",
    clientId: 14,
    masterCampaignStatus: "booked",
    versionCampaignStatus: "booked",
    campaignStart: "2025-10-01",
    campaignEnd: "2025-11-30",
  }

  const selected = selectMonthlyReportMbas(
    [planned, cancelled, endedBefore, booked],
    period,
  )
  assert.deepEqual(
    selected.map((row) => row.mbaNumber),
    ["MBA-BOOKED"],
  )
})

test("a rerun inserts nothing new", async () => {
  const seen = new Set<string>()
  const stored: QueuedReportRun[] = []
  async function insertQueued(rows: QueuedReportRun[]): Promise<number> {
    let added = 0
    for (const row of rows) {
      const key = `${row.kind}|${row.mbaNumber}|${row.periodStart}`
      if (seen.has(key)) continue
      seen.add(key)
      stored.push(row)
      added += 1
    }
    return added
  }

  const candidates: MonthlyReportMbaCandidate[] = [
    {
      mbaNumber: "MBA-BOOKED",
      clientId: 11,
      masterCampaignStatus: "booked",
      versionCampaignStatus: "booked",
      campaignStart: "2025-12-01",
      campaignEnd: "2026-01-31",
    },
  ]

  const first = await enqueueMonthlyReportRuns({
    candidates,
    todayISO: "2026-01-04",
    insertQueued,
  })
  const second = await enqueueMonthlyReportRuns({
    candidates,
    todayISO: "2026-01-05",
    insertQueued,
  })

  assert.equal(first.queued, 1)
  assert.equal(first.alreadyPresent, 0)
  assert.equal(first.periodStart, "2025-12-01")
  assert.equal(first.periodEnd, "2025-12-31")
  assert.equal(second.queued, 0)
  assert.equal(second.alreadyPresent, 1)
  assert.equal(second.selected, 1)
  assert.equal(stored.length, 1)
  assert.equal(stored[0]?.status, "queued")
  assert.equal(stored[0]?.kind, "monthly_campaign")
})
