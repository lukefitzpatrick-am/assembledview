/**
 * Parse Review — per-row decisions on the staged package (IG-11).
 * Nested jsonb on ingest_stages.review_package. No new table.
 */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import { getControlledVocabulary } from "@/lib/mediaplans/ingest/controlledVocabularies"
import {
  discrepanciesForRow,
  recordDiscrepancyResolution,
  unresolvedDiscrepancyRows,
  type CampaignWindow,
} from "@/lib/mediaplans/ingest/lineAuditReconcile"
import { sourceRowNumber } from "@/lib/mediaplans/ingest/lineAudit"
import type { ProposedLineItem } from "@/lib/mediaplans/ingest/proposeLineItems"
import { getTargetTemplate } from "@/lib/mediaplans/ingest/targetTemplates"
import {
  applyCanonicalControlledValue,
  publisherRawFieldFor,
  type UnresolvedControlledValue,
} from "@/lib/mediaplans/ingest/templateCoverage"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"

export const PARSE_REVIEW_LOAD_REFUSE =
  "lines still need confirm or exclude. Nothing was written."

export const FIELD_OVERRIDE_FILE_THRESHOLD = 3

export type ParseReviewDecisionStatus = "confirmed" | "excluded"

export type ParseReviewRowDecision = {
  status: ParseReviewDecisionStatus
  by: string
  at: string
  note?: string | null
}

export type ParseReviewOverrideProposal = {
  publisher_name: string
  header: string
  mapped_to: string
  file_names: string[]
  proposed_at: string
  applied: boolean
}

export type ParseReviewCampaignWindow = CampaignWindow

export type ParseReviewState = {
  decisions: Record<string, ParseReviewRowDecision>
  campaign_window?: ParseReviewCampaignWindow | null
  override_proposals?: ParseReviewOverrideProposal[]
  override_tally?: Record<string, string[]>
}

export function parseReviewRowKey(row: number): string {
  return `r${row}`
}

export function emptyParseReview(): ParseReviewState {
  return { decisions: {} }
}

export function parseReviewOf(review: IngestReviewPackage): ParseReviewState {
  const raw = review.parse_review
  if (!raw || typeof raw !== "object") return emptyParseReview()
  return {
    decisions: { ...(raw.decisions ?? {}) },
    campaign_window: raw.campaign_window ?? null,
    override_proposals: raw.override_proposals ? [...raw.override_proposals] : [],
    override_tally: raw.override_tally ? { ...raw.override_tally } : {},
  }
}

function headerKey(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase()
}

export function proposedSourceRows(review: IngestReviewPackage): number[] {
  const rows: number[] = []
  for (const item of review.proposal?.line_items ?? []) {
    const row = sourceRowNumber(item.panels[0]?.source_row_ref)
    if (row != null) rows.push(row)
  }
  return rows
}

export function itemForSourceRow(
  review: IngestReviewPackage,
  row: number,
): ProposedLineItem | null {
  for (const item of review.proposal?.line_items ?? []) {
    if (sourceRowNumber(item.panels[0]?.source_row_ref) === row) return item
  }
  return null
}

function groupingOrDescriptor(
  item: ProposedLineItem,
  fieldId: string,
): string {
  const fromGroup = item.grouping[fieldId]
  if (typeof fromGroup === "string" && fromGroup.trim()) return fromGroup
  for (const panel of item.panels) {
    const v = panel.descriptors[fieldId]
    if (typeof v === "string" && v.trim()) return v
  }
  return ""
}

export function unresolvedValuesForRow(
  review: IngestReviewPackage,
  row: number,
): UnresolvedControlledValue[] {
  const item = itemForSourceRow(review, row)
  if (!item) return []
  const unresolved = review.template_coverage?.unresolved_controlled ?? []
  return unresolved.filter((u) => {
    const raw = headerKey(u.raw)
    const onLine = headerKey(groupingOrDescriptor(item, u.fieldId))
    const formatRaw = headerKey(
      item.grouping.publisher_format_name ?? item.grouping.format ?? "",
    )
    return onLine === raw || formatRaw === raw
  })
}

export function rowHasUnresolvedValue(
  review: IngestReviewPackage,
  row: number,
): boolean {
  return unresolvedValuesForRow(review, row).length > 0
}

export function rowHasDisagreement(review: IngestReviewPackage, row: number): boolean {
  return unresolvedDiscrepancyRows(review.line_audit).includes(row)
}

export function rowHasInvariantBreach(
  review: IngestReviewPackage,
  row: number,
): boolean {
  return discrepanciesForRow(review.line_audit, row).some((d) => d.field === "invariant")
}

export function isGreenRow(review: IngestReviewPackage, row: number): boolean {
  if (rowHasDisagreement(review, row)) return false
  if (rowHasInvariantBreach(review, row)) return false
  if (rowHasUnresolvedValue(review, row)) return false
  return true
}

export function decisionForRow(
  review: IngestReviewPackage,
  row: number,
): ParseReviewRowDecision | null {
  return parseReviewOf(review).decisions[parseReviewRowKey(row)] ?? null
}

export function isExcludedRow(review: IngestReviewPackage, row: number): boolean {
  return decisionForRow(review, row)?.status === "excluded"
}

export function isConfirmedRow(review: IngestReviewPackage, row: number): boolean {
  return decisionForRow(review, row)?.status === "confirmed"
}

export function isGreenUnconfirmed(
  review: IngestReviewPackage,
  row: number,
): boolean {
  if (isExcludedRow(review, row) || isConfirmedRow(review, row)) return false
  return isGreenRow(review, row)
}

export function rowNeedsDecision(
  review: IngestReviewPackage,
  row: number,
): boolean {
  if (isExcludedRow(review, row) || isConfirmedRow(review, row)) return false
  return !isGreenRow(review, row)
}

export function recordRowDecision(args: {
  review: IngestReviewPackage
  row: number
  status: ParseReviewDecisionStatus
  by: string
  note?: string | null
  force?: boolean
}): IngestReviewPackage {
  const state = parseReviewOf(args.review)
  const key = parseReviewRowKey(args.row)
  if (
    args.status === "confirmed" &&
    !args.force &&
    rowNeedsDecision(args.review, args.row)
  ) {
    return args.review
  }
  state.decisions[key] = {
    status: args.status,
    by: args.by,
    at: new Date().toISOString(),
    note: args.note ?? null,
  }
  return { ...args.review, parse_review: state }
}

export function includeExcludedRow(args: {
  review: IngestReviewPackage
  row: number
  by: string
}): IngestReviewPackage {
  const state = parseReviewOf(args.review)
  const key = parseReviewRowKey(args.row)
  const next = { ...state.decisions }
  delete next[key]
  return {
    ...args.review,
    parse_review: { ...state, decisions: next },
  }
}

export function confirmAllGreen(args: {
  review: IngestReviewPackage
  by: string
}): IngestReviewPackage {
  let next = args.review
  for (const row of proposedSourceRows(args.review)) {
    if (!isGreenUnconfirmed(next, row)) continue
    next = recordRowDecision({
      review: next,
      row,
      status: "confirmed",
      by: args.by,
    })
  }
  return next
}

export function excludedProposedRows(review: IngestReviewPackage): number[] {
  return proposedSourceRows(review).filter((row) => isExcludedRow(review, row))
}

export function unconfirmedProposedRows(review: IngestReviewPackage): number[] {
  return proposedSourceRows(review).filter(
    (row) => !isConfirmedRow(review, row) && !isExcludedRow(review, row),
  )
}

export function parseReviewCounts(review: IngestReviewPackage): {
  proposed: number
  confirmed: number
  excluded: number
  green_unconfirmed: number
  needs_decision: number
  leftover_excluded: number
} {
  const proposed = proposedSourceRows(review)
  let confirmed = 0
  let excluded = 0
  let green_unconfirmed = 0
  let needs_decision = 0
  for (const row of proposed) {
    if (isConfirmedRow(review, row)) confirmed++
    else if (isExcludedRow(review, row)) excluded++
    else if (isGreenUnconfirmed(review, row)) green_unconfirmed++
    else needs_decision++
  }
  return {
    proposed: proposed.length,
    confirmed,
    excluded,
    green_unconfirmed,
    needs_decision,
    leftover_excluded: review.ignored.rows_unparsed_labels?.length ?? 0,
  }
}

export function parseReviewLoadRefuseMessage(count: number): string {
  if (count === 1) {
    return `1 line still needs confirm or exclude. Nothing was written.`
  }
  return `${count} ${PARSE_REVIEW_LOAD_REFUSE}`
}

export function parseReviewLoadGate(
  review: IngestReviewPackage,
): { ok: true } | { ok: false; reason: string; count: number } {
  const open = unresolvedDiscrepancyRows(review.line_audit)
  if (open.length > 0) {
    return {
      ok: false,
      count: open.length,
      reason:
        open.length === 1
          ? "1 line discrepancy is still open. Nothing was written."
          : `${open.length} line discrepancies are still open. Nothing was written.`,
    }
  }
  const pending = unconfirmedProposedRows(review)
  if (pending.length > 0) {
    return {
      ok: false,
      count: pending.length,
      reason: parseReviewLoadRefuseMessage(pending.length),
    }
  }
  return { ok: true }
}

export function siblingRowsForValue(
  review: IngestReviewPackage,
  unresolved: UnresolvedControlledValue,
): number[] {
  const raw = headerKey(unresolved.raw)
  return proposedSourceRows(review).filter((row) => {
    const item = itemForSourceRow(review, row)
    if (!item) return false
    const onLine = headerKey(groupingOrDescriptor(item, unresolved.fieldId))
    const formatRaw = headerKey(
      item.grouping.publisher_format_name ?? item.grouping.format ?? "",
    )
    return onLine === raw || formatRaw === raw
  })
}

function applyControlledValueToReview(
  review: IngestReviewPackage,
  unresolved: UnresolvedControlledValue,
  canonical: string,
): IngestReviewPackage {
  const raw = headerKey(unresolved.raw)
  const mediaType =
    review.template_coverage?.media_type ||
    review.detected_media_type ||
    "ooh"
  const template = getTargetTemplate(mediaType)
  const nextProposal = review.proposal
    ? applyCanonicalControlledValue(review.proposal, {
        fieldId: unresolved.fieldId,
        raw: unresolved.raw,
        canonical,
        publisherRawField: publisherRawFieldFor(template, unresolved.fieldId),
      })
    : review.proposal
  const coverage = review.template_coverage
  const resolvedRow = {
    fieldId: unresolved.fieldId,
    raw: unresolved.raw,
    canonical,
    via: "publisher_synonym",
  }
  return {
    ...review,
    proposal: nextProposal,
    template_coverage: coverage
      ? {
          ...coverage,
          unresolved_controlled: (coverage.unresolved_controlled ?? []).filter(
            (item) =>
              !(
                item.fieldId === unresolved.fieldId &&
                headerKey(item.raw) === raw
              ),
          ),
          resolved_controlled: [
            ...(coverage.resolved_controlled ?? []).filter(
              (item) =>
                !(
                  item.fieldId === unresolved.fieldId &&
                  headerKey(item.raw) === raw
                ),
            ),
            resolvedRow,
          ],
        }
      : coverage,
  }
}

export function resolveParseReviewDiscrepancy(args: {
  review: IngestReviewPackage
  row: number
  answer: string
  by: string
}): IngestReviewPackage {
  const resolved = recordDiscrepancyResolution({
    review: args.review,
    row: args.row,
    answer: args.answer,
    by: args.by,
  })
  return recordRowDecision({
    review: resolved,
    row: args.row,
    status: "confirmed",
    by: args.by,
    note: `discrepancy:${args.answer}`,
    force: true,
  })
}

export async function resolveParseReviewValue(args: {
  review: IngestReviewPackage
  row: number
  answer: string
  by: string
  stageId: string
}): Promise<{
  review: IngestReviewPackage
  resolvedRows: number[]
  canonical: string
  synonymWritten: boolean
}> {
  const unresolved = unresolvedValuesForRow(args.review, args.row)[0]
  if (!unresolved) {
    return {
      review: args.review,
      resolvedRows: [],
      canonical: "",
      synonymWritten: false,
    }
  }
  const vocab = getControlledVocabulary(unresolved.vocabulary)
  const chosen = args.answer.trim()
  const canonical =
    (vocab ? vocab.exact(chosen) ?? vocab.fuzzy(chosen) : null) ?? ""
  if (!canonical || !vocab) {
    return {
      review: args.review,
      resolvedRows: [],
      canonical: "",
      synonymWritten: false,
    }
  }
  const siblings = siblingRowsForValue(args.review, unresolved)
  const next = applyControlledValueToReview(args.review, unresolved, canonical)
  const publisherName =
    next.proposal?.publisher_name ?? next.detected_publisher ?? null
  const publisherId =
    next.profile?.publisher_id ??
    (publisherName ? resolveCatalogueIdForProfileName(publisherName) : null)
  let synonymWritten = false
  if (publisherId != null) {
    const { learnSynonym } = await import(
      "@/lib/mediaplans/ingest/valueSynonymRepo"
    )
    await learnSynonym({
      publisherId,
      mediaType:
        next.template_coverage?.media_type ??
        next.detected_media_type ??
        "ooh",
      vocabulary: unresolved.vocabulary,
      avField: unresolved.fieldId,
      rawValue: unresolved.raw,
      rawValueDisplay: unresolved.raw,
      avCanonical: canonical,
      learnedFromStageId: args.stageId,
      createdBy: args.by,
    })
    synonymWritten = true
  }
  return { review: next, resolvedRows: siblings, canonical, synonymWritten }
}

export function tallyFieldOverride(args: {
  review: IngestReviewPackage
  publisherName: string
  header: string
  mappedTo: string
  fileName: string
}): IngestReviewPackage {
  const state = parseReviewOf(args.review)
  const key = [
    headerKey(args.publisherName),
    headerKey(args.header),
    headerKey(args.mappedTo),
  ].join("|")
  const files = new Set(state.override_tally?.[key] ?? [])
  const file = args.fileName.trim() || "untitled"
  files.add(file)
  const tally = { ...(state.override_tally ?? {}), [key]: [...files] }
  let proposals = [...(state.override_proposals ?? [])]
  if (files.size >= FIELD_OVERRIDE_FILE_THRESHOLD) {
    const existing = proposals.find(
      (p) =>
        headerKey(p.publisher_name) === headerKey(args.publisherName) &&
        headerKey(p.header) === headerKey(args.header) &&
        headerKey(p.mapped_to) === headerKey(args.mappedTo) &&
        !p.applied,
    )
    if (!existing) {
      proposals.push({
        publisher_name: args.publisherName,
        header: args.header,
        mapped_to: args.mappedTo,
        file_names: [...files],
        proposed_at: new Date().toISOString(),
        applied: false,
      })
    } else {
      proposals = proposals.map((p) =>
        p === existing ? { ...p, file_names: [...files] } : p,
      )
    }
  }
  return {
    ...args.review,
    parse_review: { ...state, override_tally: tally, override_proposals: proposals },
  }
}

export async function applyParseReviewOverrideProposal(args: {
  review: IngestReviewPackage
  header: string
  mappedTo: string
  by: string
  stageId: string
}): Promise<{
  review: IngestReviewPackage
  applied: boolean
  reason?: string
}> {
  const state = parseReviewOf(args.review)
  const proposal = (state.override_proposals ?? []).find(
    (p) =>
      headerKey(p.header) === headerKey(args.header) &&
      headerKey(p.mapped_to) === headerKey(args.mappedTo) &&
      !p.applied,
  )
  if (!proposal) {
    return {
      review: args.review,
      applied: false,
      reason: "No pending override proposal for that mapping.",
    }
  }
  const publisherName =
    proposal.publisher_name ||
    args.review.detected_publisher ||
    args.review.proposal?.publisher_name ||
    ""
  const { knownHeadersFromReview } = await import(
    "@/lib/mediaplans/ingest/persistColumnRemap"
  )
  const { remapIngestColumn } = await import(
    "@/lib/mediaplans/ingest/remapIngestColumn"
  )
  const result = await remapIngestColumn({
    publisherName,
    header: proposal.header,
    mappedTo: proposal.mapped_to,
    knownHeaders: knownHeadersFromReview(args.review),
    changedBy: args.by,
    source: "parse_review",
    stageId: args.stageId,
  })
  if (!result.ok) {
    return { review: args.review, applied: false, reason: result.reason }
  }
  return {
    review: {
      ...args.review,
      parse_review: {
        ...state,
        override_proposals: (state.override_proposals ?? []).map((p) =>
          p === proposal ? { ...p, applied: true } : p,
        ),
      },
    },
    applied: true,
  }
}

export function leftoverExcludedLegend(review: IngestReviewPackage): string {
  const labels = review.ignored.rows_unparsed_labels ?? []
  if (labels.length === 0) return ""
  return labels.join(" · ")
}
