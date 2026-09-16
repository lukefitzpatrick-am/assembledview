import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const insertMock = mock.fn(async (input: {
  mbaNumber: string
  versionNumber: number
  beats: Record<string, string>
  sources: string[] | null
  generatedByEmail: string
}) => ({
  id: 9,
  mbaNumber: input.mbaNumber,
  versionNumber: input.versionNumber,
  status: "draft" as const,
  beats: input.beats,
  bodyMarkdown: "md",
  sources: input.sources,
  generatedAt: "2026-09-17T00:00:00.000Z",
  generatedByEmail: input.generatedByEmail,
  editedAt: null,
  editedByEmail: null,
  publishedAt: null,
  publishedByEmail: null,
}))

const fetchKpisMock = mock.fn(async () => [{ ctr: 0.01 }])

if (supportsMockModule()) {
  await mock.module!("@/lib/campaign-read/repo", {
    namedExports: {
      insertCampaignReadDraft: insertMock,
    },
  })
  await mock.module!("@/lib/kpi/campaignKpi", {
    namedExports: {
      fetchCampaignKpis: fetchKpisMock,
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
  insertMock.mock.resetCalls()
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
  assert.equal(insertMock.mock.calls.length, 1)
  const stored = insertMock.mock.calls[0]!.arguments[0] as {
    beats: Record<string, string>
    mbaNumber: string
  }
  assert.equal(stored.mbaNumber, "GOLF001")
  assert.deepEqual(Object.keys(stored.beats).sort(), [
    "best",
    "happened",
    "planned",
    "upcoming",
    "vsPlan",
    "worst",
  ])
})
