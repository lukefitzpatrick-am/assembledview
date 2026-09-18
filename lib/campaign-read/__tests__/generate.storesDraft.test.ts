import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const completeMock = mock.fn(async (input: {
  id: number
  beats: Record<string, string>
  sources: string[] | null
}) => ({
  id: input.id,
  mbaNumber: "GOLF001",
  versionNumber: 4,
  status: "draft" as const,
  beats: input.beats,
  bodyMarkdown: "md",
  sources: input.sources,
  errorMessage: null,
  generatedAt: "2026-09-17T00:00:00.000Z",
  generatedByEmail: "luke@assembledmedia.com.au",
  editedAt: null,
  editedByEmail: null,
  publishedAt: null,
  publishedByEmail: null,
}))

const insertGeneratingMock = mock.fn(async () => ({
  id: 9,
  mbaNumber: "GOLF001",
  versionNumber: 4,
  status: "generating" as const,
  beats: {
    planned: "Nothing to report yet.",
    happened: "Nothing to report yet.",
    vsPlan: "Nothing to report yet.",
    best: "Nothing to report yet.",
    worst: "Nothing to report yet.",
    upcoming: "Nothing to report yet.",
  },
  bodyMarkdown: "md",
  sources: null,
  errorMessage: null,
  generatedAt: "2026-09-17T00:00:00.000Z",
  generatedByEmail: "luke@assembledmedia.com.au",
  editedAt: null,
  editedByEmail: null,
  publishedAt: null,
  publishedByEmail: null,
}))

const fetchKpisMock = mock.fn(async () => [{ ctr: 0.01 }])

if (supportsMockModule()) {
  await mock.module!("@/lib/campaign-read/repo", {
    namedExports: {
      insertCampaignReadGenerating: insertGeneratingMock,
      completeCampaignReadDraft: completeMock,
      failCampaignRead: mock.fn(),
      failStaleGeneratingReads: async () => 0,
      insertCampaignReadDraft: mock.fn(),
    },
  })
  await mock.module!("@/lib/kpi/campaignKpi", {
    namedExports: {
      fetchCampaignKpis: fetchKpisMock,
    },
  })
  await mock.module!("@/lib/delivery/loadDeliverySnapshot", {
    namedExports: {
      loadDeliverySnapshot: async () => ({
        asOf: "2026-09-18",
        window: { startDate: null, endDate: null },
        mbaNumber: "GOLF001",
        versionNumber: 4,
        channels: [],
        planTotals: {
          spendToDate: 0,
          impressions: 0,
          clicks: 0,
          results: 0,
          video3sViews: 0,
          plannedBudget: 0,
          cpm: null,
          ctr: null,
          cpc: null,
        },
      }),
    },
  })
  await mock.module!("@/lib/ava/agentLoop", {
    namedExports: {
      runAvaAgent: async () => ({ replyText: "{}" }),
    },
  })
  await mock.module!("@/lib/ava/tools/loadSkill", {
    namedExports: {
      buildLoadSkillPayload: () => ({
        content: "skill body",
        skillId: "assembled-campaign-read",
      }),
    },
  })
}

test("generate stores a draft with six beats", { skip }, async () => {
  completeMock.mock.resetCalls()
  insertGeneratingMock.mock.resetCalls()
  const { generateCampaignReadDraft } = await import("../generate.js")

  const item = await generateCampaignReadDraft({
    mbaNumber: "GOLF001",
    versionNumber: 4,
    generatedByEmail: "luke@assembledmedia.com.au",
    runAgent: async () =>
      JSON.stringify({
        beats: {
          planned: "You booked $180K.",
          happened: "Search delivered $62K.",
          vsPlan: "Meta is $11K behind.",
          best: "Search is ahead.",
          worst: "Meta lag. We moved $8K.",
          upcoming: "September burst.",
        },
        sources: ["get_delivery_snapshot"],
      }),
  })

  assert.equal(item.status, "draft")
  assert.equal(item.beats.planned, "You booked $180K.")
  assert.equal(item.beats.worst, "Meta lag. We moved $8K.")
  assert.equal(insertGeneratingMock.mock.calls.length, 1)
  assert.equal(completeMock.mock.calls.length, 1)
  const stored = completeMock.mock.calls[0]!.arguments[0] as {
    beats: Record<string, string>
    id: number
  }
  assert.equal(stored.id, 9)
  assert.deepEqual(Object.keys(stored.beats).sort(), [
    "best",
    "happened",
    "planned",
    "upcoming",
    "vsPlan",
    "worst",
  ])
})
