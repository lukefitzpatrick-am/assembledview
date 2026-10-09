import assert from "node:assert/strict"
import test from "node:test"

import type { CampaignReportPayload } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { campaignReportPeriodMetrics } from "@/lib/reports/campaignReport/periodMetrics"
import type { PersistPerformanceReportInsightsInput } from "@/lib/reports/persistPerformanceReportInsights"
import type { AvaToolContext } from "@/lib/ava/tools/types"
import {
  executeGeneratePerformanceReport,
  performanceReportCommentaryRejection,
} from "@/lib/ava/tools/generatePerformanceReport"

const ctx: AvaToolContext = {
  pageContext: undefined,
  clientSlug: "penfold",
  mbaNumber: "PENFOLD013",
  versionNumber: undefined,
  enabledMediaTypes: undefined,
  userSub: "u1",
  userEmail: "luke@assembled.media",
  roles: ["admin"],
  clientSlugs: [],
  mbaNumbers: [],
  capturedPatch: null,
  capturedAttachments: null,
  capturedQuestions: null,
  pendingParsedPlan: null,
  capturedLineItemsLoad: null,
  currentLineItems: null,
}

function commentary() {
  return {
    summary: "Search led delivery this month.",
    items: [
      {
        insight: "Search carried the efficient delivery.",
        action: "Hold the search mix in flight.",
        actionOwner: "Assembled",
        outcome: "Efficiency stays with search.",
        outcomeKind: "expected" as const,
      },
      {
        insight: "Social delivered the video views.",
        action: "Refresh the social cut next period.",
        actionOwner: "Client",
        outcome: "Video completions hold.",
        outcomeKind: "achieved" as const,
      },
    ],
  }
}

function payload(): CampaignReportPayload {
  return {
    mbaNumber: "PENFOLD013",
    clientName: "Penfold",
    campaignName: "Always on",
    versionNumber: 4,
    asOf: "2026-08-15",
    period: {
      kind: "this_month",
      slug: "this-month",
      label: "This month",
      current: { startISO: "2026-08-01", endISO: "2026-08-31" },
      previous: null,
    },
    totals: {
      plannedBudget: 1000,
      spend: 100,
      impressions: 10,
      clicks: 1,
      results: 0,
      previousSpend: null,
      previousImpressions: null,
      expectedSpendToDate: null,
      timeElapsedPct: null,
      metrics: campaignReportPeriodMetrics({
        spend: 100,
        impressions: 10,
        clicks: 1,
        expectedSpend: null,
      }),
      previousMetrics: null,
    },
    channels: [],
    deliveryStates: ["reported"],
    kpis: [],
    commentary: null,
  }
}

test("a figure that is not in the report is rejected", () => {
  const hit = performanceReportCommentaryRejection(
    {
      ...commentary(),
      items: [
        {
          ...commentary().items[0]!,
          outcome: "Spend was $999,999.",
        },
        commentary().items[1]!,
      ],
    },
    "spend 100",
    [],
  )
  assert.equal(hit?.error, "invented_money_figure")
})

test("generate_performance_report stores the campaign report and persists action, owner and outcome", async () => {
  const persisted: PersistPerformanceReportInsightsInput[] = []
  let storedPath = ""
  const result = await executeGeneratePerformanceReport(
    { period: { kind: "this_month" }, commentary: commentary() },
    ctx,
    {
      listPriors: async () => [],
      reportDeps: {
        resolvePublished: async () => ({
          versionNumber: 4,
          clientName: "Penfold",
          campaignName: "Always on",
          campaignStartISO: "2026-07-01",
          campaignEndISO: "2026-09-30",
          mpSearchEnabled: false,
        }),
        assemble: async () => payload(),
        buildDeck: async () => Buffer.from("deck"),
        storeReport: async (mba, filename) => {
          storedPath = `exports/reports/${mba}/${filename}`
          return { pathname: storedPath, filename }
        },
      },
      persistInsights: async (input) => {
        persisted.push(input)
        return { attempted: 2, written: 2, skipped: false }
      },
    },
  )

  assert.equal(result.isError, false)
  assert.match(storedPath, /^exports\/reports\/PENFOLD013\//)
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0]?.commentaryItems?.[0]?.action, "Hold the search mix in flight.")
  assert.equal(persisted[0]?.commentaryItems?.[0]?.actionOwner, "Assembled")
  assert.equal(persisted[0]?.commentaryItems?.[0]?.outcome, "Efficiency stays with search.")
  assert.equal(persisted[0]?.reportMonth, "2026-08")
})

test("an invented figure does not build or store the deck", async () => {
  let built = 0
  const result = await executeGeneratePerformanceReport(
    {
      period: { kind: "this_month" },
      commentary: {
        ...commentary(),
        items: [
          { ...commentary().items[0]!, outcome: "Spend was $999,999." },
          commentary().items[1]!,
        ],
      },
    },
    ctx,
    {
      listPriors: async () => [],
      reportDeps: {
        resolvePublished: async () => ({
          versionNumber: 4,
          clientName: "Penfold",
          campaignName: "Always on",
          campaignStartISO: null,
          campaignEndISO: null,
          mpSearchEnabled: false,
        }),
        assemble: async () => payload(),
        buildDeck: async () => {
          built += 1
          return Buffer.from("deck")
        },
        storeReport: async () => {
          throw new Error("store should not run")
        },
      },
    },
  )

  assert.equal(built, 0)
  assert.equal(result.isError, true)
  assert.match(result.content, /invented_money_figure/)
})
