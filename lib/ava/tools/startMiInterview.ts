import type AvaTool from "./types"
import {
  parseMiAnswerMessage,
  toChatInterviewQuestion,
} from "@/lib/ava/chatInterviewQuestion"
import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import { resolveMiPlan, type MiAnswer, type MiPlanInput } from "@/lib/specs/resolve"
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

function compactQuestion(question: ReturnType<typeof resolveMiPlan>["open_questions"][number]): InterviewQuestion {
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
  }
}

/**
 * Count answers that matched an open question and closed it.
 * Unmatched ids (stale / invented) do not advance progress.
 * Follow-up questions after dead-ends (e.g. specs_source) grow the total.
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
  const baseline = resolveMiPlan(plan, undefined, [])
  const result = resolveMiPlan(plan, undefined, answers)
  const current = result.open_questions[0]
    ? compactQuestion(result.open_questions[0])
    : null
  const answeredCount = countConsumedAnswers(plan, answers)
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
 * the next tool call.
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
    const tagged = parseMiAnswerMessage(response)
    if (tagged) return [{ questionId: tagged.questionId, answer: tagged.answer }]
    return [{ questionId, answer: response }]
  })
}

export const startMiInterviewTool: AvaTool = {
  definition: {
    name: "start_mi_interview",
    description:
      "Resolve an MBA's material-instructions plan and return the ONE current interview question (plus summary counts). The chat UI shows an interactive question card for that question — the card already carries questionIndex/questionTotal; never compose your own \"Question N of M\" line; if you mention progress, echo those fields from the latest tool result only. Do not re-list options. Never author, paraphrase, reorder, or renumber questions: if it is not the tool card / currentQuestion, it is not a question. Derived fills are already applied (derivedCount mid-interview; full derived only when openCount is 0 for the confirm readback) — never ask the user to confirm them, never present them as questions, never restate them with your own labels, never map bid_strategy to funnel objectives (Awareness/Consideration/Conversions). User Confirm messages look like \"[mi:questionId] answer\" — pass every such pair (plus any earlier ones) as answers when calling again to advance. Does not save answers or generate a workbook.",
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
