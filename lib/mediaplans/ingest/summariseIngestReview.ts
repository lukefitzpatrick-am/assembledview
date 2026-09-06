/**
 * Deterministic chat/Hub review summary. Numbers come from the same
 * IngestReviewPackage the Hub screen renders — never re-parsed.
 */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import { ingestParseReviewPath } from "@/lib/mediaplans/ingest/ingestParseReviewPath"
import { unresolvedDiscrepancyRows } from "@/lib/mediaplans/ingest/lineAuditReconcile"
import { countBonusLineItemsFromProposal } from "@/lib/mediaplans/ingest/stampProposalForSave"
import { evaluateTemplateCoverage } from "@/lib/mediaplans/ingest/templateCoverage"
import { isUnknownPublisherMatch } from "@/lib/mediaplans/ingest/unknownPublisher"

export const NO_PUBLISHER_PROFILE_MESSAGE =
  "There's no confirmed publisher profile for this file. Confirm the proposed mapping field by field — I won't guess the catalogue publisher."

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
  /** Rate-card column Σ (info only). */
  rate_card_total: number | null
  /** 0–1 when rate-card and stated are both known. */
  rate_card_discount_pct: number | null
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

export { ingestParseReviewPath }

export function ingestFullReviewPath(
  stageId: string,
  mbaNumber?: string | null,
): string {
  return ingestParseReviewPath(stageId, mbaNumber)
}

export function summariseIngestReview(
  review: IngestReviewPackage,
  args: { stageId: string; fileName?: string | null; mbaNumber?: string | null },
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
    rate_card_total: recon?.rate_card_total ?? null,
    rate_card_discount_pct: recon?.rate_card_discount_pct ?? null,
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
    full_review_path: ingestFullReviewPath(args.stageId, args.mbaNumber),
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

function formatDollars(n: number | null | undefined): string {
  if (n == null) return "—"
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function emptyFieldLabels(review: IngestReviewPackage | null | undefined): string[] {
  const coverage = review?.template_coverage
  if (!coverage) return []
  return [...coverage.required, ...coverage.enrich]
    .filter((f) => !f.matched)
    .map((f) => f.label)
}

function formatSectionSubtotals(review: IngestReviewPackage | null | undefined): string {
  const sections = review?.proposal?.reconciliation.section_reconciliations ?? []
  if (sections.length === 0) return "—"
  const ok = sections.filter((s) => s.ok).length
  return `${ok}/${sections.length} within 0.5%`
}

/** Compact confirmed block — numbers come only from summariseIngestReview + staged audit. */
export function formatIngestConfirmedBlock(
  summary: IngestChatSummary,
  review?: IngestReviewPackage | null,
): string {
  const pub = summary.detected_publisher ?? "Unknown publisher"
  const conf = `${Math.round(summary.publisher_confidence * 100)}%`
  const coverage = `${Math.round(summary.required_coverage * 100)}%`
  const paid = Math.max(0, summary.line_item_count - summary.bonus_line_item_count)
  const unresolved = unresolvedDiscrepancyRows(review?.line_audit)
  const green =
    review?.line_audit?.green_count ??
    (review?.line_audit?.status === "complete" ? 0 : summary.line_item_count)
  const discrepancyCount = unresolved.length
  const empty = emptyFieldLabels(review)
  const lines = [
    `Here's the parity report for this ${pub} schedule.`,
    "",
    "## Totals",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Publisher | ${pub} (${conf}) |`,
    `| Media type | ${summary.media_type ?? "—"} |`,
    `| Total line items | ${summary.line_item_count} |`,
    `| Line sum | ${formatDollars(summary.total_media_amount)} |`,
    `| Stated cell | ${formatDollars(summary.file_stated_total)} |`,
    `| Total budget | ${formatIngestBudget(summary)} |`,
  ]
  if (
    summary.rate_card_total != null &&
    summary.rate_card_total > 0 &&
    summary.rate_card_discount_pct != null
  ) {
    const rateCard = formatDollars(summary.rate_card_total)
    const disc = `${(summary.rate_card_discount_pct * 100).toFixed(1)}%`
    lines.push(`| Rate-card value | ${rateCard} · discount ${disc} |`)
  }
  lines.push(`| Section subtotals | ${formatSectionSubtotals(review)} |`)
  lines.push(
    "",
    "## Lines",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Paid / bonus | ${paid} / ${summary.bonus_line_item_count} |`,
    `| Bonus line items | ${summary.bonus_line_item_count} (of ${summary.line_item_count}) |`,
    `| Green / discrepancies | ${green} / ${discrepancyCount} |`,
    `| Lines / panels / bursts | ${summary.line_item_count} / ${summary.panel_count} / ${summary.burst_count} |`,
    `| Required coverage | ${coverage} |`,
    `| Money delta vs file total | ${formatMoneyDelta(summary)} |`,
    "",
    "## Empty fields",
    "",
    empty.length > 0 ? empty.join(" / ") : "None.",
    "",
    "## Discrepancies",
    "",
  )
  if (review?.line_audit?.status === "skipped") {
    lines.push("Audit skipped.")
  } else if (discrepancyCount === 0) {
    lines.push("None.")
  } else {
    for (const row of unresolved) {
      const items = (review?.line_audit?.discrepancies ?? []).filter((d) => d.row === row)
      const fields = [...new Set(items.map((d) => d.field))].join(", ")
      lines.push(`- r${row}: ${fields}`)
    }
  }
  if (summary.ignored_rows.length > 0) {
    lines.push("", `Excluded rows: ${summary.ignored_rows.join(" / ")}`)
  }
  lines.push("", `Open Parse Review: ${summary.full_review_path}`)
  return lines.join("\n")
}
