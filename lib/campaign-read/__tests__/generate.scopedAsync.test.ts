import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { avaToolDefinitionsForPage } from "../../ava/tools/pageToolOffer.js"
import {
  CAMPAIGN_READ_GENERATE_SURFACE,
  CAMPAIGN_READ_GENERATE_TOOLS,
} from "../generateTools.js"

const skip = mockModuleSkip()

const beats = {
  planned: "You booked $180K.",
  happened: "Search delivered $62K.",
  vsPlan: "Meta is $11K behind.",
  best: "Search is ahead.",
  worst: "Meta lag. We moved $8K.",
  upcoming: "September burst.",
}

const pending = {
  id: 11,
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
}

const insertGeneratingMock = mock.fn(async () => ({ ...pending }))
const completeDraftMock = mock.fn(async (input: {
  id: number
  beats: Record<string, string>
  sources: string[] | null
}) => ({
  ...pending,
  id: input.id,
  status: "draft" as const,
  beats: input.beats,
  sources: input.sources,
}))
const failReadMock = mock.fn(async (input: { id: number; message: string }) => ({
  ...pending,
  id: input.id,
  status: "failed" as const,
  errorMessage: input.message,
}))
const fetchKpisMock = mock.fn(async () => [{ line_item_id: "golf001s1", ctr: 0.01 }])
const pacingComposerMock = mock.fn(async () => {
  throw new Error("portfolio composer must not run on generate")
})

if (supportsMockModule()) {
  await mock.module!("@/lib/campaign-read/repo", {
    namedExports: {
      insertCampaignReadGenerating: insertGeneratingMock,
      completeCampaignReadDraft: completeDraftMock,
      failCampaignRead: failReadMock,
      insertCampaignReadDraft: mock.fn(),
    },
  })
  await mock.module!("@/lib/kpi/campaignKpi", {
    namedExports: {
      fetchCampaignKpis: fetchKpisMock,
    },
  })
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: {
      getCachedSearchPacingRows: pacingComposerMock,
      getCachedSocialPacingRows: pacingComposerMock,
      getCachedProgrammaticPacingRows: pacingComposerMock,
      getCachedAdServingPacingRows: pacingComposerMock,
      getCachedDirectPacingRows: pacingComposerMock,
    },
  })
  await mock.module!("@/lib/ava/agentLoop", {
    namedExports: {
      runAvaAgent: async () => ({
        replyText: JSON.stringify({ beats, sources: ["get_delivery_snapshot"] }),
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      }),
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

test("generate tools never include get_pacing_snapshot", () => {
  assert.ok(!CAMPAIGN_READ_GENERATE_TOOLS.includes("get_pacing_snapshot" as never))
  const offered = avaToolDefinitionsForPage(
    [
      { name: "get_pacing_snapshot" },
      { name: "get_delivery_snapshot" },
      { name: "get_campaign_context" },
      { name: "get_campaign_insights" },
      { name: "get_cached_social" },
    ],
    {
      route: "/dashboard/golf/GOLF001",
      state: { surface: CAMPAIGN_READ_GENERATE_SURFACE },
    },
  )
  assert.deepEqual(
    offered.map((t) => t.name).sort(),
    ["get_campaign_context", "get_campaign_insights", "get_delivery_snapshot"],
  )
})

test("202 generating then draft; portfolio composers never run", { skip }, async () => {
  insertGeneratingMock.mock.resetCalls()
  completeDraftMock.mock.resetCalls()
  failReadMock.mock.resetCalls()
  pacingComposerMock.mock.resetCalls()
  const { startCampaignReadGeneration, runCampaignReadJob } = await import("../generate.js")

  const started = await startCampaignReadGeneration({
    mbaNumber: "GOLF001",
    versionNumber: 4,
    generatedByEmail: "luke@assembledmedia.com.au",
  })
  assert.equal(started.status, "generating")
  assert.equal(started.id, 11)

  const item = await runCampaignReadJob({
    id: started.id,
    mbaNumber: "GOLF001",
    versionNumber: 4,
    generatedByEmail: "luke@assembledmedia.com.au",
    runAgent: async () =>
      JSON.stringify({
        beats,
        sources: ["get_delivery_snapshot", "get_campaign_context"],
      }),
  })

  assert.equal(item.status, "draft")
  assert.equal(item.beats.planned, "You booked $180K.")
  assert.equal(completeDraftMock.mock.calls.length, 1)
  assert.equal(failReadMock.mock.calls.length, 0)
  assert.equal(pacingComposerMock.mock.calls.length, 0)
})

test("error marks the generating row failed with the message", { skip }, async () => {
  failReadMock.mock.resetCalls()
  completeDraftMock.mock.resetCalls()
  pacingComposerMock.mock.resetCalls()
  const { runCampaignReadJob } = await import("../generate.js")

  const item = await runCampaignReadJob({
    id: 11,
    mbaNumber: "GOLF001",
    versionNumber: 4,
    generatedByEmail: "luke@assembledmedia.com.au",
    runAgent: async () => {
      throw new Error("model timed out")
    },
  })

  assert.equal(item.status, "failed")
  assert.equal(item.errorMessage, "model timed out")
  assert.equal(failReadMock.mock.calls[0]!.arguments[0].message, "model timed out")
  assert.equal(completeDraftMock.mock.calls.length, 0)
  assert.equal(pacingComposerMock.mock.calls.length, 0)
})
