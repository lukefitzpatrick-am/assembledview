/**
 * Re-parse / re-run audit from the staged workbook pointer (IG-14).
 * 409 SOURCE_FILE_MISSING when source_file is null (Blob retain failed
 * or a pre-IG-14 stage).
 */
import { buildIngestReviewWithPrimary } from "@/lib/mediaplans/ingest/buildIngestReview"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  getIngestStage,
  lookupIngestStage,
  patchIngestStageReview,
} from "@/lib/mediaplans/ingest/ingestStageStore"
import {
  getIngestWorkbookBuffer,
} from "@/lib/mediaplans/ingest/ingestWorkbookBlob"
import {
  runLineAudit,
  skippedLineAudit,
  type LineAuditClient,
} from "@/lib/mediaplans/ingest/lineAudit"
import { reconcileLineAudit } from "@/lib/mediaplans/ingest/lineAuditReconcile"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"

export {
  INGEST_XLSX_MIME,
  clearIngestWorkbookBlobsForTests,
  deleteIngestWorkbook,
  getIngestWorkbookBuffer,
  ingestWorkbookBlobExistsForTests,
  ingestWorkbookPathname,
  parseIngestSourceFile,
  putIngestWorkbook,
  sha256Hex,
  type IngestSourceFile,
} from "@/lib/mediaplans/ingest/ingestWorkbookBlob"

export const SOURCE_FILE_MISSING = "SOURCE_FILE_MISSING"

export type SourceFileMissingResult = {
  ok: false
  status: 409
  code: typeof SOURCE_FILE_MISSING
  error: string
}

export const SOURCE_FILE_MISSING_ERROR =
  "The workbook was not retained for this stage. Re-upload the file."

function missingSourceFile(): SourceFileMissingResult {
  return {
    ok: false,
    status: 409,
    code: SOURCE_FILE_MISSING,
    error: SOURCE_FILE_MISSING_ERROR,
  }
}

async function loadWorkbookOrMissing(stageId: string): Promise<
  | { ok: true; buffer: Buffer; fileName: string | null }
  | SourceFileMissingResult
  | { ok: false; status: 404; error: string }
> {
  const looked = await lookupIngestStage(stageId)
  if (!looked.ok) {
    return { ok: false, status: 404, error: "Staged ingest not found" }
  }
  const sourceFile = looked.staged.sourceFile
  if (!sourceFile) return missingSourceFile()
  const buffer = await getIngestWorkbookBuffer(sourceFile)
  if (!buffer) return missingSourceFile()
  return {
    ok: true,
    buffer,
    fileName: sourceFile.name ?? looked.staged.fileName,
  }
}

export async function reparseStagedIngestFromSourceFile(args: {
  stageId: string
  profiles: PublisherProfileConfig[]
  pinnedPublisherName?: string | null
  lineAuditClient?: LineAuditClient | null
  mbaNumber?: string | null
}): Promise<
  | { ok: true; review: IngestReviewPackage }
  | SourceFileMissingResult
  | { ok: false; status: 404; error: string }
> {
  const loaded = await loadWorkbookOrMissing(args.stageId)
  if (!loaded.ok) return loaded
  const { review: built, primary } = await buildIngestReviewWithPrimary(
    loaded.buffer,
    args.profiles,
    {
      skipAva: true,
      sourceFileName: loaded.fileName,
      pinnedPublisherName: args.pinnedPublisherName,
    },
  )
  let review = built
  if (review.line_audit?.status !== "complete") {
    if (!primary || !review.proposal) {
      review = { ...review, line_audit: skippedLineAudit("no proposal") }
    } else if (!args.lineAuditClient) {
      review = { ...review, line_audit: skippedLineAudit("no audit client") }
    } else {
      review = {
        ...review,
        line_audit: reconcileLineAudit(
          review.proposal,
          await runLineAudit({
            shape: primary,
            proposal: review.proposal,
            client: args.lineAuditClient,
          }),
        ),
      }
    }
  }
  await patchIngestStageReview(args.stageId, review)
  return { ok: true, review }
}

export async function rerunStagedLineAuditFromSourceFile(args: {
  stageId: string
  profiles: PublisherProfileConfig[]
  lineAuditClient?: LineAuditClient | null
}): Promise<
  | { ok: true; status: 200; review: IngestReviewPackage }
  | SourceFileMissingResult
  | { ok: false; status: 404; error: string }
> {
  const staged = await getIngestStage(args.stageId)
  if (!staged) {
    return { ok: false, status: 404, error: "Staged ingest not found" }
  }
  const loaded = await loadWorkbookOrMissing(args.stageId)
  if (!loaded.ok) return loaded
  if (!staged.review.proposal) {
    const skipped = {
      ...staged.review,
      line_audit: skippedLineAudit("no proposal"),
    }
    await patchIngestStageReview(args.stageId, skipped)
    return { ok: true, status: 200, review: skipped }
  }
  if (!args.lineAuditClient) {
    const skipped = {
      ...staged.review,
      line_audit: skippedLineAudit("no audit client"),
    }
    await patchIngestStageReview(args.stageId, skipped)
    return { ok: true, status: 200, review: skipped }
  }
  const { primary } = await buildIngestReviewWithPrimary(
    loaded.buffer,
    args.profiles,
    {
      skipAva: true,
      sourceFileName: loaded.fileName,
      pinnedPublisherName: staged.review.detected_publisher,
    },
  )
  if (!primary) {
    const skipped = {
      ...staged.review,
      line_audit: skippedLineAudit("no proposal"),
    }
    await patchIngestStageReview(args.stageId, skipped)
    return { ok: true, status: 200, review: skipped }
  }
  const review: IngestReviewPackage = {
    ...staged.review,
    line_audit: reconcileLineAudit(
      staged.review.proposal,
      await runLineAudit({
        shape: primary,
        proposal: staged.review.proposal,
        client: args.lineAuditClient,
      }),
    ),
  }
  await patchIngestStageReview(args.stageId, review)
  return { ok: true, status: 200, review }
}
