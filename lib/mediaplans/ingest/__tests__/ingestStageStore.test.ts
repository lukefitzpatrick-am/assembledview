/**
 * AVA-UX-2 — ingest stages persist across process reload and retain on accept.
 * Overlay stands in for PG until 0050 is applied.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { getPendingIngestReviewTool } from "@/lib/ava/tools/getPendingIngestReview"
import type { AvaToolContext } from "@/lib/ava/tools/types"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { executeIngestAccept } from "../executeIngestAccept"
import {
  clearIngestStageForTests,
  deleteIngestStage,
  getIngestStage,
  INGEST_STAGE_TTL_MS,
  lookupIngestStage,
  putIngestStage,
  setIngestStageExpiresAtForTests,
  simulateIngestStageModuleReloadForTests,
  sweepExpiredIngestStages,
} from "../ingestStageStore"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { summariseIngestReview } from "../summariseIngestReview"
import type { IngestReviewPackage } from "../buildIngestReview"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const QMS = "qms_strength-meals_esb-ooh.xlsx"
const JCD = "jcd_strength-meals_ooh.xlsx"

function stubReview(
  over: Partial<IngestReviewPackage> = {},
): IngestReviewPackage {
  return {
    detected_publisher: "QMS",
    publisher_confidence: 0.9,
    match_reasons: ["stub"],
    profile: null,
    sheet_name: "Paid",
    column_mapping: [],
    proposal: {
      publisher_name: "QMS",
      media_type: "ooh",
      sheet_name: "Paid",
      line_items: [],
      reconciliation: {
        line_item_count: 2,
        panel_count: 0,
        burst_count: 0,
        total_media_amount: 0,
        file_stated_total: 0,
        delta: 0,
        delta_pct: 0,
        accept_ok: true,
        block_reason: null,
        warnings: [],
        charges_detected_total: 0,
      },
    },
    ignored: {
      sheets_skipped: [],
      rows_unparsed: 0,
      rows_unparsed_labels: [],
      columns_unmapped: [],
      spoken: [],
    },
    ava_mapping_proposals: [],
    ava_call_count: 0,
    unmapped_column_samples: [],
    template_coverage: null,
    detected_media_type: "ooh",
    media_type_status: "detected",
    needs_catalogue_choice: false,
    source_file_name: "stub.xlsx",
    sheets: [],
    ...over,
  }
}

function toolCtx(stageId: string): AvaToolContext {
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
    pendingIngest: { stageId, fileName: QMS },
    capturedLineItemsLoad: null,
    currentLineItems: null,
  }
}

test.beforeEach(() => {
  clearIngestStageForTests()
})

test("putIngestStage argument shape is unchanged and returns a stage id", async () => {
  const review = stubReview()
  const args: Parameters<typeof putIngestStage>[0] = {
    review,
    fileName: "qms.xlsx",
    uploadedBy: "luke@assembledmedia.com.au",
  }
  const id = await putIngestStage(args)
  assert.equal(typeof id, "string")
  assert.ok(id.length > 0)
  const got = await getIngestStage(id)
  assert.ok(got)
  assert.equal(got.fileName, "qms.xlsx")
  assert.equal(got.uploadedBy, "luke@assembledmedia.com.au")
  assert.equal(got.review.detected_publisher, "QMS")
})

test("JCD IngestReviewPackage serialises under 500KB (design A — whole package)", async () => {
  const review = await buildIngestReviewFromFile(
    path.join(FIX, JCD),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const bytes = Buffer.byteLength(JSON.stringify(review), "utf8")
  const kb = bytes / 1024
  assert.equal(review.proposal?.reconciliation.line_item_count, 106)
  assert.ok(kb < 500, `JCD package was ${kb.toFixed(2)} KB`)
})

test("default TTL is 24 hours", () => {
  assert.equal(INGEST_STAGE_TTL_MS, 24 * 60 * 60 * 1000)
})

test("stage survives a simulated module reload", async () => {
  const review = stubReview({ detected_publisher: "JCDecaux" })
  const id = await putIngestStage({
    review,
    fileName: "jcd.xlsx",
    uploadedBy: "ava@assembledmedia.com.au",
  })
  simulateIngestStageModuleReloadForTests()
  const got = await getIngestStage(id)
  assert.ok(got, "stage vanished after process-cache clear")
  assert.equal(got.review.detected_publisher, "JCDecaux")
  assert.equal(got.fileName, "jcd.xlsx")
})

test("expired row returns null from getIngestStage and lookup reason expired", async () => {
  const id = await putIngestStage({ review: stubReview() })
  setIngestStageExpiresAtForTests(id, new Date(Date.now() - 1000).toISOString())
  assert.equal(await getIngestStage(id), null)
  const looked = await lookupIngestStage(id)
  assert.equal(looked.ok, false)
  if (looked.ok) return
  assert.equal(looked.reason, "expired")
})

test("missing row is missing, not expired", async () => {
  const looked = await lookupIngestStage("stage-gone-123")
  assert.equal(looked.ok, false)
  if (looked.ok) return
  assert.equal(looked.reason, "missing")
  assert.equal(await getIngestStage("stage-gone-123"), null)
})

test("accepted stage is retained with master and version linkage", async () => {
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
  const result = await executeIngestAccept(
    {
      stageId,
      mbaNumber: "qmsround01",
      uploadedBy: "ava@assembledmedia.com.au",
      confirm: true,
    },
    {
      resolveCampaign: async (mba) => ({
        masterId: 42,
        mbaNumber: mba,
        versionNumber: 1,
        mode: "draft",
      }),
      savePlanVersion: async (input) => ({
        versionId: 99,
        versionNumber: 1,
        lineCount: input.lineItems.length,
      }),
      insertPanels: async () => 0,
    },
  )
  assert.equal(result.ok, true)
  const got = await getIngestStage(stageId)
  assert.ok(got)
  assert.equal(got.expiresAt, null)
  assert.ok(got.retainedAt)
  assert.equal(got.masterId, 42)
  assert.equal(got.acceptedVersionId, 99)
})

test("blocked stage keeps TTL and still expires", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  hub.proposal!.reconciliation = {
    ...hub.proposal!.reconciliation,
    accept_ok: false,
    block_reason: "Computed media diverges",
  }
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const result = await executeIngestAccept(
    {
      stageId,
      mbaNumber: "qmsround01",
      uploadedBy: "ava@assembledmedia.com.au",
      confirm: true,
    },
    {
      resolveCampaign: async (mba) => ({
        masterId: 1,
        mbaNumber: mba,
        versionNumber: 1,
        mode: "draft",
      }),
      savePlanVersion: async () => {
        throw new Error("must not save on blocked")
      },
      insertPanels: async () => 0,
    },
  )
  assert.equal(result.ok, false)
  const still = await getIngestStage(stageId)
  assert.ok(still)
  assert.ok(still.expiresAt, "blocked stage must keep a TTL")
  assert.equal(still.retainedAt, null)
  assert.equal(still.masterId, null)
  setIngestStageExpiresAtForTests(
    stageId,
    new Date(Date.now() - 1000).toISOString(),
  )
  assert.equal(await getIngestStage(stageId), null)
})

test("sweep deletes expired non-retained rows and keeps retained", async () => {
  const doomed = await putIngestStage({ review: stubReview() })
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const kept = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const accepted = await executeIngestAccept(
    {
      stageId: kept,
      mbaNumber: "qmsround01",
      uploadedBy: "ava@assembledmedia.com.au",
      confirm: true,
    },
    {
      resolveCampaign: async (mba) => ({
        masterId: 7,
        mbaNumber: mba,
        versionNumber: 1,
        mode: "draft",
      }),
      savePlanVersion: async (input) => ({
        versionId: 8,
        versionNumber: 1,
        lineCount: input.lineItems.length,
      }),
      insertPanels: async () => 0,
    },
  )
  assert.equal(accepted.ok, true)
  setIngestStageExpiresAtForTests(
    doomed,
    new Date(Date.now() - 1000).toISOString(),
  )
  const swept = await sweepExpiredIngestStages()
  assert.ok(swept >= 1)
  assert.equal(await getIngestStage(doomed), null)
  const retained = await getIngestStage(kept)
  assert.ok(retained)
  assert.equal(retained.masterId, 7)
})

test("Hub deep-link and chat resolve the same package after reload", async () => {
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
  simulateIngestStageModuleReloadForTests()
  const staged = await getIngestStage(stageId)
  assert.ok(staged)
  const hubSummary = summariseIngestReview(staged.review, {
    stageId,
    fileName: staged.fileName,
  })
  const chat = await getPendingIngestReviewTool.execute({}, toolCtx(stageId))
  assert.equal(chat.isError, false)
  assert.match(chat.content, new RegExp(hubSummary.detected_publisher ?? "QMS"))
  assert.match(chat.content, new RegExp(String(hubSummary.line_item_count)))
  assert.match(
    chat.content,
    new RegExp(String(hub.proposal!.reconciliation.line_item_count)),
  )
  assert.ok(hubSummary.full_review_path.includes(stageId))
})

test("clearIngestStageForTests empties overlay and durable memory", async () => {
  const id = await putIngestStage({ review: stubReview() })
  clearIngestStageForTests()
  assert.equal(await getIngestStage(id), null)
})

test("deleteIngestStage removes a live row", async () => {
  const id = await putIngestStage({ review: stubReview() })
  await deleteIngestStage(id)
  const looked = await lookupIngestStage(id)
  assert.equal(looked.ok, false)
  if (looked.ok) return
  assert.equal(looked.reason, "missing")
})
