import type AvaTool from "./types"
import { jsonContent } from "./helpers"
import { lookupIngestStage } from "@/lib/mediaplans/ingest/ingestStageStore"
import { summariseIngestReview } from "@/lib/mediaplans/ingest/summariseIngestReview"

export const getPendingIngestReviewTool: AvaTool = {
  definition: {
    name: "get_pending_ingest_review",
    description:
      "Read the staged publisher-schedule ingest review for this turn (publisher, confidence, media type, counts, required coverage, money delta, ignored/unmapped). Numbers come from the Hub ingest engine — never invent them. Call this after the user attaches an xlsx. Does not write.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  async execute(_input, context) {
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
    const summary = summariseIngestReview(looked.staged.review, {
      stageId,
      fileName: context.pendingIngest?.fileName ?? looked.staged.fileName,
    })
    return { content: jsonContent(summary), isError: false }
  },
}
