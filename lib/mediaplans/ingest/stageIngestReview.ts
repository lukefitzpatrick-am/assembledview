/**
 * Shared review+stage path used by Hub POST /api/admin/ingest/review and AVA chat.
 * Detection stays in buildIngestReviewFromBuffer — this only stages + records.
 */

import { buildIngestReviewFromBuffer } from "@/lib/mediaplans/ingest/buildIngestReview"
import { recordIngestRun } from "@/lib/mediaplans/ingest/ingestRuns"
import { putIngestStage } from "@/lib/mediaplans/ingest/ingestStageStore"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"
import {
  summariseIngestReview,
  type IngestChatSummary,
} from "@/lib/mediaplans/ingest/summariseIngestReview"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"

export async function stageIngestReviewFromBuffer(
  buffer: Buffer,
  args: {
    fileName: string | null
    uploadedBy: string | null
    profiles: PublisherProfileConfig[]
    pinnedPublisherName?: string | null
  },
): Promise<{
  review: IngestReviewPackage
  stageId: string
  summary: IngestChatSummary
}> {
  const review = await buildIngestReviewFromBuffer(buffer, args.profiles, {
    skipAva: true,
    sourceFileName: args.fileName,
    pinnedPublisherName: args.pinnedPublisherName,
  })
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
