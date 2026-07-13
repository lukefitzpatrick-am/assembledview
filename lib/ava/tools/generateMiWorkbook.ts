import type AvaTool from "./types"
import type { ChatInterviewQuestion } from "@/lib/ava/types"
import { toChatFileAttachment } from "@/lib/ava/chatFileAttachment"
import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import {
  buildMiWorkbook,
  miPayloadFromResolve,
  miWorkbookFilename,
  type MiWorkbookCampaign,
} from "@/lib/specs/buildMiWorkbook"
import {
  applyAnswers,
  type MiAnswer,
  type MiPlanInput,
  type MiResolveResult,
} from "@/lib/specs/resolve"
import { storeMiWorkbookBuffer } from "@/lib/specs/storeMiExport"
import {
  buildMiInterviewPayload,
  buildMiInterviewQuestionCards,
} from "./startMiInterview"
import { asRecord, asString, jsonContent, MI_SCOPE_VERSION_QUESTION_ID, resolveMediaContainerScope, resolveMiVersionScope, resolveScopedMba } from "./helpers"

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function campaignFromLineItems(
  mba: string,
  lineItems: Record<string, unknown[]>,
): MiWorkbookCampaign {
  const first = Object.values(lineItems).flat().find(
    (item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
  )
  return {
    name: text(first?.campaign_name) || text(first?.mp_campaignname) || mba,
    client: text(first?.client_name) || text(first?.client) || text(first?.brand) || "Client",
    prepared_date: new Date().toISOString().slice(0, 10),
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

export type MiWorkbookExportGate =
  | { allow: true; result: MiResolveResult }
  | {
      allow: false
      payload: {
        blocked: true
        openCount: number
        resolvedCount: number
        currentQuestion: ReturnType<typeof buildMiInterviewPayload>["currentQuestion"]
        questionIndex?: number
        questionTotal?: number
        message: string
      }
      questions: ChatInterviewQuestion[]
    }

/**
 * Refuse silent workbook export while interview questions remain unanswered.
 * Pass exportWithGaps: true only when the user explicitly chooses to export with gaps.
 */
export function gateMiWorkbookExport(
  plan: MiPlanInput,
  answers: MiAnswer[] = [],
  options: { exportWithGaps?: boolean } = {},
): MiWorkbookExportGate {
  const result = applyAnswers(plan, answers)
  if (result.summary.open === 0 || options.exportWithGaps === true) {
    return { allow: true, result }
  }

  const interview = buildMiInterviewPayload(plan, answers)
  const questions = buildMiInterviewQuestionCards(plan, answers) ?? []

  return {
    allow: false,
    payload: {
      blocked: true,
      openCount: interview.openCount,
      resolvedCount: interview.resolvedCount,
      currentQuestion: interview.currentQuestion,
      ...(interview.questionIndex != null ? { questionIndex: interview.questionIndex } : {}),
      ...(interview.questionTotal != null ? { questionTotal: interview.questionTotal } : {}),
      message:
        "Interview incomplete — unanswered questions remain. Resume with start_mi_interview (pass every [mi:…] answer so far), or set exportWithGaps: true only when the user explicitly chooses to export with gaps.",
    },
    questions,
  }
}

export const generateMiWorkbookTool: AvaTool = {
  definition: {
    name: "generate_mi_workbook",
    description:
      "Export a material-instructions XLSX workbook for an MBA to private Blob storage. Refuses when unanswered interview questions remain (openCount > 0) unless exportWithGaps is true (user explicitly chose stop / export with gaps). Prefer calling only after openCount is 0. Export-only: answers are not saved back to the media plan. The chat UI shows a download card — confirm briefly (e.g. Workbook ready) and note gaps; do not paste a download URL.",
    input_schema: {
      type: "object",
      properties: {
        mba: {
          type: "string",
          description: "MBA number to export.",
        },
        mbaNumber: {
          type: "string",
          description: "Alias for mba.",
        },
        answers: {
          type: "array",
          description: "Optional interview answers to apply to this export only.",
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
        exportWithGaps: {
          type: "boolean",
          description:
            "Explicit override to export while open interview questions remain (workbook will have NEEDS_SPEC gaps). Set only when the user chooses stop / export with gaps — never by default.",
        },
        versionNumber: {
          type: "number",
          description:
            "Plan version to scope when page context has no versionNumber.",
        },
        mbaWide: {
          type: "boolean",
          description:
            "If true, explicitly scope MBA-wide. Only set after the user chooses MBA-wide when no version is in context.",
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
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return {
        content: "MI workbook export is unavailable: BLOB_READ_WRITE_TOKEN is not configured.",
        isError: true,
      }
    }

    const args = asRecord(input)
    const scopedMba = resolveScopedMba(context, asString(args.mba) ?? asString(args.mbaNumber))
    if (!scopedMba.ok) return { content: scopedMba.error, isError: true }
    if (!scopedMba.mba) {
      return { content: "mba is required to generate an MI workbook.", isError: true }
    }

    try {
      const answers = answersFrom(args)
      const versionScope = resolveMiVersionScope(context, args, answers)
      if (!versionScope.ok) {
        return {
          content: jsonContent({
            ...versionScope.payload,
            message:
              "Which version should this MI workbook use? Enter a version number, or choose MBA-wide for all containers across versions.",
          }),
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
      const planAnswers = answers.filter(
        (answer) => answer.questionId !== MI_SCOPE_VERSION_QUESTION_ID,
      )
      const plan = { lineItems }
      const gate = gateMiWorkbookExport(plan, planAnswers, {
        exportWithGaps: args.exportWithGaps === true,
      })
      if (!gate.allow) {
        return {
          content: jsonContent(gate.payload),
          ...(gate.questions.length > 0 ? { questions: gate.questions } : {}),
          isError: false,
        }
      }

      const result = gate.result
      const campaign = campaignFromLineItems(scopedMba.mba, lineItems)
      const { workbook, gapCount } = await buildMiWorkbook({
        ...miPayloadFromResolve(campaign, result),
        answers: planAnswers,
      })
      const buffer = await workbook.xlsx.writeBuffer()
      const filename = miWorkbookFilename(campaign.client, campaign.name)
      const exportResult = await storeMiWorkbookBuffer(scopedMba.mba, filename, buffer)
      const sizeBytes = buffer instanceof ArrayBuffer ? buffer.byteLength : Buffer.byteLength(buffer as any)

      // App-gated download route streams on click — never embed a raw Blob signed URL.
      const attachment = toChatFileAttachment({
        fileName: exportResult.filename,
        url: `/api/mi/exports/download?path=${encodeURIComponent(exportResult.pathname)}`,
        contentType: XLSX_CONTENT_TYPE,
        sizeBytes,
      })

      return {
        content: jsonContent({
          filename: exportResult.filename,
          gapCount,
          resolvedCount: result.summary.resolved,
          openCount: result.summary.open,
          note:
            "Export only — answers not saved to the plan. A download card is shown in the chat UI — reply briefly (e.g. Workbook ready) and note any remaining gaps; do not paste a download URL or markdown link.",
        }),
        attachments: [attachment],
        isError: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: `Failed to generate MI workbook: ${message}`, isError: true }
    }
  },
}
