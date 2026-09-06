/**
 * Presentation helpers for the Parse Review page. Numbers come from
 * summariseIngestReview + parseReviewCounts — never re-summed here.
 */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  datesFromProposedLine,
  identityFromProposedLine,
  moneyAmountFromProposedLine,
  sourceRowNumber,
} from "@/lib/mediaplans/ingest/lineAudit"
import {
  discrepanciesForRow,
  unresolvedDiscrepancyRows,
} from "@/lib/mediaplans/ingest/lineAuditReconcile"
import {
  isConfirmedRow,
  isExcludedRow,
  isGreenUnconfirmed,
  leftoverExcludedLegend,
  parseReviewCounts,
  proposedSourceRows,
  rowHasUnresolvedValue,
  rowNeedsDecision,
  siblingRowsForValue,
  unresolvedValuesForRow,
  itemForSourceRow,
} from "@/lib/mediaplans/ingest/parseReview"
import { countBonusLineItemsFromProposal } from "@/lib/mediaplans/ingest/stampProposalForSave"
import type { ProposedLineItem } from "@/lib/mediaplans/ingest/proposeLineItems"

export type ParseReviewFilter =
  | "all"
  | "needs_decision"
  | "green_unconfirmed"
  | "bonus"
  | "excluded"

export function formatParseReviewMoney(n: number | null | undefined): string {
  if (n == null) return "—"
  return `$${n.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function isBonusProposedLine(item: ProposedLineItem): boolean {
  if (item.bursts.length === 0) return false
  return item.bursts.every((b) => b.booking_status === "bonus")
}

export function sectionRowsForReview(review: IngestReviewPackage): Array<{
  section: string
  lines: number
  media: number
}> {
  const groups = new Map<string, { lines: number; media: number }>()
  for (const item of review.proposal?.line_items ?? []) {
    const row = sourceRowNumber(item.panels[0]?.source_row_ref)
    if (row != null && isExcludedRow(review, row)) continue
    const section =
      item.grouping.publisher_format_name?.trim() ||
      item.grouping.format?.trim() ||
      "Unsectioned"
    const prev = groups.get(section) ?? { lines: 0, media: 0 }
    prev.lines += 1
    prev.media += moneyAmountFromProposedLine(item)
    groups.set(section, prev)
  }
  return [...groups.entries()].map(([section, v]) => ({
    section,
    lines: v.lines,
    media: Math.round(v.media * 100) / 100,
  }))
}

export function paidBonusSplit(review: IngestReviewPackage): {
  paid: number
  bonus: number
} {
  const bonus = review.proposal
    ? countBonusLineItemsFromProposal(
        review.proposal,
        review.template_coverage?.resolved_controlled,
      )
    : 0
  const proposed = parseReviewCounts(review).proposed
  return { paid: Math.max(0, proposed - bonus), bonus }
}

export function occupancyScanCopy(review: IngestReviewPackage): string {
  const occupancy = review.proposal?.reconciliation.line_item_count ?? 0
  const leftover = review.ignored.rows_unparsed_labels?.length ?? 0
  return `${occupancy} proposed · ${leftover} excluded (named)`
}

export type ParseReviewRowView = {
  row: number
  leftover?: boolean
  leftoverLabel?: string
  fileSays: string
  fileDetail: string
  proposed: string
  proposedDetail: string
  moneyLabel: string
  parserVsAudit: "agree" | "disagree" | "—"
  parserVsAuditWhy: string
  state:
    | "confirmed"
    | "excluded"
    | "green_unconfirmed"
    | "decide"
    | "value_card"
    | "waits"
  valueCanonicalHint: string | null
  siblingCount: number
}

function datesLabel(item: ProposedLineItem): string {
  const dates = datesFromProposedLine(item)
  if (dates.length === 0) return "no dates"
  return dates
    .map((d) => [d.from, d.to].filter(Boolean).join("–") || "—")
    .join(" · ")
}

export function parseReviewRowViews(
  review: IngestReviewPackage,
): ParseReviewRowView[] {
  const out: ParseReviewRowView[] = []
  const open = new Set(unresolvedDiscrepancyRows(review.line_audit))
  for (const row of proposedSourceRows(review)) {
    const item = itemForSourceRow(review, row)
    if (!item) continue
    const ident = identityFromProposedLine(item)
    const auditRow = review.line_audit?.rows.find((r) => r.row === row) ?? null
    const discs = discrepanciesForRow(review.line_audit, row)
    const unresolved = unresolvedValuesForRow(review, row)
    const money = moneyAmountFromProposedLine(item)
    let state: ParseReviewRowView["state"] = "green_unconfirmed"
    if (isExcludedRow(review, row)) state = "excluded"
    else if (isConfirmedRow(review, row)) state = "confirmed"
    else if (unresolved.length > 0) {
      state = rowNeedsDecision(review, row) ? "value_card" : "waits"
    } else if (open.has(row) || discs.length > 0) state = "decide"
    else if (isGreenUnconfirmed(review, row)) state = "green_unconfirmed"

    const siblingCount =
      unresolved[0] != null
        ? siblingRowsForValue(review, unresolved[0]).length
        : 0

    out.push({
      row,
      fileSays:
        [ident.panel, ident.name].filter(Boolean).join(" · ") || `r${row}`,
      fileDetail: [
        ident.market,
        ident.section,
        auditRow?.format_header,
      ]
        .filter(Boolean)
        .join(" · "),
      proposed: [ident.market, ident.section, ident.name]
        .filter(Boolean)
        .join(" · "),
      proposedDetail: `${datesLabel(item)}${
        isBonusProposedLine(item) ? " · bonus" : ""
      }`,
      moneyLabel: formatParseReviewMoney(money),
      parserVsAudit: open.has(row) || discs.some((d) => d.field !== "invariant")
        ? "disagree"
        : "agree",
      parserVsAuditWhy:
        discs
          .map((d) =>
            d.field === "invariant"
              ? `invariant: ${d.rule ?? "breach"}`
              : d.field,
          )
          .join(" · ") ||
        (auditRow?.money.cell ? `money ${auditRow.money.cell}` : ""),
      state,
      valueCanonicalHint: unresolved[0]?.raw ?? null,
      siblingCount,
    })
  }
  return out
}

export function leftoverRowViews(review: IngestReviewPackage): ParseReviewRowView[] {
  const labels = review.ignored.rows_unparsed_labels ?? []
  return labels.map((label, i) => ({
    row: -(i + 1),
    leftover: true,
    leftoverLabel: label,
    fileSays: label,
    fileDetail: leftoverExcludedLegend(review),
    proposed: "excluded · leftover row",
    proposedDetail: "",
    moneyLabel: "—",
    parserVsAudit: "—",
    parserVsAuditWhy: "no identity and no legend status",
    state: "excluded",
    valueCanonicalHint: null,
    siblingCount: 0,
  }))
}

export function filterParseReviewRows(
  rows: ParseReviewRowView[],
  filter: ParseReviewFilter,
  review: IngestReviewPackage,
): ParseReviewRowView[] {
  switch (filter) {
    case "needs_decision":
      return rows.filter(
        (r) =>
          !r.leftover &&
          (r.state === "decide" || r.state === "value_card" || r.state === "waits"),
      )
    case "green_unconfirmed":
      return rows.filter((r) => r.state === "green_unconfirmed")
    case "bonus":
      return rows.filter((r) => {
        if (r.leftover) return false
        const item = itemForSourceRow(review, r.row)
        return item ? isBonusProposedLine(item) : false
      })
    case "excluded":
      return [
        ...rows.filter((r) => r.state === "excluded" && !r.leftover),
        ...leftoverRowViews(review),
      ]
    default:
      return rows
  }
}

export function rowHasUnresolvedValueOn(
  review: IngestReviewPackage,
  row: number,
): boolean {
  return rowHasUnresolvedValue(review, row)
}
