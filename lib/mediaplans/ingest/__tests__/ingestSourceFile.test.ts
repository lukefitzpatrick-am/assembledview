/**
 * IG-14 — stages keep the workbook (C-101).
 * Memory blob store only; never a live Vercel Blob call.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { auditRowsFromProposal, type LineAuditClient } from "../lineAudit"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { confirmStagedProposedProfile } from "../confirmPublisherProfile"
import {
  SOURCE_FILE_MISSING,
  clearIngestWorkbookBlobsForTests,
  ingestWorkbookBlobExistsForTests,
  ingestWorkbookPathname,
  reparseStagedIngestFromSourceFile,
  rerunStagedLineAuditFromSourceFile,
  sha256Hex,
} from "../ingestSourceFile"
import { selectLiveEvalPairs, type LiveEvalCandidate } from "../ingestEvalLive"
import { stageIngestReviewFromBuffer } from "../stageIngestReview"
import {
  clearIngestStageForTests,
  getIngestStage,
  putIngestStage,
  setIngestStageExpiresAtForTests,
  sweepExpiredIngestStages,
} from "../ingestStageStore"
import { clearLinkedProfileOverlayForTests } from "../createLinkedPublisherProfile"
import { clearPublisherProfileSeedOverlayForTests } from "../persistColumnRemap"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const QMS = path.join(FIX, "qms_strength-meals_esb-ooh.xlsx")
const JCD = path.join(FIX, "jcd_strength-meals_ooh.xlsx")
const BY = "ava@assembledmedia.com.au"

test.beforeEach(() => {
  clearIngestStageForTests()
  clearIngestWorkbookBlobsForTests()
  clearLinkedProfileOverlayForTests()
  clearPublisherProfileSeedOverlayForTests()
})

function withoutPublisher(name: string) {
  return loadSeedPublisherProfiles().filter(
    (p) => p.publisher_name.toLowerCase() !== name.toLowerCase(),
  )
}

function mockAuditClient(): LineAuditClient {
  return {
    model: "mock-audit",
    async auditChunk(request) {
      return auditRowsFromProposal({
        publisher_name: "QMS",
        media_type: "ooh",
        sheet_name: request.sheet_name,
        line_items: [],
        reconciliation: {
          line_item_count: 0,
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
      }).filter((r) => request.data_rows.includes(r.row))
    },
  }
}

test("stage stores source_file pointer with sha256 under ingest/{stageId}/{filename}", async () => {
  const buf = readFileSync(QMS)
  const { stageId, summary } = await stageIngestReviewFromBuffer(buf, {
    fileName: "qms_strength-meals_esb-ooh.xlsx",
    uploadedBy: BY,
    profiles: loadSeedPublisherProfiles(),
  })
  assert.equal(summary.source_file_retained, true)
  const got = await getIngestStage(stageId)
  assert.ok(got)
  assert.ok(got.sourceFile, "source_file missing on staged row")
  assert.equal(got.sourceFile.name, "qms_strength-meals_esb-ooh.xlsx")
  assert.equal(got.sourceFile.sha256, sha256Hex(buf))
  assert.equal(
    got.sourceFile.pathname,
    ingestWorkbookPathname(stageId, "qms_strength-meals_esb-ooh.xlsx"),
  )
  assert.match(got.sourceFile.pathname, /^ingest\//)
  assert.ok(got.sourceFile.url)
  assert.ok(got.sourceFile.size > 0)
  assert.ok(got.sourceFile.mime)
  assert.ok(got.sourceFile.uploadedAt)
  assert.equal(
    ingestWorkbookBlobExistsForTests(got.sourceFile.pathname),
    true,
  )
})

test("putIngestWorkbook throw still creates the stage with sourceFile null and one warn", async () => {
  const warns: unknown[][] = []
  const origWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warns.push(args)
  }
  try {
    const { stageId, summary } = await stageIngestReviewFromBuffer(
      readFileSync(QMS),
      {
        fileName: "qms.xlsx",
        uploadedBy: BY,
        profiles: loadSeedPublisherProfiles(),
        putWorkbook: async () => {
          throw new Error(
            "Vercel Blob: No blob credentials found. Pass a `token` option, set `BLOB_READ_WRITE_TOKEN`, or use `oidcToken` (or `VERCEL_OIDC_TOKEN`) with `storeId` or `BLOB_STORE_ID`.",
          )
        },
      },
    )
    const got = await getIngestStage(stageId)
    assert.ok(got, "stage must still be created")
    assert.equal(got.sourceFile, null)
    assert.equal(summary.source_file_retained, false)
    assert.equal(warns.length, 1, "one warn logged")
    assert.match(String(warns[0][0]), /workbook not retained/)
    assert.ok(
      String(warns[0][0]).includes(stageId),
      "warn names the stage id",
    )
  } finally {
    console.warn = origWarn
  }
})

test("re-run audit without upload returns ok when source_file is present", async () => {
  const buf = readFileSync(QMS)
  const staged = await stageIngestReviewFromBuffer(buf, {
    fileName: "qms.xlsx",
    uploadedBy: BY,
    profiles: loadSeedPublisherProfiles(),
    lineAuditClient: mockAuditClient(),
  })
  const result = await rerunStagedLineAuditFromSourceFile({
    stageId: staged.stageId,
    profiles: loadSeedPublisherProfiles(),
    lineAuditClient: mockAuditClient(),
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.status, 200)
  assert.ok(result.review)
})

test("re-run audit 409s only when source_file is null", async () => {
  const id = await putIngestStage({
    review: (
      await stageIngestReviewFromBuffer(readFileSync(QMS), {
        fileName: "qms.xlsx",
        uploadedBy: BY,
        profiles: loadSeedPublisherProfiles(),
      })
    ).review,
    fileName: "legacy.xlsx",
    uploadedBy: BY,
  })
  const legacy = await getIngestStage(id)
  assert.ok(legacy)
  assert.equal(legacy.sourceFile, null)
  const result = await rerunStagedLineAuditFromSourceFile({
    stageId: id,
    profiles: loadSeedPublisherProfiles(),
    lineAuditClient: mockAuditClient(),
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /workbook was not retained for this stage/i)
  assert.equal(result.code, SOURCE_FILE_MISSING)
})

test("Confirm without upload reparses from source_file", async () => {
  const buf = readFileSync(JCD)
  const staged = await stageIngestReviewFromBuffer(buf, {
    fileName: "jcd_strength-meals_ooh.xlsx",
    uploadedBy: BY,
    profiles: withoutPublisher("JCDecaux"),
  })
  assert.ok(staged.review.proposed_profile)
  const confirmed = await confirmStagedProposedProfile({
    stageId: staged.stageId,
    confirmedBy: BY,
    catalogue: {
      id: 99,
      publisher_name: "Nova Outdoor",
      pub_ooh: true,
      pub_radio: false,
    },
    profiles: withoutPublisher("JCDecaux"),
  })
  assert.equal(confirmed.ok, true)
  if (!confirmed.ok) return
  assert.equal(confirmed.status, 200)
  assert.equal(confirmed.profile.publisher_name, "Nova Outdoor")
  assert.equal(confirmed.review.proposed_profile, undefined)
  assert.ok((confirmed.review.proposal?.line_items.length ?? 0) > 0)
  const same = await getIngestStage(staged.stageId)
  assert.ok(same?.sourceFile)
  assert.equal(same.stageId, staged.stageId)
})

test("Confirm 409s when source_file is null", async () => {
  const buf = readFileSync(JCD)
  const staged = await stageIngestReviewFromBuffer(buf, {
    fileName: "jcd.xlsx",
    uploadedBy: BY,
    profiles: withoutPublisher("JCDecaux"),
  })
  const id = await putIngestStage({
    review: staged.review,
    fileName: "jcd.xlsx",
    uploadedBy: BY,
  })
  const confirmed = await confirmStagedProposedProfile({
    stageId: id,
    confirmedBy: BY,
    catalogue: {
      id: 99,
      publisher_name: "Nova Outdoor",
      pub_ooh: true,
      pub_radio: false,
    },
    profiles: withoutPublisher("JCDecaux"),
  })
  assert.equal(confirmed.ok, false)
  if (confirmed.ok) return
  assert.equal(confirmed.status, 409)
  assert.equal(confirmed.code, SOURCE_FILE_MISSING)
  assert.match(confirmed.error, /workbook was not retained for this stage/i)
})

test("deterministic re-parse reads the workbook from source_file", async () => {
  const buf = readFileSync(QMS)
  const staged = await stageIngestReviewFromBuffer(buf, {
    fileName: "qms.xlsx",
    uploadedBy: BY,
    profiles: loadSeedPublisherProfiles(),
  })
  const result = await reparseStagedIngestFromSourceFile({
    stageId: staged.stageId,
    profiles: loadSeedPublisherProfiles(),
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.review.detected_publisher, "QMS")
  assert.ok((result.review.proposal?.line_items.length ?? 0) > 0)
})

test("expired stage deletes the Blob with the row", async () => {
  const buf = readFileSync(QMS)
  const { stageId } = await stageIngestReviewFromBuffer(buf, {
    fileName: "qms.xlsx",
    uploadedBy: BY,
    profiles: loadSeedPublisherProfiles(),
  })
  const live = await getIngestStage(stageId)
  assert.ok(live?.sourceFile)
  const pathname = live.sourceFile.pathname
  assert.equal(ingestWorkbookBlobExistsForTests(pathname), true)
  setIngestStageExpiresAtForTests(
    stageId,
    new Date(Date.now() - 1000).toISOString(),
  )
  const swept = await sweepExpiredIngestStages()
  assert.ok(swept >= 1)
  assert.equal(await getIngestStage(stageId), null)
  assert.equal(ingestWorkbookBlobExistsForTests(pathname), false)
})

test("selectLiveEvalPairs keeps later published versions and dedupes sha256 per plan", () => {
  const sha = "abc123"
  const file = {
    url: "https://blob.test/ingest/s1/a.xlsx",
    pathname: "ingest/s1/a.xlsx",
    name: "a.xlsx",
    size: 10,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    uploadedAt: "2026-09-07T00:00:00.000Z",
    sha256: sha,
  }
  const rows: LiveEvalCandidate[] = [
    {
      stageId: "stage-accepted",
      masterId: 8,
      acceptedVersionId: 100,
      acceptedVersionNumber: 6,
      publishedVersionId: 110,
      publishedVersionNumber: 7,
      sourceFile: file,
      publisher: "JCDecaux",
      fileName: "a.xlsx",
    },
    {
      stageId: "stage-dup",
      masterId: 8,
      acceptedVersionId: 101,
      acceptedVersionNumber: 6,
      publishedVersionId: 110,
      publishedVersionNumber: 7,
      sourceFile: { ...file, pathname: "ingest/s2/a.xlsx" },
      publisher: "JCDecaux",
      fileName: "a.xlsx",
    },
    {
      stageId: "stage-pre-ig14",
      masterId: 8,
      acceptedVersionId: 100,
      acceptedVersionNumber: 6,
      publishedVersionId: 110,
      publishedVersionNumber: 7,
      sourceFile: null,
      publisher: "JCDecaux",
      fileName: "old.xlsx",
    },
    {
      stageId: "stage-other-plan",
      masterId: 9,
      acceptedVersionId: 200,
      acceptedVersionNumber: 1,
      publishedVersionId: 200,
      publishedVersionNumber: 1,
      sourceFile: { ...file, sha256: sha },
      publisher: "JCDecaux",
      fileName: "a.xlsx",
    },
  ]
  const pairs = selectLiveEvalPairs(rows)
  assert.equal(pairs.length, 2)
  assert.ok(pairs.some((p) => p.masterId === 8 && p.publishedVersionId === 110))
  assert.ok(pairs.some((p) => p.masterId === 9))
  assert.equal(pairs.filter((p) => p.masterId === 8).length, 1)
})

test("selectLiveEvalPairs drops a stage whose published pointer is older than accepted", () => {
  const pairs = selectLiveEvalPairs([
    {
      stageId: "stage-stale",
      masterId: 1,
      acceptedVersionId: 20,
      acceptedVersionNumber: 5,
      publishedVersionId: 10,
      publishedVersionNumber: 3,
      sourceFile: {
        url: "https://blob.test/x",
        pathname: "ingest/x/a.xlsx",
        name: "a.xlsx",
        size: 1,
        mime: "application/octet-stream",
        uploadedAt: "2026-09-07T00:00:00.000Z",
        sha256: "dead",
      },
      publisher: "QMS",
      fileName: "a.xlsx",
    },
  ])
  assert.equal(pairs.length, 0)
})
