import type AvaTool from "./types"
import { lookupIngestStage, patchIngestStageReview } from "@/lib/mediaplans/ingest/ingestStageStore"
import {
  formatIngestConfirmedBlock,
  summariseIngestReview,
} from "@/lib/mediaplans/ingest/summariseIngestReview"
import {
  applyIngestReviewAnswers,
  listOpenIngestReviewQuestions,
  outstandingIngestLabels,
  questionsToEmit,
  type IngestQuestionAnswer,
} from "@/lib/mediaplans/ingest/ingestReviewQuestions"
import { parseMiAnswerMessage } from "@/lib/ava/chatInterviewQuestion"

function answersFrom(input: Record<string, unknown>): IngestQuestionAnswer[] {
  if (!Array.isArray(input.answers)) return []
  return input.answers.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const row = value as Record<string, unknown>
    const questionId = typeof row.questionId === "string" ? row.questionId.trim() : ""
    const response = typeof row.answer === "string" ? row.answer : ""
    if (!questionId || !response.trim()) return []
    const tagged = parseMiAnswerMessage(response)
    if (tagged) return [{ questionId: tagged.questionId, answer: tagged.answer }]
    return [{ questionId, answer: response.trim() }]
  })
}

export const getPendingIngestReviewTool: AvaTool = {
  definition: {
    name: "get_pending_ingest_review",
    description:
      "Read the staged publisher-schedule ingest review. Returns a compact confirmed markdown table (publisher, coverage, money delta, named ignored rows) plus question cards for open decisions. Echo the table; ask only via the cards — never as prose asking the user to type a column name. Pass prior card answers as answers to accumulate mapping. Does not invent figures.",
    input_schema: {
      type: "object",
      properties: {
        answers: {
          type: "array",
          description:
            "Prior question-card answers ([mi:questionId] answer). Accumulates into the staged mapping.",
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
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const stageId = context.pendingIngest?.stageId?.trim()
    if (!stageId) {
      return {
        content:
          "No pending ingest review in this turn. Ask the user to attach an xlsx publisher schedule in AVA.",
        isError: true,
      }
    }
    const looked = await lookupIngestStage(stageId)
    if (!looked.ok) {
      if (looked.reason === "expired") {
        return {
          content:
            "Staged ingest review expired. Ask the user to re-attach the xlsx.",
          isError: true,
          ingestStageMissing: true,
        }
      }
      return {
        content:
          `The staged review for ${stageId} is no longer on the server. This is a known server-side limitation, not something the user did. Tell the user plainly that the upload needs re-attaching and say why.`,
        isError: true,
        ingestStageMissing: true,
      }
    }

    const body =
      input !== null && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {}
    const incoming = answersFrom(body)
    let review = looked.staged.review
    let changed: string[] = []
    if (incoming.length > 0) {
      const applied = await applyIngestReviewAnswers(review, incoming)
      review = applied.review
      changed = applied.changed
      await patchIngestStageReview(stageId, review)
    }

    const summary = summariseIngestReview(review, {
      stageId,
      fileName: context.pendingIngest?.fileName ?? looked.staged.fileName,
    })
    const questionCtx = {
      mbaNumber: context.mbaNumber,
      mbaNumbers: context.mbaNumbers,
    }
    const open = listOpenIngestReviewQuestions(review, questionCtx)
    const emit = questionsToEmit(open, review.ava_chat?.emittedQuestionIds)
    if (emit.emittedQuestionIds.join("\0") !== (review.ava_chat?.emittedQuestionIds ?? []).join("\0")) {
      review = {
        ...review,
        ava_chat: {
          ...review.ava_chat,
          emittedQuestionIds: emit.emittedQuestionIds,
        },
      }
      await patchIngestStageReview(stageId, review)
    }

    const followUp = incoming.length > 0
    const confirmed = formatIngestConfirmedBlock(summary)
    let content = confirmed
    if (followUp) {
      const lines: string[] = []
      if (changed.length > 0) lines.push(changed.join(" "))
      const still = outstandingIngestLabels(open)
      if (still.length > 0) {
        lines.push(`Still open: ${still.length} decision${still.length === 1 ? "" : "s"}.`)
      } else {
        lines.push("Nothing else is outstanding. Wait for confirm then accept_ingest_proposal.")
      }
      content = lines.join("\n")
    }

    return {
      content,
      isError: false,
      ...(emit.questions.length > 0 ? { questions: emit.questions } : {}),
    }
  },
}
