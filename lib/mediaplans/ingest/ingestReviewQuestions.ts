/**
 * Confirm-then-ask cards for staged ingest — ChatInterviewQuestion only.
 * Suggestion source is review.ava_mapping_proposals (same as Hub Accept AVA).
 */

import { toChatInterviewQuestion } from "@/lib/ava/chatInterviewQuestion"
import type { ChatInterviewQuestion } from "@/lib/ava/types"
import {
  AVA_MAPPING_TARGET_DESCRIPTORS,
  type AvaColumnMappingProposal,
} from "@/lib/mediaplans/ingest/avaColumnMapping"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  applyReviewColumnRemap,
} from "@/lib/mediaplans/ingest/persistColumnRemap"
import { isMoneyTarget, MONEY_TARGETS } from "@/lib/mediaplans/ingest/moneyTargets"
import { remapIngestColumn } from "@/lib/mediaplans/ingest/remapIngestColumn"

export const LEAVE_UNMAPPED_OPTION = "Leave unmapped"
export const AVA_SUGGESTION_SUFFIX = " (AVA suggestion)"

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

function suggestionLabel(canon: string): string {
  return `${canon}${AVA_SUGGESTION_SUFFIX}`
}

export function parseMappedOption(answer: string): string | null {
  const raw = answer.replace(AVA_SUGGESTION_SUFFIX, "").trim()
  if (!raw || raw === LEAVE_UNMAPPED_OPTION) return null
  return raw
}

export function isMoneyMappingHeader(
  header: string,
  mappedTo: string | null | undefined,
): boolean {
  if (mappedTo && isMoneyTarget(mappedTo)) return true
  return /media value|production|media bought rate/i.test(header)
}

function mapQuestionId(header: string): string {
  return `ingest:map:${header}`
}

function moneyQuestionId(header: string): string {
  return `ingest:money:${header}`
}

function requiredQuestionId(fieldId: string): string {
  return `ingest:required:${fieldId}`
}

export const MBA_QUESTION_ID = "ingest:mba"

function planFieldOptions(suggestion: string | null): string[] {
  const opts: string[] = []
  const seen = new Set<string>()
  const push = (label: string) => {
    if (seen.has(label)) return
    seen.add(label)
    opts.push(label)
  }
  if (suggestion) push(suggestionLabel(suggestion))
  for (const f of AVA_MAPPING_TARGET_DESCRIPTORS) {
    if (suggestion && f === suggestion) continue
    push(f)
  }
  push(LEAVE_UNMAPPED_OPTION)
  return opts
}

function moneyFieldOptions(current: string | null): string[] {
  const opts: string[] = []
  const seen = new Set<string>()
  const push = (label: string) => {
    if (seen.has(label)) return
    seen.add(label)
    opts.push(label)
  }
  if (current && isMoneyTarget(current)) push(suggestionLabel(current))
  for (const t of MONEY_TARGETS) {
    if (current && t === current) continue
    push(t)
  }
  push(LEAVE_UNMAPPED_OPTION)
  return opts
}

function leftoverHeaders(review: IngestReviewPackage): string[] {
  const fromCoverage = (review.template_coverage?.not_used ?? []).map((n) => n.header)
  if (fromCoverage.length > 0) return fromCoverage
  return review.ignored.columns_unmapped
}

function buildSuggestionCard(
  proposal: AvaColumnMappingProposal,
  index: number,
  total: number,
): ChatInterviewQuestion {
  const suggested = proposal.proposed_mapped_to
  return toChatInterviewQuestion({
    id: mapQuestionId(proposal.header),
    text: `Column "${proposal.header}" is unmapped. AVA proposes ${suggested ?? "leave unmapped"} — pick a plan field.`,
    type: "choice",
    options: planFieldOptions(suggested),
    selected: suggested ? [suggestionLabel(suggested)] : [LEAVE_UNMAPPED_OPTION],
    index,
    total,
  })
}

function buildRequiredCard(
  field: { id: string; label: string; canonicals?: string[] },
  leftovers: string[],
  proposals: AvaColumnMappingProposal[],
  index: number,
  total: number,
): ChatInterviewQuestion {
  const hit = proposals.find(
    (p) =>
      p.proposed_mapped_to != null &&
      (field.canonicals?.includes(p.proposed_mapped_to) ?? false),
  )
  const opts: string[] = []
  const seen = new Set<string>()
  const push = (label: string) => {
    if (seen.has(headerKey(label))) return
    seen.add(headerKey(label))
    opts.push(label)
  }
  if (hit) push(`${hit.header}${AVA_SUGGESTION_SUFFIX}`)
  for (const h of leftovers) push(h)
  push(LEAVE_UNMAPPED_OPTION)
  return toChatInterviewQuestion({
    id: requiredQuestionId(field.id),
    text: `Required: ${field.label} has no source. Which publisher column maps to it?`,
    type: "choice",
    options: opts,
    selected: hit ? [`${hit.header}${AVA_SUGGESTION_SUFFIX}`] : undefined,
    index,
    total,
  })
}

function buildMoneyCard(
  header: string,
  mappedTo: string | null,
  index: number,
  total: number,
): ChatInterviewQuestion {
  return toChatInterviewQuestion({
    id: moneyQuestionId(header),
    text: `Money column "${header}" is mapped to ${mappedTo ?? "nothing"}. Changing it re-runs the 0.5% reconciliation.`,
    type: "choice",
    options: moneyFieldOptions(mappedTo),
    selected: mappedTo && isMoneyTarget(mappedTo)
      ? [suggestionLabel(mappedTo)]
      : [LEAVE_UNMAPPED_OPTION],
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

  const moneyHeaders = new Set(
    moneyColumns(review).map((c) => headerKey(c.header)),
  )
  const leftovers = leftoverHeaders(review)

  for (const proposal of review.ava_mapping_proposals ?? []) {
    if (moneyHeaders.has(headerKey(proposal.header))) continue
    const id = mapQuestionId(proposal.header)
    if (answered.has(id)) continue
    draft.push(buildSuggestionCard(proposal, 1, 1))
  }

  const unmatchedRequired =
    review.template_coverage?.required.filter((f) => !f.matched) ?? []
  for (const field of unmatchedRequired) {
    const id = requiredQuestionId(field.id)
    if (answered.has(id)) continue
    draft.push(
      buildRequiredCard(
        field,
        leftovers,
        review.ava_mapping_proposals ?? [],
        1,
        1,
      ),
    )
  }

  for (const col of moneyColumns(review)) {
    const id = moneyQuestionId(col.header)
    if (answered.has(id)) continue
    draft.push(buildMoneyCard(col.header, col.mappedTo, 1, 1))
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

async function applyOneAnswer(
  review: IngestReviewPackage,
  questionId: string,
  answer: string,
): Promise<{ review: IngestReviewPackage; changed: string }> {
  const mapped = parseMappedOption(answer)
  const publisher = review.detected_publisher
  if (questionId === MBA_QUESTION_ID) {
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
    }
  }
  if (questionId.startsWith("ingest:map:")) {
    const header = questionId.slice("ingest:map:".length)
    if (publisher) {
      await remapIngestColumn({ publisherName: publisher, header, mappedTo: mapped })
    }
    return {
      review: applyReviewColumnRemap(review, header, mapped),
      changed: mapped
        ? `Mapped ${header} → ${mapped}.`
        : `Left ${header} unmapped.`,
    }
  }
  if (questionId.startsWith("ingest:money:")) {
    const header = questionId.slice("ingest:money:".length)
    if (publisher) {
      await remapIngestColumn({ publisherName: publisher, header, mappedTo: mapped })
    }
    return {
      review: applyReviewColumnRemap(review, header, mapped),
      changed: mapped
        ? `Remapped money column ${header} → ${mapped} (0.5% reconciliation re-runs).`
        : `Left money column ${header} unmapped (0.5% reconciliation re-runs).`,
    }
  }
  if (questionId.startsWith("ingest:required:")) {
    const fieldId = questionId.slice("ingest:required:".length)
    const field = [
      ...(review.template_coverage?.required ?? []),
      ...(review.template_coverage?.enrich ?? []),
    ].find((f) => f.id === fieldId)
    const dest = field?.canonicals?.[0] ?? field?.dest ?? null
    const header = mapped
    if (header && dest && publisher) {
      await remapIngestColumn({
        publisherName: publisher,
        header,
        mappedTo: dest,
      })
      return {
        review: applyReviewColumnRemap(review, header, dest),
        changed: `Mapped ${header} → ${dest} for required ${field?.label ?? fieldId}.`,
      }
    }
    return {
      review,
      changed: `Left required ${field?.label ?? fieldId} unmatched.`,
    }
  }
  return { review, changed: "" }
}

export async function applyIngestReviewAnswers(
  review: IngestReviewPackage,
  answers: IngestQuestionAnswer[],
): Promise<{ review: IngestReviewPackage; changed: string[] }> {
  let next = review
  const changed: string[] = []
  const merged = mergeAnswers(review, answers)
  for (const a of answers) {
    const result = await applyOneAnswer(next, a.questionId, a.answer)
    next = result.review
    if (result.changed) changed.push(result.changed)
  }
  next = {
    ...next,
    ava_chat: {
      ...next.ava_chat,
      answers: merged,
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