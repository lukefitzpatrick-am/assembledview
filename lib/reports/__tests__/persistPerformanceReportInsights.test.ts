import assert from "node:assert/strict"
import test from "node:test"

import type { PerformanceReportPayload } from "../buildPerformanceReport.js"
import {
  buildPerformanceReportInsightDrafts,
  inferInsightType,
  persistPerformanceReportInsights,
  reportMonthToPeriod,
  type CampaignInsightInsert,
} from "../persistPerformanceReportInsights.js"

function sampleNarrative(): Pick<
  PerformanceReportPayload,
  "execSummary" | "keyInsight" | "insights" | "recsInFlight" | "recsNextPeriod"
> {
  return {
    execSummary: "Spend is on track; search leads efficiency gains this month.",
    keyInsight:
      "Efficiency gains are concentrated in branded search; prospecting needs refresh.",
    insights: [
      "Branded search CPA improved 18% MoM.",
      "Meta frequency above 3.5 on core audience.",
      "BVOD delivery lag is flighting, not inventory.",
    ],
    recsInFlight: "Shift 8% social to search; pause fatigued Meta creative.",
    recsNextPeriod: "Launch new prospecting set; bring BVOD back to plan by week 3.",
  }
}

test("reportMonthToPeriod normalises Mon YYYY and YYYY-MM", () => {
  assert.equal(reportMonthToPeriod("Jul 2026"), "2026-07")
  assert.equal(reportMonthToPeriod("2026-07"), "2026-07")
  assert.equal(reportMonthToPeriod("July 2026"), "2026-07")
})

test("inferInsightType falls back to delivery with confidence marker", () => {
  const hit = inferInsightType("Something ambiguous about the account.")
  assert.equal(hit.insightType, "delivery")
  assert.match(String(hit.confidence), /fallback/i)
})

test("buildPerformanceReportInsightDrafts writes 6 rows, not execSummary", () => {
  const drafts = buildPerformanceReportInsightDrafts({
    narrative: sampleNarrative(),
    mbaNumber: "BICAU001",
    clientId: 42,
    reportMonth: "Jul 2026",
    createdByEmail: "Luke@Assembled.Media",
  })

  assert.equal(drafts.length, 6)
  assert.ok(drafts.every((d) => d.source === "ava"))
  assert.ok(drafts.every((d) => d.mbaNumber === "bicau001"))
  assert.ok(drafts.every((d) => d.createdBy === "luke@assembled.media"))
  assert.ok(drafts.every((d) => d.period === "2026-07"))
  assert.ok(drafts.every((d) => d.clientId === 42))
  assert.equal(
    drafts.some((d) => d.body === sampleNarrative().execSummary),
    false,
    "execSummary must not be persisted",
  )
  const bodies = new Set(drafts.map((d) => d.body))
  assert.ok(bodies.has(sampleNarrative().keyInsight))
  for (const line of sampleNarrative().insights) assert.ok(bodies.has(line))
  assert.ok(bodies.has(sampleNarrative().recsInFlight))
  assert.ok(bodies.has(sampleNarrative().recsNextPeriod))
})

test("mba_number is stored lowercase for uppercase input", () => {
  const drafts = buildPerformanceReportInsightDrafts({
    narrative: sampleNarrative(),
    mbaNumber: "BICAU001",
    clientId: 1,
    reportMonth: "2026-07",
    createdByEmail: "a@b.com",
  })
  assert.ok(drafts.every((d) => d.mbaNumber === "bicau001"))
})

test("persist writes expected row count with source ava", async () => {
  const inserted: CampaignInsightInsert[] = []
  const result = await persistPerformanceReportInsights(
    {
      narrative: sampleNarrative(),
      mbaNumber: "BICAU001",
      reportMonth: "Jul 2026",
      createdByEmail: "User@Example.com",
      preview: false,
      dryRun: false,
    },
    {
      resolveClientIdFromMba: async () => 99,
      insertInsight: async (row) => {
        inserted.push(row)
      },
    },
  )

  assert.equal(result.attempted, 6)
  assert.equal(result.written, 6)
  assert.equal(inserted.length, 6)
  assert.ok(inserted.every((r) => r.source === "ava"))
  assert.ok(inserted.every((r) => r.mbaNumber === "bicau001"))
  assert.ok(inserted.every((r) => r.clientId === 99))
})

test("rejected insight_type does not abort persistence batch", async () => {
  const inserted: CampaignInsightInsert[] = []
  const errors: string[] = []
  const result = await persistPerformanceReportInsights(
    {
      narrative: sampleNarrative(),
      mbaNumber: "mba1",
      reportMonth: "2026-07",
      createdByEmail: "a@b.com",
    },
    {
      resolveClientIdFromMba: async () => 1,
      insertInsight: async (row) => {
        if (row.body === sampleNarrative().keyInsight) {
          throw new Error(
            'new row for relation "campaign_insights" violates check constraint "campaign_insights_insight_type_check"',
          )
        }
        inserted.push(row)
      },
      logError: (err) => {
        errors.push(err instanceof Error ? err.message : String(err))
      },
    },
  )

  assert.equal(result.attempted, 6)
  assert.equal(result.written, 5)
  assert.equal(inserted.length, 5)
  assert.equal(errors.length, 1)
})

test("database failure during write leaves caller unaffected (no throw)", async () => {
  await assert.doesNotReject(async () => {
    const result = await persistPerformanceReportInsights(
      {
        narrative: sampleNarrative(),
        mbaNumber: "mba1",
        reportMonth: "2026-07",
        createdByEmail: "a@b.com",
      },
      {
        resolveClientIdFromMba: async () => {
          throw new Error("connection refused")
        },
        insertInsight: async () => {
          throw new Error("should not be called")
        },
      },
    )
    assert.equal(result.written, 0)
  })
})

test("persist writes action, owner and outcome when the payload has them", async () => {
  const inserted: CampaignInsightInsert[] = []
  const narrative = {
    ...sampleNarrative(),
    findings: [
      {
        action: "Hold the current search mix.",
        actionOwner: "Assembled",
        outcome: "CPA stays at the July rate.",
        outcomeKind: "expected",
      },
      null,
      {
        action: "Refresh the fatigued set.",
        action_owner: "Meta",
        outcome: "Frequency is under 3.",
        outcome_kind: "achieved",
      },
      { outcomeKind: "later" },
    ],
  }
  const result = await persistPerformanceReportInsights(
    {
      narrative,
      mbaNumber: "BICAU001",
      reportMonth: "Jul 2026",
      createdByEmail: "User@Example.com",
    },
    {
      resolveClientIdFromMba: async () => 99,
      insertInsight: async (row) => {
        inserted.push(row)
      },
    },
  )

  assert.equal(result.written, 6)
  assert.equal(inserted[0]?.action, "Hold the current search mix.")
  assert.equal(inserted[0]?.actionOwner, "Assembled")
  assert.equal(inserted[0]?.outcome, "CPA stays at the July rate.")
  assert.equal(inserted[0]?.outcomeKind, "expected")
  assert.equal(inserted[1]?.action, null)
  assert.equal(inserted[1]?.outcome, null)
  assert.equal(inserted[2]?.action, "Refresh the fatigued set.")
  assert.equal(inserted[2]?.actionOwner, "Meta")
  assert.equal(inserted[2]?.outcomeKind, "achieved")
  assert.equal(inserted[3]?.action, null)
  assert.equal(inserted[3]?.outcome, null)
  assert.equal(inserted[3]?.outcomeKind, null)
  assert.equal(inserted[5]?.action, null)
  assert.equal(inserted[5]?.outcomeKind, null)
})

test("commentary items persist action, owner and outcome and skip a duplicate period", async () => {
  const inserted: CampaignInsightInsert[] = []
  const items = [
    {
      insight: "Search delivered the largest share of spend.",
      action: "Hold the search mix this month.",
      actionOwner: "Assembled",
      outcome: "Spend stays with the plan.",
      outcomeKind: "expected" as const,
    },
    {
      insight: "Social trailed search on delivery.",
      action: "Review social creative next week.",
      actionOwner: "Meta",
      outcome: "Delivery is measured again next period.",
      outcomeKind: "achieved" as const,
    },
  ]
  const first = await persistPerformanceReportInsights(
    {
      commentaryItems: items,
      mbaNumber: "PENFOLD013",
      reportMonth: "2026-08",
      createdByEmail: "Luke@Assembled.Media",
    },
    {
      resolveClientIdFromMba: async () => 7,
      insertInsight: async (row) => {
        inserted.push(row)
      },
      listExistingBodies: async () => [],
    },
  )
  assert.equal(first.written, 2)
  assert.equal(inserted[0]?.source, "ava")
  assert.equal(inserted[0]?.action, "Hold the search mix this month.")
  assert.equal(inserted[0]?.actionOwner, "Assembled")
  assert.equal(inserted[0]?.outcomeKind, "expected")
  assert.equal(inserted[0]?.period, "2026-08")
  assert.match(String(inserted[0]?.confidence), /origin:review-report/)
  assert.equal(inserted[1]?.outcomeKind, "achieved")

  const second = await persistPerformanceReportInsights(
    {
      commentaryItems: items,
      mbaNumber: "PENFOLD013",
      reportMonth: "2026-08",
      createdByEmail: "Luke@Assembled.Media",
    },
    {
      resolveClientIdFromMba: async () => 7,
      insertInsight: async () => {
        throw new Error("duplicate should not insert")
      },
      listExistingBodies: async () => items.map((item) => item.insight),
    },
  )
  assert.equal(second.written, 0)
  assert.equal(second.skipped, true)
  assert.equal(second.reason, "duplicate_period")
})

test("preview or dryRun skips all writes", async () => {
  let calls = 0
  const preview = await persistPerformanceReportInsights(
    {
      narrative: sampleNarrative(),
      mbaNumber: "mba1",
      reportMonth: "2026-07",
      createdByEmail: "a@b.com",
      preview: true,
    },
    {
      resolveClientIdFromMba: async () => 1,
      insertInsight: async () => {
        calls += 1
      },
    },
  )
  const dry = await persistPerformanceReportInsights(
    {
      narrative: sampleNarrative(),
      mbaNumber: "mba1",
      reportMonth: "2026-07",
      createdByEmail: "a@b.com",
      dryRun: true,
    },
    {
      resolveClientIdFromMba: async () => 1,
      insertInsight: async () => {
        calls += 1
      },
    },
  )
  assert.equal(preview.written, 0)
  assert.equal(dry.written, 0)
  assert.equal(calls, 0)
})
