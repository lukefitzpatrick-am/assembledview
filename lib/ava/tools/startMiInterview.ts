import type AvaTool from "./types"
import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import { resolveMiPlan, type MiAnswer, type MiPlanInput } from "@/lib/specs/resolve"
import { asRecord, asString, capList, jsonContent, resolveScopedMba } from "./helpers"

type InterviewQuestion = {
  id: string
  field: string
  question: string
  type: "choice" | "dimensions" | "text"
  options?: string[]
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
    truncated: capped.truncated,
  }
}

function answersFrom(input: Record<string, unknown>): MiAnswer[] {
  if (!Array.isArray(input.answers)) return []
  return input.answers.flatMap((value) => {
    const answer = asRecord(value)
    const questionId = asString(answer.questionId)
    const response = asString(answer.answer)
    return questionId && response ? [{ questionId, answer: response }] : []
  })
}

export const startMiInterviewTool: AvaTool = {
  definition: {
    name: "start_mi_interview",
    description:
      "Resolve an MBA's material-instructions plan and return the remaining compact interview questions. Use this to collect missing MI details; pass prior answers to refresh the remaining questions. It does not save answers or generate a workbook.",
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
      const lineItems = await fetchAllMediaContainerLineItems(scopedMba.mba)
      return {
        content: jsonContent(buildMiInterviewPayload({ lineItems }, answersFrom(args))),
        isError: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: `Failed to start MI interview: ${message}`, isError: true }
    }
  },
}
