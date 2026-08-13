/**
 * Deterministic chat/Hub review summary. Numbers come from the same
 * IngestReviewPackage the Hub screen renders — never re-parsed.
 */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import { evaluateTemplateCoverage } from "@/lib/mediaplans/ingest/templateCoverage"
import { isUnknownPublisherMatch } from "@/lib/mediaplans/ingest/unknownPublisher"

export const NO_PUBLISHER_PROFILE_MESSAGE =
  "No publisher profile for this file. Link a catalogue publisher on the Hub ingest screen — AVA will not guess."

export type IngestChatSummary = {
  stageId: string
  fileName: string | null
  detected_publisher: string | null
  publisher_confidence: number
  media_type: string | null
  line_item_count: number
  panel_count: number
  burst_count: number
  required_coverage: number
  money_delta: number | null
  money_delta_pct: number | null
  file_stated_total: number | null
  total_media_amount: number | null
  accept_ok: boolean
  block_reason: string | null
  ignored: string[]
  columns_unmapped: string[]
  unknown_publisher: boolean
  no_profile_message: string | null
  full_review_path: string
}

export function ingestFullReviewPath(stageId: string): string {
  return `/admin/schedule-ingest?stage=${encodeURIComponent(stageId)}`
}

export function summariseIngestReview(
  review: IngestReviewPackage,
  args: { stageId: string; fileName?: string | null },
): IngestChatSummary {
  const unknown = isUnknownPublisherMatch({
    confidence: review.publisher_confidence,
  })
  const recon = review.proposal?.reconciliation
  const mediaType =
    review.proposal?.media_type ?? review.profile?.media_type ?? null
  let required_coverage = 0
  if (!unknown && mediaType) {
    try {
      const coverage = evaluateTemplateCoverage({
        mediaType,
        profile: review.profile,
        shape: null,
        proposal: review.proposal,
      })
      required_coverage =
        coverage.required_count > 0
          ? coverage.required_matched / coverage.required_count
          : coverage.completeness
    } catch {
      required_coverage = 0
    }
  }

  return {
    stageId: args.stageId,
    fileName: args.fileName ?? null,
    detected_publisher: unknown ? null : review.detected_publisher,
    publisher_confidence: review.publisher_confidence,
    media_type: unknown ? null : mediaType,
    line_item_count: recon?.line_item_count ?? 0,
    panel_count: recon?.panel_count ?? 0,
    burst_count: recon?.burst_count ?? 0,
    required_coverage,
    money_delta: recon?.delta ?? null,
    money_delta_pct: recon?.delta_pct ?? null,
    file_stated_total: recon?.file_stated_total ?? null,
    total_media_amount: recon?.total_media_amount ?? null,
    accept_ok: unknown ? false : Boolean(recon?.accept_ok),
    block_reason: unknown
      ? NO_PUBLISHER_PROFILE_MESSAGE
      : (recon?.block_reason ?? null),
    ignored: review.ignored.spoken,
    columns_unmapped: review.ignored.columns_unmapped,
    unknown_publisher: unknown,
    no_profile_message: unknown ? NO_PUBLISHER_PROFILE_MESSAGE : null,
    full_review_path: ingestFullReviewPath(args.stageId),
  }
}
