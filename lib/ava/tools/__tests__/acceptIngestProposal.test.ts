import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { acceptIngestProposalTool } from "../acceptIngestProposal.js"
import { getPendingIngestReviewTool } from "../getPendingIngestReview.js"
import type { AvaToolContext } from "../types.js"
import { buildIngestReviewFromFile } from "@/lib/mediaplans/ingest/buildIngestReview"
import { loadSeedPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import {
  clearIngestStageForTests,
  putIngestStage,
  setIngestStageExpiresAtForTests,
} from "@/lib/mediaplans/ingest/ingestStageStore"
import { clearIngestRunOverlayForTests } from "@/lib/mediaplans/ingest/ingestRuns"
import { setExecuteIngestAcceptDepsForTests } from "@/lib/mediaplans/ingest/executeIngestAccept"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const QMS = "qms_strength-meals_esb-ooh.xlsx"

function ctx(overrides: Partial<AvaToolContext> = {}): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: undefined,
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "u1",
    userEmail: "ava@assembledmedia.com.au",
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    pendingIngest: null,
    capturedLineItemsLoad: null,
    currentLineItems: null,
    ...overrides,
  }
}

test.beforeEach(() => {
  clearIngestStageForTests()
  clearIngestRunOverlayForTests()
  setExecuteIngestAcceptDepsForTests(null)
})

test.afterEach(() => {
  setExecuteIngestAcceptDepsForTests(null)
})

test("get_pending_ingest_review returns Hub-matching summary for staged QMS", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const c = ctx({
    pendingIngest: { stageId, fileName: QMS },
  })
  const out = await getPendingIngestReviewTool.execute({}, c)
  assert.equal(out.isError, false)
  const parsed = JSON.parse(out.content) as {
    detected_publisher: string
    line_item_count: number
    full_review_path: string
  }
  assert.equal(parsed.detected_publisher, "QMS")
  assert.equal(
    parsed.line_item_count,
    hub.proposal!.reconciliation.line_item_count,
  )
  assert.ok(parsed.full_review_path.includes(stageId))
})

test("accept_ingest_proposal refuses without confirm", async () => {
  const denied = await acceptIngestProposalTool.execute({ confirm: false }, ctx())
  assert.equal(denied.isError, true)
  assert.match(denied.content, /confirm/i)
})

test("accept_ingest_proposal asks for MBA when not inferable — never guesses", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const c = ctx({
    mbaNumber: undefined,
    pendingIngest: { stageId, fileName: QMS },
  })
  const denied = await acceptIngestProposalTool.execute({ confirm: true }, c)
  assert.equal(denied.isError, true)
  assert.match(denied.content, /MBA/i)
})

test("accept_ingest_proposal confirm with page MBA accepts via shared engine", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  let saved = 0
  setExecuteIngestAcceptDepsForTests({
    resolveCampaign: async (mba) => ({
      masterId: 42,
      mbaNumber: mba,
      versionNumber: 1,
      mode: "draft",
    }),
    savePlanVersion: async (input) => {
      saved = input.lineItems.length
      return { versionId: 7, versionNumber: 1, lineCount: saved }
    },
    insertPanels: async () => 0,
  })
  const c = ctx({
    mbaNumber: "qmsround01",
    pendingIngest: { stageId, fileName: QMS },
  })
  const ok = await acceptIngestProposalTool.execute({ confirm: true }, c)
  assert.equal(ok.isError, false)
  assert.ok(saved > 0)
  assert.match(ok.content, /accepted/i)
})

test("accept_ingest_proposal money-blocked explains the delta in chat", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  hub.proposal!.reconciliation = {
    ...hub.proposal!.reconciliation,
    accept_ok: false,
    delta: 999,
    delta_pct: 0.08,
    block_reason: "Computed media $1.00 diverges from file stated $2.00 by 8.00% (limit 0.5%)",
  }
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  setExecuteIngestAcceptDepsForTests({
    resolveCampaign: async (mba) => ({
      masterId: 1,
      mbaNumber: mba,
      versionNumber: 1,
      mode: "draft",
    }),
    savePlanVersion: async () => {
      throw new Error("must not save on 409")
    },
    insertPanels: async () => 0,
  })
  const c = ctx({
    mbaNumber: "qmsround01",
    pendingIngest: { stageId, fileName: QMS },
  })
  const blocked = await acceptIngestProposalTool.execute({ confirm: true }, c)
  assert.equal(blocked.isError, true)
  assert.match(blocked.content, /8\.00%|diverges|delta/i)
})

test("get_pending_ingest_review with no stageId is unchanged", async () => {
  const out = await getPendingIngestReviewTool.execute({}, ctx())
  assert.equal(out.isError, true)
  assert.match(out.content, /No pending ingest review in this turn/i)
  assert.doesNotMatch(out.content, /expired/i)
  assert.equal(out.ingestStageMissing, undefined)
})

test("get_pending_ingest_review missing stage is not expiry", async () => {
  const stageId = "stage-gone-123"
  const out = await getPendingIngestReviewTool.execute(
    {},
    ctx({ pendingIngest: { stageId, fileName: QMS } }),
  )
  assert.equal(out.isError, true)
  assert.equal(out.ingestStageMissing, true)
  assert.doesNotMatch(out.content, /expired/i)
  assert.match(out.content, new RegExp(stageId))
  assert.match(out.content, /no longer on the server/i)
  assert.match(out.content, /known server-side limitation/i)
  assert.match(out.content, /re-attach/i)
})

test("get_pending_ingest_review expired stage says expired", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  setIngestStageExpiresAtForTests(
    stageId,
    new Date(Date.now() - 1000).toISOString(),
  )
  const out = await getPendingIngestReviewTool.execute(
    {},
    ctx({ pendingIngest: { stageId, fileName: QMS } }),
  )
  assert.equal(out.isError, true)
  assert.match(out.content, /expired/i)
  assert.doesNotMatch(out.content, /known server-side limitation/i)
})
