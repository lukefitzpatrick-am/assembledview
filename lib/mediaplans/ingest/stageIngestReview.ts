/**
 * Shared review+stage path used by Hub POST /api/admin/ingest/review and AVA chat.
 * Detection stays in buildIngestReviewFromBuffer — this only stages + records.
 */

import { buildIngestReviewWithPrimary } from "@/lib/mediaplans/ingest/buildIngestReview"
import { recordIngestRun } from "@/lib/mediaplans/ingest/ingestRuns"
import { putIngestStage } from "@/lib/mediaplans/ingest/ingestStageStore"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"
import {
  summariseIngestReview,
  type IngestChatSummary,
} from "@/lib/mediaplans/ingest/summariseIngestReview"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  runLineAudit,
  skippedLineAudit,
  type LineAuditClient,
} from "@/lib/mediaplans/ingest/lineAudit"

export async function stageIngestReviewFromBuffer(
  buffer: Buffer,
  args: {
    fileName: string | null
    uploadedBy: string | null
    profiles: PublisherProfileConfig[]
    pinnedPublisherName?: string | null
    /** Injectable audit client (tests). Production review route passes Anthropic. */
    lineAuditClient?: LineAuditClient | null
  },
): Promise<{
  review: IngestReviewPackage
  stageId: string
  summary: IngestChatSummary
}> {
  const { review: built, primary } = await buildIngestReviewWithPrimary(
    buffer,
    args.profiles,
    {
      skipAva: true,
      sourceFileName: args.fileName,
      pinnedPublisherName: args.pinnedPublisherName,
    },
  )
  let review = built
  if (review.line_audit?.status !== "complete") {
    if (!primary || !review.proposal) {
      review = {
        ...review,
        line_audit: skippedLineAudit("no proposal"),
      }
    } else if (!args.lineAuditClient) {
      review = {
        ...review,
        line_audit: skippedLineAudit("no audit client"),
      }
    } else {
      review = {
        ...review,
        line_audit: await runLineAudit({
          shape: primary,
          proposal: review.proposal,
          client: args.lineAuditClient,
        }),
      }
    }
  }
  const stageId = await putIngestStage({
    review,
    fileName: args.fileName,
    uploadedBy: args.uploadedBy,
  })
  const summary = summariseIngestReview(review, {
    stageId,
    fileName: args.fileName,
  })
  if (summary.unknown_publisher) {
    await recordIngestRun({
      publisherId: null,
      publisherName: null,
      fileName: args.fileName,
      uploadedBy: args.uploadedBy,
      detectedConfidence: review.publisher_confidence,
      requiredCoverage: summary.required_coverage,
      lineItemCount: 0,
      panelCount: 0,
      burstCount: 0,
      moneyDelta: null,
      outcome: "blocked",
      outcomeReason: "No publisher profile",
      acceptedVersionId: null,
    })
  }
  return { review, stageId, summary }
}
