import type AvaTool from "./types"
import {
  parseMiAnswerMessage,
  stripApplyAllMarker,
  toChatInterviewQuestion,
} from "@/lib/ava/chatInterviewQuestion"
import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import { slugifyPublisher } from "@/lib/specs/library"
import {
  flattenPlanLineItems,
  resolveMiPlan,
  type MiAnswer,
  type MiOpenQuestion,
  type MiPlanInput,
  type MiResolvedSpec,
} from "@/lib/specs/resolve"
import { asRecord, asString, jsonContent, MI_SCOPE_VERSION_QUESTION_ID, resolveMediaContainerScope, resolveMiVersionScope, resolveScopedMba } from "./helpers"

type InterviewQuestion = {
  id: string
  field: string
  question: string
  type: "choice" | "dimensions" | "text" | "multichoice"
  options?: string[]
  selected?: string[]
  source?: string
  line_item_id: string
  displayName: string
  appliesTo: string
  groupCount?: number
  groupLabel?: string
}

export type MiInterviewToolPayload = {
  summary: string
  resolvedCount: number
  openCount: number
  derivedCount: number
  /** Exactly the current open question, or null when the interview has no remaining asks. */
  currentQuestion: InterviewQuestion | null
  /** 1-based index of currentQuestion among baseline open questions (card echo). */
  questionIndex?: number
  /** Baseline open-question total for card echo (stable across the interview). */
  questionTotal?: number
  /**
   * Full derived fills — only when openCount === 0 so the model can cite them in
   * the confirm readback. Never exposed mid-interview (avoids invented questions).
   */
  derived?: ReturnType<typeof resolveMiPlan>["derived"]
}

/** Deterministic grouping key: field + publisher_slug + serialised options. */
export function miQuestionGroupKey(
  field: string,
  publisherSlug: string,
  options?: string[],
): string {
  return `${field}\0${publisherSlug}\0${JSON.stringify(options ?? [])}`
}

function publisherSlugForQuestion(
  question: Pick<MiOpenQuestion, "rowRef">,
  resolved: MiResolvedSpec[],
  plan: MiPlanInput,
): string {
  const fromResolved = resolved.find(
    (row) => row.line_item_id === question.rowRef.line_item_id,
  )?.publisher_slug
  if (fromResolved) return fromResolved
  const line = flattenPlanLineItems(plan).find(
    (item) => item.line_item_id === question.rowRef.line_item_id,
  )
  return line?.publisher ? slugifyPublisher(line.publisher) : ""
}

function publisherLabelForSlug(
  slug: string,
  resolved: MiResolvedSpec[],
): string {
  const named = resolved.find((row) => row.publisher_slug === slug)?.fields_client?.Publisher
  if (named?.trim()) return named.trim()
  if (!slug) return "matching"
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/**
 * Unanswered open questions that share the current question's group key.
 * Order follows resolveMiPlan's open_questions order (deterministic).
 */
export function groupOpenQuestions(
  openQuestions: MiOpenQuestion[],
  currentQuestionId: string,
  resolved: MiResolvedSpec[],
  plan: MiPlanInput,
): MiOpenQuestion[] {
  const current = openQuestions.find((question) => question.id === currentQuestionId)
  if (!current) return []
  const key = miQuestionGroupKey(
    current.field,
    publisherSlugForQuestion(current, resolved, plan),
    current.options,
  )
  return openQuestions.filter(
    (question) =>
      miQuestionGroupKey(
        question.field,
        publisherSlugForQuestion(question, resolved, plan),
        question.options,
      ) === key,
  )
}

function groupMetaForCurrent(
  openQuestions: MiOpenQuestion[],
  currentQuestionId: string,
  resolved: MiResolvedSpec[],
  plan: MiPlanInput,
): { groupCount: number; groupLabel: string } | undefined {
  const members = groupOpenQuestions(openQuestions, currentQuestionId, resolved, plan)
  if (members.length < 2) return undefined
  const current = members.find((question) => question.id === currentQuestionId) ?? members[0]
  const slug = publisherSlugForQuestion(current, resolved, plan)
  const publisher = publisherLabelForSlug(slug, resolved)
  return {
    groupCount: members.length,
    groupLabel: `${members.length} similar ${publisher} lines`,
  }
}

/**
 * Expand [apply-all] answers onto every unanswered peer in the recomputed group.
 * Strips the marker before any answer reaches the resolver. Card preticks are not
 * answers — the Confirm value is what expands to the group (user opt-in).
 */
export function expandApplyAllAnswers(
  plan: MiPlanInput,
  answers: MiAnswer[],
): MiAnswer[] {
  let expanded: MiAnswer[] = []

  for (const raw of answers) {
    const { answer, applyAll } = stripApplyAllMarker(raw.answer)
    if (!answer) continue

    if (!applyAll) {
      expanded = [
        ...expanded.filter((entry) => entry.questionId !== raw.questionId),
        { questionId: raw.questionId, answer },
      ]
      continue
    }

    const snapshot = resolveMiPlan(plan, undefined, expanded)
    const members = groupOpenQuestions(
      snapshot.open_questions,
      raw.questionId,
      snapshot.resolved,
      plan,
    )
    const ids =
      members.length >= 2
        ? members.map((question) => question.id)
        : [raw.questionId]
    const idSet = new Set(ids)
    expanded = expanded.filter((entry) => !idSet.has(entry.questionId))
    for (const id of ids) {
      expanded.push({ questionId: id, answer })
    }
  }

  return expanded
}

function compactQuestion(
  question: ReturnType<typeof resolveMiPlan>["open_questions"][number],
  group?: { groupCount: number; groupLabel: string },
): InterviewQuestion {
  return {
    id: question.id,
    field: question.field,
    question: question.question,
    type: question.type,
    ...(question.options ? { options: question.options } : {}),
    ...(question.selected?.length ? { selected: question.selected } : {}),
    ...(question.source ? { source: question.source } : {}),
    line_item_id: question.rowRef.line_item_id,
    displayName: question.rowRef.displayName,
    appliesTo: question.appliesTo,
    ...(group ? { groupCount: group.groupCount, groupLabel: group.groupLabel } : {}),
  }
}

/**
 * Count answers that matched an open question and closed it.
 * Unmatched ids (stale / invented) do not advance progress.
 * Follow-up questions after dead-ends (e.g. specs_source) grow the total.
 * Bulk-apply expansion must run before this so one Confirm can consume N.
 */
function countConsumedAnswers(plan: MiPlanInput, answers: MiAnswer[]): number {
  let consumed = 0
  const applied: MiAnswer[] = []
  for (const answer of answers) {
    const before = resolveMiPlan(plan, undefined, applied)
    const wasOpen = before.open_questions.some((question) => question.id === answer.questionId)
    if (!wasOpen) continue
    applied.push(answer)
    const after = resolveMiPlan(plan, undefined, applied)
    const stillOpen = after.open_questions.some((question) => question.id === answer.questionId)
    if (!stillOpen) consumed += 1
  }
  return consumed
}

/**
 * Tool-result payload for the model: summary counts + ONE current question.
 * Remaining questions stay server-side until the next tool call after an answer.
 * Derived fills are count-only mid-interview; full `derived` only when complete.
 */
export function buildMiInterviewPayload(
  plan: MiPlanInput,
  answers: MiAnswer[] = [],
): MiInterviewToolPayload {
  const expanded = expandApplyAllAnswers(plan, answers)
  const baseline = resolveMiPlan(plan, undefined, [])
  const result = resolveMiPlan(plan, undefined, expanded)
  const currentOpen = result.open_questions[0]
  const group = currentOpen
    ? groupMetaForCurrent(
        result.open_questions,
        currentOpen.id,
        result.resolved,
        plan,
      )
    : undefined
  const current = currentOpen ? compactQuestion(currentOpen, group) : null
  const answeredCount = countConsumedAnswers(plan, expanded)
  const questionTotal = Math.max(baseline.summary.open, answeredCount + result.summary.open, 1)

  const payload: MiInterviewToolPayload = {
    summary: `${result.summary.resolved} resolved, ${result.summary.open} open`,
    resolvedCount: result.summary.resolved,
    openCount: result.summary.open,
    derivedCount: result.derived.length,
    currentQuestion: current,
  }

  if (current) {
    payload.questionIndex = answeredCount + 1
    payload.questionTotal = questionTotal
  }

  // Confirm readback only — never mid-interview (model must not ask about these).
  if (result.summary.open === 0 && result.derived.length > 0) {
    payload.derived = result.derived
  }

  return payload
}

/**
 * Side-channel card(s) for the current open question.
 * Index/total use consumed matched answers + remaining open (so follow-up
 * questions after dead-ends grow questionTotal). Unmatched answer ids do not
 * advance the counter. Exactly ONE card per turn; questions 2+ arrive only via
 * the next tool call. When the current question's group has N ≥ 2, the card
 * carries groupCount / groupLabel for the bulk-apply toggle.
 */
export function buildMiInterviewQuestionCards(
  plan: MiPlanInput,
  answers: MiAnswer[] = [],
) {
  const payload = buildMiInterviewPayload(plan, answers)
  const current = payload.currentQuestion
  if (!current || payload.questionIndex == null || payload.questionTotal == null) {
    return undefined
  }

  return [
    toChatInterviewQuestion({
      id: current.id,
      text: current.question,
      type: current.type,
      options: current.options,
      selected: current.selected,
      index: payload.questionIndex,
      total: payload.questionTotal,
      ...(current.groupCount != null
        ? { groupCount: current.groupCount, groupLabel: current.groupLabel }
        : {}),
    }),
  ]
}

function answersFrom(input: Record<string, unknown>): MiAnswer[] {
  if (!Array.isArray(input.answers)) return []
  return input.answers.flatMap((value) => {
    const answer = asRecord(value)
    const questionId = asString(answer.questionId)
    const response = asString(answer.answer)
    if (!questionId || !response) return []
    // Allow models to paste the full Confirm line as `answer`.
    // Keep [apply-all] in the answer body for expandApplyAllAnswers.
    const tagged = parseMiAnswerMessage(response)
    if (tagged) {
      return [{
        questionId: tagged.questionId,
        answer: tagged.applyAll ? `${tagged.answer} [apply-all]` : tagged.answer,
      }]
    }
    return [{ questionId, answer: response }]
  })
}

export const startMiInterviewTool: AvaTool = {
  definition: {
    name: "start_mi_interview",
    description:
      "Resolve an MBA's material-instructions plan and return the ONE current interview question (plus summary counts). The chat UI shows an interactive question card for that question — the card already carries questionIndex/questionTotal; never compose your own \"Question N of M\" line; if you mention progress, echo those fields from the latest tool result only. Do not re-list options. Never author, paraphrase, reorder, or renumber questions: if it is not the tool card / currentQuestion, it is not a question. When the card has a bulk-apply toggle, user Confirm may include [apply-all] — pass every [mi:…] tag verbatim (including [apply-all]); never summarise or omit the toggle. Derived fills are already applied (derivedCount mid-interview; full derived only when openCount is 0 for the confirm readback) — never ask the user to confirm them, never present them as questions, never restate them with your own labels, never map bid_strategy to funnel objectives (Awareness/Consideration/Conversions). User Confirm messages look like \"[mi:questionId] answer\" or \"[mi:questionId] answer [apply-all]\" — pass every such pair (plus any earlier ones) as answers when calling again to advance. Does not save answers or generate a workbook.",
    input_schema: {
      type: "object",
      properties: {
        mba: {
          type: "string",
          description: "MBA number. Defaults to the current scoped MBA.",
        },
        mbaNumber: {
          type: "string",
          description: "Alias for mba.",
        },
        answers: {
          type: "array",
          description: "Optional prior MI answers used only to compute remaining questions.",
          items: {
            type: "object",
            properties: {
              questionId: { type: "string" },
              answer: { type: "string" },
            },
            required: ["questionId", "answer"],
            additionalProperties: false,
          },
        },
        versionNumber: {
          type: "number",
          description:
            "Plan version to scope when page context has no versionNumber. Prefer the user's chosen version.",
        },
        mbaWide: {
          type: "boolean",
          description:
            "If true, explicitly scope MBA-wide (all versions/containers). Only set after the user chooses MBA-wide when no version is in context.",
        },
        scope: {
          type: "string",
          description: "Alternative to mbaWide — pass \"MBA-wide\" when the user picks that option.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const scopedMba = resolveScopedMba(context, asString(args.mba) ?? asString(args.mbaNumber))
    if (!scopedMba.ok) return { content: scopedMba.error, isError: true }
    if (!scopedMba.mba) {
      return { content: "mba is required (pass it or open a media plan page).", isError: true }
    }

    try {
      const priorAnswers = answersFrom(args)
      const versionScope = resolveMiVersionScope(context, args, priorAnswers)
      if (!versionScope.ok) {
        return {
          content: jsonContent(versionScope.payload),
          questions: [versionScope.question],
          isError: false,
        }
      }

      const { mediaTypeFilter } = resolveMediaContainerScope(context)
      const versionNumber = versionScope.mbaWide
        ? undefined
        : (versionScope.versionNumber ?? context.versionNumber)
      const lineItems = await fetchAllMediaContainerLineItems(
        scopedMba.mba,
        versionNumber,
        mediaTypeFilter,
      )
      const planAnswers = priorAnswers.filter(
        (answer) => answer.questionId !== MI_SCOPE_VERSION_QUESTION_ID,
      )
      // Model payload: counts + current question only. Next question arrives after answers round-trip.
      const payload = buildMiInterviewPayload({ lineItems }, planAnswers)
      const questions = buildMiInterviewQuestionCards({ lineItems }, planAnswers)

      return {
        content: jsonContent(payload),
        ...(questions ? { questions } : {}),
        isError: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: `Failed to start MI interview: ${message}`, isError: true }
    }
  },
}
