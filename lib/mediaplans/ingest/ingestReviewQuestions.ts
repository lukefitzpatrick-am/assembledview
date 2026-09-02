/**
 * Confirm-then-ask cards for staged ingest — ChatInterviewQuestion only.
 * Unmatched-source cards walk required then enrich in card_field_ids order
 * (which column feeds Format). Sourced-but-unresolved controlled values are
 * ingest:value:<field>:<raw> (the source says X — which of our formats is that?).
 * Both are needed and they are different questions.
 */

import {
  isSkipAnswer,
  OTHER_OPTION,
  toChatInterviewQuestion,
} from "@/lib/ava/chatInterviewQuestion"
import type { ChatInterviewQuestion } from "@/lib/ava/types"
import type { AvaColumnMappingProposal } from "@/lib/mediaplans/ingest/avaColumnMapping"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  applyReviewColumnRemap,
  knownHeadersFromReview,
  validateRemapHeader,
} from "@/lib/mediaplans/ingest/persistColumnRemap"
import { isMoneyTarget } from "@/lib/mediaplans/ingest/moneyTargets"
import { remapIngestColumn } from "@/lib/mediaplans/ingest/remapIngestColumn"
import { oohFormatChoiceLabels, resolveControlledFormat } from "@/lib/mediaplans/ingest/resolveControlledOoh"
import { getTargetTemplate } from "@/lib/mediaplans/ingest/targetTemplates"
import type {
  TemplateFieldCoverage,
  UnresolvedControlledValue,
} from "@/lib/mediaplans/ingest/templateCoverage"

export const LEAVE_UNMAPPED_OPTION = "Leave unmapped"
/** Decline a required-field card — records the answer, writes nothing. */
export const NOT_IN_THIS_FILE_OPTION = "Not in this file"
/** Prefix for the only answer that deletes a mapping. Full label names the target. */
export const REMOVE_MAPPING_OPTION = "Remove this mapping"
export const AVA_SUGGESTION_SUFFIX = " (AVA suggestion)"

export type IngestRemapIdentity = {
  changedBy: string
  stageId?: string | null
}

export type IngestQuestionContext = {
  mbaNumber?: string | null
  mbaNumbers: string[]
}

export type IngestQuestionAnswer = {
  questionId: string
  answer: string
}

function headerKey(header: string): string {
  return header.replace(/\s+/g, " ").trim().toLowerCase()
}

export function removeMappingOptionLabel(mappedTo: string): string {
  return `${REMOVE_MAPPING_OPTION} (currently ${mappedTo})`
}

export function isRemoveMappingAnswer(answer: string): boolean {
  const raw = answer.replace(AVA_SUGGESTION_SUFFIX, "").trim()
  return raw === REMOVE_MAPPING_OPTION || raw.startsWith(`${REMOVE_MAPPING_OPTION} (`)
}

export function isDeclineAnswer(answer: string): boolean {
  if (isSkipAnswer(answer)) return true
  const raw = answer.replace(AVA_SUGGESTION_SUFFIX, "").trim()
  return (
    raw === LEAVE_UNMAPPED_OPTION ||
    raw === NOT_IN_THIS_FILE_OPTION ||
    raw === OTHER_OPTION
  )
}

/** Leave unmapped always; Remove this mapping only when the header is already mapped. */
export function columnMappingActionOptions(mappedTo: string | null): string[] {
  const options = [LEAVE_UNMAPPED_OPTION]
  if (mappedTo) options.push(removeMappingOptionLabel(mappedTo))
  options.push(OTHER_OPTION)
  return options
}

export function parseMappedOption(answer: string): string | null {
  if (isSkipAnswer(answer) || isRemoveMappingAnswer(answer)) return null
  const raw = answer.replace(AVA_SUGGESTION_SUFFIX, "").trim()
  if (
    !raw ||
    raw === LEAVE_UNMAPPED_OPTION ||
    raw === NOT_IN_THIS_FILE_OPTION ||
    raw === OTHER_OPTION
  ) {
    return null
  }
  return raw
}

export function isMoneyMappingHeader(
  header: string,
  mappedTo: string | null | undefined,
): boolean {
  if (mappedTo && isMoneyTarget(mappedTo)) return true
  return /media value|production|media bought rate/i.test(header)
}

function requiredQuestionId(fieldId: string): string {
  return `ingest:required:${fieldId}`
}

export const MBA_QUESTION_ID = "ingest:mba"
export const MONEY_RECONCILE_QUESTION_ID = "ingest:money:reconcile"
export const VALUE_QUESTION_PREFIX = "ingest:value:"

export function valueQuestionId(fieldId: string, raw: string): string {
  return `${VALUE_QUESTION_PREFIX}${fieldId}:${headerKey(raw)}`
}

function parseValueQuestionId(
  questionId: string,
): { fieldId: string; rawKey: string } | null {
  if (!questionId.startsWith(VALUE_QUESTION_PREFIX)) return null
  const rest = questionId.slice(VALUE_QUESTION_PREFIX.length)
  const split = rest.indexOf(":")
  if (split <= 0) return null
  const fieldId = rest.slice(0, split)
  const rawKey = rest.slice(split + 1)
  if (!fieldId || !rawKey) return null
  return { fieldId, rawKey }
}

function parseValueAnswer(answer: string): string | null {
  if (isSkipAnswer(answer)) return null
  const raw = answer.replace(AVA_SUGGESTION_SUFFIX, "").trim()
  if (!raw || raw === LEAVE_UNMAPPED_OPTION) return null
  return raw
}

function valueCardNoun(fieldId: string, label: string): string {
  if (fieldId === "format") return "formats"
  return `${label.toLowerCase()} values`
}

function valueCardOptions(fieldId: string): string[] {
  if (fieldId === "format") return oohFormatChoiceLabels()
  return []
}

function leftoverHeaders(review: IngestReviewPackage): string[] {
  const fromCoverage = (review.template_coverage?.not_used ?? []).map((n) => n.header)
  if (fromCoverage.length > 0) return fromCoverage
  return review.ignored.columns_unmapped
}

type RequiredCardField = { id: string; label: string; canonicals?: string[] }

function cardFieldIdsFor(review: IngestReviewPackage): string[] {
  const mediaType = (
    review.template_coverage?.media_type ||
    review.detected_media_type ||
    review.proposal?.media_type ||
    ""
  )
    .trim()
    .toLowerCase()
  if (!mediaType) return []
  try {
    return getTargetTemplate(mediaType).card_field_ids
  } catch {
    return []
  }
}

function orderUnmatchedByCard(
  fields: TemplateFieldCoverage[],
  cardIds: string[],
): TemplateFieldCoverage[] {
  const unmatched = fields.filter((field) => !field.matched)
  const byId = new Map(unmatched.map((field) => [field.id, field]))
  const ordered: TemplateFieldCoverage[] = []
  const seen = new Set<string>()
  for (const id of cardIds) {
    const field = byId.get(id)
    if (!field) continue
    ordered.push(field)
    seen.add(id)
  }
  for (const field of unmatched) {
    if (seen.has(field.id)) continue
    ordered.push(field)
  }
  return ordered
}

function unmatchedFieldsInCardOrder(
  review: IngestReviewPackage,
): TemplateFieldCoverage[] {
  const coverage = review.template_coverage
  if (!coverage) return []
  const cardIds = cardFieldIdsFor(review)
  return [
    ...orderUnmatchedByCard(coverage.required, cardIds),
    ...orderUnmatchedByCard(coverage.enrich, cardIds),
  ]
}

const MEDIA_MONEY_FALLBACK: RequiredCardField = {
  id: "media_money",
  label: "Media money",
  canonicals: [
    "media_rate:weekly",
    "media_rate:lunar",
    "media_rate:per_spot",
    "media_amount:stated",
  ],
}

function reconDeltaText(review: IngestReviewPackage): string {
  const recon = review.proposal?.reconciliation
  const delta = recon?.delta
  const pct = recon?.delta_pct
  const deltaLabel =
    delta != null
      ? `$${Math.abs(delta).toLocaleString("en-AU", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "the file total"
  const pctLabel =
    pct != null ? `${(Math.abs(pct) * 100).toFixed(2)}%` : "the 0.5% gate"
  return `The file total is off by ${deltaLabel} (${pctLabel}). Which column feeds Media money?`
}

function unmatchedWantedCanonicals(review: IngestReviewPackage): Set<string> {
  const wanted = new Set<string>()
  const consider = (
    fields: NonNullable<IngestReviewPackage["template_coverage"]>["required"] | undefined,
  ) => {
    for (const field of fields ?? []) {
      if (field.matched) continue
      for (const canon of field.canonicals ?? []) {
        if (canon) wanted.add(canon)
      }
      // dest is the plan path; include it so a required hit cannot be filtered.
      if (field.dest) wanted.add(field.dest)
    }
  }
  consider(review.template_coverage?.required)
  consider(review.template_coverage?.enrich)
  return wanted
}

function proposalServesUnmatchedWantedField(
  review: IngestReviewPackage,
  proposal: AvaColumnMappingProposal,
): boolean {
  const mapped = proposal.proposed_mapped_to?.trim() ?? ""
  if (!mapped) return false
  return unmatchedWantedCanonicals(review).has(mapped)
}

function unusedAccountedHeaderKeys(review: IngestReviewPackage): Set<string> {
  const keys = new Set<string>()
  for (const header of review.ignored.columns_unmapped) {
    keys.add(headerKey(header))
  }
  for (const col of review.template_coverage?.not_used ?? []) {
    keys.add(headerKey(col.header))
  }
  return keys
}

function isProposalAccountedAsUnused(
  review: IngestReviewPackage,
  proposal: AvaColumnMappingProposal,
): boolean {
  return unusedAccountedHeaderKeys(review).has(headerKey(proposal.header))
}

const warnedOrphanHeaders = new WeakMap<IngestReviewPackage, Set<string>>()

function warnOrphanMappingProposal(
  review: IngestReviewPackage,
  proposal: AvaColumnMappingProposal,
): void {
  const key = headerKey(proposal.header)
  let seen = warnedOrphanHeaders.get(review)
  if (!seen) {
    seen = new Set()
    warnedOrphanHeaders.set(review, seen)
  }
  if (seen.has(key)) return
  seen.add(key)
  const publisher = review.detected_publisher ?? "(unknown publisher)"
  console.warn(
    `Ingest mapping proposal "${proposal.header}" is not wanted by AssembledView but is missing from ignored.columns_unmapped and template_coverage.not_used (publisher: ${publisher})`,
  )
}

export type FilteredUnusedMappingProposals = {
  count: number
  headers: string[]
  orphans: string[]
}

/** AVA proposals dropped because AssembledView does not need that column. */
export function listFilteredUnusedMappingProposals(
  review: IngestReviewPackage,
): FilteredUnusedMappingProposals {
  const moneyHeaders = new Set(
    moneyColumns(review).map((col) => headerKey(col.header)),
  )
  const headers: string[] = []
  const orphans: string[] = []
  for (const proposal of review.ava_mapping_proposals ?? []) {
    if (moneyHeaders.has(headerKey(proposal.header))) continue
    if (proposalServesUnmatchedWantedField(review, proposal)) continue
    if (!isProposalAccountedAsUnused(review, proposal)) {
      warnOrphanMappingProposal(review, proposal)
      orphans.push(proposal.header)
      continue
    }
    headers.push(proposal.header)
  }
  return { count: headers.length, headers, orphans }
}

export function formatFilteredUnusedMappingLine(
  filtered: FilteredUnusedMappingProposals,
): string | null {
  if (filtered.count <= 0) return null
  if (filtered.count === 1) {
    return "1 other column isn't used by AssembledView — listed in the ignored rows."
  }
  return `${filtered.count} other columns aren't used by AssembledView — listed in the ignored rows.`
}

function buildRequiredCard(
  field: RequiredCardField,
  leftovers: string[],
  proposals: AvaColumnMappingProposal[],
  index: number,
  total: number,
  opts?: {
    text?: string
    questionId?: string
    kind?: "required" | "value" | "recon"
    mappedTo?: string | null
  },
): ChatInterviewQuestion {
  const hit = proposals.find(
    (p) =>
      p.proposed_mapped_to != null &&
      (field.canonicals?.includes(p.proposed_mapped_to) ?? false),
  )
  const options: string[] = []
  const seen = new Set<string>()
  const push = (label: string) => {
    if (seen.has(headerKey(label))) return
    seen.add(headerKey(label))
    options.push(label)
  }
  if (hit) push(`${hit.header}${AVA_SUGGESTION_SUFFIX}`)
  for (const header of leftovers) {
    if (hit && headerKey(header) === headerKey(hit.header)) continue
    push(header)
  }
  const kind = opts?.kind ?? "required"
  if (kind === "required") {
    push(NOT_IN_THIS_FILE_OPTION)
  } else {
    push(LEAVE_UNMAPPED_OPTION)
  }
  if (kind !== "required" && kind !== "value" && opts?.mappedTo) {
    push(removeMappingOptionLabel(opts.mappedTo))
  }
  push(OTHER_OPTION)
  return toChatInterviewQuestion({
    id: opts?.questionId ?? requiredQuestionId(field.id),
    text:
      opts?.text ??
      `Which column in this schedule holds ${field.label}?`,
    type: "choice",
    options,
    selected: hit ? [`${hit.header}${AVA_SUGGESTION_SUFFIX}`] : undefined,
    index,
    total,
  })
}

function buildMbaCard(
  mbaNumbers: string[],
  index: number,
  total: number,
): ChatInterviewQuestion {
  return toChatInterviewQuestion({
    id: MBA_QUESTION_ID,
    text: "Which campaign should this schedule attach to?",
    type: "choice",
    options: mbaNumbers,
    index,
    total,
  })
}

function moneyColumns(review: IngestReviewPackage): Array<{
  header: string
  mappedTo: string | null
}> {
  const seen = new Set<string>()
  const out: Array<{ header: string; mappedTo: string | null }> = []
  const consider = (header: string, mappedTo: string | null) => {
    if (!isMoneyMappingHeader(header, mappedTo)) return
    const key = headerKey(header)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ header, mappedTo })
  }
  for (const row of review.column_mapping) {
    consider(row.header, row.mapped_to)
  }
  for (const header of leftoverHeaders(review)) {
    const row = review.column_mapping.find((c) => headerKey(c.header) === headerKey(header))
    consider(header, row?.mapped_to ?? null)
  }
  return out
}

export function listOpenIngestReviewQuestions(
  review: IngestReviewPackage,
  context: IngestQuestionContext,
): ChatInterviewQuestion[] {
  const answered = new Set(
    Object.keys(review.ava_chat?.answers ?? {}).map((id) => id),
  )
  const draft: Array<Omit<ChatInterviewQuestion, "index" | "total"> & { index?: number; total?: number }> = []
  const leftovers = leftoverHeaders(review)
  const proposals = review.ava_mapping_proposals ?? []
  const unmatched = unmatchedFieldsInCardOrder(review)

  for (const field of unmatched) {
    const id = requiredQuestionId(field.id)
    if (answered.has(id)) continue
    draft.push(buildRequiredCard(field, leftovers, proposals, 1, 1))
  }

  const unmatchedIds = new Set(unmatched.map((field) => field.id))
  const unresolved = review.template_coverage?.unresolved_controlled ?? []
  for (const item of unresolved) {
    if (unmatchedIds.has(item.fieldId)) continue
    const id = valueQuestionId(item.fieldId, item.raw)
    if (answered.has(id)) continue
    const noun = valueCardNoun(item.fieldId, item.label)
    draft.push(
      buildRequiredCard(
        { id: item.fieldId, label: item.label },
        valueCardOptions(item.fieldId),
        [],
        1,
        1,
        {
          questionId: id,
          text: `The source says ${item.raw} — which of our ${noun} is that?`,
          kind: "value",
        },
      ),
    )
  }

  const moneyUnmatched = unmatched.some((field) => field.id === "media_money")
  const reconFail = review.proposal?.reconciliation.accept_ok === false
  if (
    reconFail &&
    !moneyUnmatched &&
    !answered.has(MONEY_RECONCILE_QUESTION_ID)
  ) {
    const mediaMoney =
      review.template_coverage?.required.find((field) => field.id === "media_money") ??
      MEDIA_MONEY_FALLBACK
    draft.push(
      buildRequiredCard(
        mediaMoney,
        moneyColumns(review).map((col) => col.header),
        proposals,
        1,
        1,
        {
          questionId: MONEY_RECONCILE_QUESTION_ID,
          text: reconDeltaText(review),
          kind: "recon",
        },
      ),
    )
  }

  const haveMba = Boolean(context.mbaNumber?.trim() || review.ava_chat?.selectedMbaNumber)
  if (!haveMba && context.mbaNumbers.length > 0 && !answered.has(MBA_QUESTION_ID)) {
    draft.push(buildMbaCard(context.mbaNumbers, 1, 1))
  }

  const total = draft.length
  return draft.map((q, i) =>
    toChatInterviewQuestion({
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      selected: q.selected,
      index: i + 1,
      total: Math.max(total, 1),
    }),
  )
}

export function outstandingIngestLabels(
  questions: ChatInterviewQuestion[],
): string[] {
  return questions.map((q) => q.text.replace(/\s+/g, " ").trim())
}

function mergeAnswers(
  review: IngestReviewPackage,
  answers: IngestQuestionAnswer[],
): Record<string, string> {
  const next = { ...(review.ava_chat?.answers ?? {}) }
  for (const a of answers) {
    const id = a.questionId.trim()
    const value = a.answer.trim()
    if (!id || !value) continue
    next[id] = value
  }
  return next
}

function applyControlledValueToReview(
  review: IngestReviewPackage,
  unresolved: UnresolvedControlledValue,
  canonical: string,
): IngestReviewPackage {
  const rawKey = headerKey(unresolved.raw)
  const proposal = review.proposal
  const nextProposal = proposal
    ? {
        ...proposal,
        line_items: proposal.line_items.map((item) => {
          const groupingFormat = item.grouping.format ?? ""
          const panelHit = item.panels.some(
            (panel) => headerKey(panel.descriptors.format ?? "") === rawKey,
          )
          if (headerKey(groupingFormat) !== rawKey && !panelHit) return item
          return {
            ...item,
            grouping: {
              ...item.grouping,
              publisher_format_name:
                item.grouping.publisher_format_name ||
                groupingFormat ||
                unresolved.raw,
              format: canonical,
            },
          }
        }),
      }
    : proposal
  const coverage = review.template_coverage
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
                headerKey(item.raw) === rawKey
              ),
          ),
        }
      : coverage,
  }
}

function inventedHeaderChanged(
  answer: string,
  fieldLabel: string,
  knownHeaders: string[],
): string {
  const shown = knownHeaders.slice(0, 12).join(", ")
  const more = knownHeaders.length > 12 ? "…" : ""
  return `"${answer}" is not a column in this schedule. ${fieldLabel} needs the name of the column that holds it — the columns available are: ${shown}${more}`
}

function currentMappedTo(
  review: IngestReviewPackage,
  header: string,
): string | null {
  const row = review.column_mapping.find(
    (c) => headerKey(c.header) === headerKey(header),
  )
  return row?.mapped_to ?? review.profile?.column_map[header] ?? null
}

async function persistMapping(args: {
  publisher: string
  header: string
  mappedTo: string | null
  review: IngestReviewPackage
  identity: IngestRemapIdentity
}): Promise<
  | { ok: true; header: string }
  | { ok: false; reason: string; knownHeaders: string[] }
> {
  const knownHeaders = knownHeadersFromReview(args.review)
  const validated = validateRemapHeader(args.header, knownHeaders)
  if (!validated.ok) {
    return { ok: false, reason: validated.reason, knownHeaders }
  }
  const result = await remapIngestColumn({
    publisherName: args.publisher,
    header: validated.header,
    mappedTo: args.mappedTo,
    knownHeaders,
    changedBy: args.identity.changedBy,
    source: "ava_card",
    stageId: args.identity.stageId,
  })
  if (!result.ok) {
    return { ok: false, reason: result.reason, knownHeaders: result.knownHeaders }
  }
  return { ok: true, header: validated.header }
}

async function applyOneAnswer(
  review: IngestReviewPackage,
  questionId: string,
  answer: string,
  identity: IngestRemapIdentity,
): Promise<{ review: IngestReviewPackage; changed: string; record: boolean }> {
  const mapped = parseMappedOption(answer)
  const publisher = review.detected_publisher
  const skipRemap = isSkipAnswer(answer)
  const knownHeaders = knownHeadersFromReview(review)
  if (questionId === MBA_QUESTION_ID) {
    if (skipRemap) {
      return { review, changed: "Left campaign unselected.", record: true }
    }
    const mba = parseMappedOption(answer) ?? answer.trim()
    return {
      review: {
        ...review,
        ava_chat: {
          ...review.ava_chat,
          selectedMbaNumber: mba,
        },
      },
      changed: `Campaign set to ${mba}.`,
      record: true,
    }
  }
  if (questionId.startsWith("ingest:map:")) {
    const header = questionId.slice("ingest:map:".length)
    const existing = currentMappedTo(review, header)
    if (isRemoveMappingAnswer(answer)) {
      if (!existing || !publisher) {
        return { review, changed: `Left ${header} unmapped.`, record: true }
      }
      const persisted = await persistMapping({
        publisher,
        header,
        mappedTo: null,
        review,
        identity,
      })
      if (!persisted.ok) {
        return {
          review,
          changed: inventedHeaderChanged(answer, header, persisted.knownHeaders),
          record: false,
        }
      }
      return {
        review: applyReviewColumnRemap(review, persisted.header, null),
        changed: `Removed ${persisted.header} → ${existing} from the ${publisher} profile. Every future upload from this publisher is affected.`,
        record: true,
      }
    }
    if (skipRemap || isDeclineAnswer(answer) || mapped == null) {
      return { review, changed: `Left ${header} unmapped.`, record: true }
    }
    if (!publisher) {
      return { review, changed: `Left ${header} unmapped.`, record: true }
    }
    const persisted = await persistMapping({
      publisher,
      header,
      mappedTo: mapped,
      review,
      identity,
    })
    if (!persisted.ok) {
      return {
        review,
        changed: inventedHeaderChanged(answer, header, persisted.knownHeaders),
        record: false,
      }
    }
    return {
      review: applyReviewColumnRemap(review, persisted.header, mapped),
      changed: `Mapped ${persisted.header} to ${mapped}.`,
      record: true,
    }
  }
  if (questionId === MONEY_RECONCILE_QUESTION_ID) {
    const header = mapped
    const dest = "media_amount:stated"
    if (header && publisher && !skipRemap && !isDeclineAnswer(answer)) {
      const headerCheck = validateRemapHeader(header, knownHeaders)
      if (!headerCheck.ok) {
        return {
          review,
          changed: inventedHeaderChanged(answer, "Media money", knownHeaders),
          record: false,
        }
      }
      const persisted = await persistMapping({
        publisher,
        header: headerCheck.header,
        mappedTo: dest,
        review,
        identity,
      })
      if (!persisted.ok) {
        return {
          review,
          changed: inventedHeaderChanged(answer, "Media money", persisted.knownHeaders),
          record: false,
        }
      }
      return {
        review: applyReviewColumnRemap(review, persisted.header, dest),
        changed: `Mapped ${persisted.header} to ${dest}. The 0.5% money check will run again.`,
        record: true,
      }
    }
    return {
      review,
      changed: "Left Media money remapping unmapped. The 0.5% money check will run again.",
      record: true,
    }
  }
  if (questionId.startsWith("ingest:money:")) {
    const header = questionId.slice("ingest:money:".length)
    const existing = currentMappedTo(review, header)
    if (isRemoveMappingAnswer(answer)) {
      if (!existing || !publisher) {
        return {
          review,
          changed: `Left ${header} unmapped. The 0.5% money check will run again.`,
          record: true,
        }
      }
      const persisted = await persistMapping({
        publisher,
        header,
        mappedTo: null,
        review,
        identity,
      })
      if (!persisted.ok) {
        return {
          review,
          changed: inventedHeaderChanged(answer, header, persisted.knownHeaders),
          record: false,
        }
      }
      return {
        review: applyReviewColumnRemap(review, persisted.header, null),
        changed: `Removed ${persisted.header} → ${existing} from the ${publisher} profile. Every future upload from this publisher is affected.`,
        record: true,
      }
    }
    if (skipRemap || isDeclineAnswer(answer) || mapped == null) {
      return {
        review,
        changed: `Left ${header} unmapped. The 0.5% money check will run again.`,
        record: true,
      }
    }
    if (!publisher) {
      return {
        review,
        changed: `Left ${header} unmapped. The 0.5% money check will run again.`,
        record: true,
      }
    }
    const persisted = await persistMapping({
      publisher,
      header,
      mappedTo: mapped,
      review,
      identity,
    })
    if (!persisted.ok) {
      return {
        review,
        changed: inventedHeaderChanged(answer, header, persisted.knownHeaders),
        record: false,
      }
    }
    return {
      review: applyReviewColumnRemap(review, persisted.header, mapped),
      changed: `Remapped ${persisted.header} to ${mapped}. The 0.5% money check will run again.`,
      record: true,
    }
  }
  if (questionId.startsWith(VALUE_QUESTION_PREFIX)) {
    const parsed = parseValueQuestionId(questionId)
    const unresolved = (review.template_coverage?.unresolved_controlled ?? []).find(
      (item) =>
        parsed != null &&
        item.fieldId === parsed.fieldId &&
        headerKey(item.raw) === parsed.rawKey,
    )
    const label = unresolved?.label ?? parsed?.fieldId ?? "value"
    if (skipRemap) {
      return { review, changed: `Left ${label} unmapped.`, record: true }
    }
    const chosen = parseValueAnswer(answer)
    const canonical = chosen
      ? resolveControlledFormat(chosen, publisher ?? undefined)
      : null
    if (!canonical || !unresolved) {
      return { review, changed: `Left ${label} unmapped.`, record: true }
    }
    return {
      review: applyControlledValueToReview(review, unresolved, canonical),
      changed: `Mapped ${unresolved.raw} to ${canonical}.`,
      record: true,
    }
  }
  if (questionId.startsWith("ingest:required:")) {
    const fieldId = questionId.slice("ingest:required:".length)
    const field = [
      ...(review.template_coverage?.required ?? []),
      ...(review.template_coverage?.enrich ?? []),
    ].find((f) => f.id === fieldId)
    const dest = field?.canonicals?.[0] ?? field?.dest ?? null
    const label = field?.label ?? fieldId
    if (skipRemap || isDeclineAnswer(answer) || mapped == null) {
      return { review, changed: `Left ${label} unmatched.`, record: true }
    }
    const headerCheck = validateRemapHeader(mapped, knownHeaders)
    if (!headerCheck.ok) {
      return {
        review,
        changed: inventedHeaderChanged(answer, label, knownHeaders),
        record: false,
      }
    }
    if (dest && publisher) {
      const persisted = await persistMapping({
        publisher,
        header: headerCheck.header,
        mappedTo: dest,
        review,
        identity,
      })
      if (!persisted.ok) {
        return {
          review,
          changed: inventedHeaderChanged(answer, label, persisted.knownHeaders),
          record: false,
        }
      }
      return {
        review: applyReviewColumnRemap(review, persisted.header, dest),
        changed: `Mapped ${persisted.header} to ${dest} (${label}).`,
        record: true,
      }
    }
    return {
      review,
      changed: `Left ${label} unmatched.`,
      record: true,
    }
  }
  return { review, changed: "", record: true }
}

export async function applyIngestReviewAnswers(
  review: IngestReviewPackage,
  answers: IngestQuestionAnswer[],
  identity: IngestRemapIdentity,
): Promise<{ review: IngestReviewPackage; changed: string[] }> {
  if (!identity.changedBy?.trim()) {
    throw new Error("applyIngestReviewAnswers: changedBy is required (do not default)")
  }
  let next = review
  const changed: string[] = []
  const recorded: IngestQuestionAnswer[] = []
  for (const a of answers) {
    const result = await applyOneAnswer(next, a.questionId, a.answer, identity)
    next = result.review
    if (result.changed) changed.push(result.changed)
    if (result.record) recorded.push(a)
  }
  next = {
    ...next,
    ava_chat: {
      ...next.ava_chat,
      answers: mergeAnswers(next, recorded),
    },
  }
  return { review: next, changed }
}

/** First turn emits all open cards; later turns only emit newly opened ids. */
export function questionsToEmit(
  open: ChatInterviewQuestion[],
  emittedIds: string[] | undefined,
): { questions: ChatInterviewQuestion[]; emittedQuestionIds: string[] } {
  const already = new Set(emittedIds ?? [])
  const fresh = open.filter((q) => !already.has(q.id))
  const emittedQuestionIds = [...already, ...fresh.map((q) => q.id)]
  return { questions: fresh, emittedQuestionIds }
}