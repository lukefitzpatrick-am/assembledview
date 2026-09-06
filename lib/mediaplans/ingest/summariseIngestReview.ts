/**
 * Deterministic chat/Hub review summary. Numbers come from the same
 * IngestReviewPackage the Hub screen renders — never re-parsed.
 */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import { countBonusLineItemsFromProposal } from "@/lib/mediaplans/ingest/stampProposalForSave"
import { evaluateTemplateCoverage } from "@/lib/mediaplans/ingest/templateCoverage"
import { isUnknownPublisherMatch } from "@/lib/mediaplans/ingest/unknownPublisher"

export const NO_PUBLISHER_PROFILE_MESSAGE =
  "There's no publisher profile for this file. Pick the publisher on the Hub review — I won't guess."

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
  /** SF-5 all-bonus / all bonus_display lines (or sourced buy type bonus). */
  bonus_line_item_count: number
  accept_ok: boolean
  block_reason: string | null
  ignored: string[]
  /** Named leftover rows (JCD: MEDIA VALUE / DISCOUNT / CAMPAIGN SUMMARY, plus subtotals with counts). */
  ignored_rows: string[]
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
    bonus_line_item_count: review.proposal
      ? countBonusLineItemsFromProposal(
          review.proposal,
          review.template_coverage?.resolved_controlled,
        )
      : 0,
    accept_ok: unknown ? false : Boolean(recon?.accept_ok),
    block_reason: unknown
      ? NO_PUBLISHER_PROFILE_MESSAGE
      : (recon?.block_reason ?? null),
    ignored: review.ignored.spoken,
    ignored_rows: review.ignored.rows_unparsed_labels ?? [],
    columns_unmapped: review.ignored.columns_unmapped,
    unknown_publisher: unknown,
    no_profile_message: unknown ? NO_PUBLISHER_PROFILE_MESSAGE : null,
    full_review_path: ingestFullReviewPath(args.stageId),
  }
}

function formatMoneyDelta(summary: IngestChatSummary): string {
  if (summary.money_delta == null) return "—"
  const abs = Math.abs(summary.money_delta)
  const pct =
    summary.money_delta_pct != null
      ? ` (${(summary.money_delta_pct * 100).toFixed(2)}%)`
      : ""
  return `$${abs.toFixed(2)}${pct}`
}

/** Gate-reconciled file total (`file_stated_total`), else computed media. */
export function formatIngestBudget(summary: IngestChatSummary): string {
  const n = summary.file_stated_total ?? summary.total_media_amount
  if (n == null) return "—"
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Compact confirmed block — numbers come only from summariseIngestReview. */
export function formatIngestConfirmedBlock(summary: IngestChatSummary): string {
  const pub = summary.detected_publisher ?? "Unknown publisher"
  const conf = `${Math.round(summary.publisher_confidence * 100)}%`
  const coverage = `${Math.round(summary.required_coverage * 100)}%`
  const lines = [
    `Here's what this ${pub} schedule already resolved.`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Publisher | ${pub} (${conf}) |`,
    `| Media type | ${summary.media_type ?? "—"} |`,
    `| Total line items | ${summary.line_item_count} |`,
    `| Total budget | ${formatIngestBudget(summary)} |`,
    `| Bonus line items | ${summary.bonus_line_item_count} (of ${summary.line_item_count}) |`,
    `| Lines / panels / bursts | ${summary.line_item_count} / ${summary.panel_count} / ${summary.burst_count} |`,
    `| Required coverage | ${coverage} |`,
    `| Money delta vs file total | ${formatMoneyDelta(summary)} |`,
  ]
  if (summary.ignored_rows.length > 0) {
    lines.push("", `Excluded rows: ${summary.ignored_rows.join(" / ")}`)
  }
  return lines.join("\n")
}
