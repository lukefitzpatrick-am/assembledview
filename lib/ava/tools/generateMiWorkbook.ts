import type AvaTool from "./types"
import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import {
  buildMiWorkbook,
  miPayloadFromResolve,
  miWorkbookFilename,
  type MiWorkbookCampaign,
} from "@/lib/specs/buildMiWorkbook"
import { applyAnswers, resolveMiPlan, type MiAnswer } from "@/lib/specs/resolve"
import { storeMiWorkbookBuffer } from "@/lib/specs/storeMiExport"
import { asRecord, asString, jsonContent, resolveScopedMba } from "./helpers"

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
      "Export a material-instructions XLSX workbook for an MBA to private Blob storage. Use only after the MI interview or when an export is explicitly requested. Export-only: answers are not saved back to the media plan.",
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
      const lineItems = await fetchAllMediaContainerLineItems(scopedMba.mba)
      const plan = { lineItems }
      const result = answers.length > 0 ? applyAnswers(plan, answers) : resolveMiPlan(plan)
      const campaign = campaignFromLineItems(scopedMba.mba, lineItems)
      const { workbook, gapCount } = await buildMiWorkbook({
        ...miPayloadFromResolve(campaign, result),
        answers,
      })
      const buffer = await workbook.xlsx.writeBuffer()
      const filename = miWorkbookFilename(campaign.client, campaign.name)
      const exportResult = await storeMiWorkbookBuffer(scopedMba.mba, filename, buffer)

      return {
        content: jsonContent({
          ...exportResult,
          gapCount,
          resolvedCount: result.summary.resolved,
          openCount: result.summary.open,
          note: "Export only — answers not saved to the plan",
        }),
        isError: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: `Failed to generate MI workbook: ${message}`, isError: true }
    }
  },
}
