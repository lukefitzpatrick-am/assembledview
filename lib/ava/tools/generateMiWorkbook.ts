import type AvaTool from "./types"
import { toChatFileAttachment } from "@/lib/ava/chatFileAttachment"
import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import {
  buildMiWorkbook,
  miPayloadFromResolve,
  miWorkbookFilename,
  type MiWorkbookCampaign,
} from "@/lib/specs/buildMiWorkbook"
import { applyAnswers, resolveMiPlan, type MiAnswer } from "@/lib/specs/resolve"
import { storeMiWorkbookBuffer } from "@/lib/specs/storeMiExport"
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

export const generateMiWorkbookTool: AvaTool = {
  definition: {
    name: "generate_mi_workbook",
    description:
      "Export a material-instructions XLSX workbook for an MBA to private Blob storage. Use only after the MI interview or when an export is explicitly requested. Export-only: answers are not saved back to the media plan. The chat UI shows a download card — confirm briefly (e.g. Workbook ready) and note gaps; do not paste a download URL.",
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
      const result = planAnswers.length > 0 ? applyAnswers(plan, planAnswers) : resolveMiPlan(plan)
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
