import type AvaTool from "./types"
import {
  parseMiAnswerMessage,
  toChatInterviewQuestion,
} from "@/lib/ava/chatInterviewQuestion"
import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import { resolveMiPlan, type MiAnswer, type MiPlanInput } from "@/lib/specs/resolve"
import { asRecord, asString, capList, jsonContent, MI_SCOPE_VERSION_QUESTION_ID, resolveMediaContainerScope, resolveMiVersionScope, resolveScopedMba } from "./helpers"

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

export function buildMiInterviewPayload(
  plan: MiPlanInput,
  answers: MiAnswer[] = [],
) {
  const result = resolveMiPlan(plan, undefined, answers)
  const capped = capList(result.open_questions.map(compactQuestion), 20)
  return {
    summary: `${result.summary.resolved} resolved, ${result.summary.open} open`,
    resolvedCount: result.summary.resolved,
    openCount: result.summary.open,
    questions: capped.items,
    derived: result.derived,
    truncated: capped.truncated,
  }
}

/**
 * Side-channel card(s) for the current open question.
 * Index/total use resolver progress (baseline open − remaining open), not
 * priorAnswers.length — unmatched answer ids must not advance the counter.
 */
export function buildMiInterviewQuestionCards(
  plan: MiPlanInput,
  answers: MiAnswer[] = [],
) {
  const baseline = buildMiInterviewPayload(plan, [])
  const payload = buildMiInterviewPayload(plan, answers)
  const current = payload.questions[0]
  if (!current) return undefined

  const answeredCount = Math.max(0, baseline.openCount - payload.openCount)
  const total = Math.max(baseline.openCount, 1)
  return [
    toChatInterviewQuestion({
      id: current.id,
      text: current.question,
      type: current.type,
      options: current.options,
      selected: current.selected,
      index: answeredCount + 1,
      total,
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
      "Resolve an MBA's material-instructions plan and return remaining interview questions plus any derived fills. The chat UI shows an interactive question card for the current question — keep your prose short (e.g. \"Question 1 of 3 — defaults pre-selected\") and echo the card's index/total; do not re-list options. Relay each question verbatim in tool order; present pre-selected proposals as defaults; never invent additional interview questions. Confirm summaries must cite derived answers with their source (e.g. from plan: bid_strategy). User Confirm messages look like \"[mi:questionId] answer\" — pass every such pair (plus any earlier ones) as answers when calling again. Does not save answers or generate a workbook.",
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
      const payload = buildMiInterviewPayload({ lineItems }, planAnswers)
      // Side-channel: current question only (ONE per turn). Model still gets the full list in content.
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
