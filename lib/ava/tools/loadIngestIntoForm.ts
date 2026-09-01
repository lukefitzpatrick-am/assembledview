import type AvaTool from "./types"
import { ingestReviewToFormLineItems } from "@/lib/mediaplans/ingest/toFormLineItems"
import { lookupIngestStage } from "@/lib/mediaplans/ingest/ingestStageStore"

function asFormItems(items: unknown[]): Record<string, unknown>[] {
  return items.flatMap((row) =>
    row !== null && typeof row === "object" && !Array.isArray(row)
      ? [row as Record<string, unknown>]
      : [],
  )
}

export const loadIngestIntoFormTool: AvaTool = {
  definition: {
    name: "load_ingest_into_form",
    description:
      "Loads the staged publisher schedule into the create/edit form for human review. Writes nothing. Requires an explicit user confirm first — do not call until the user confirms.",
    input_schema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true. Require an explicit user confirm in chat first.",
        },
        replace: {
          type: "boolean",
          description:
            "When true (default), replace existing lines in the channel. When false, append.",
        },
      },
      required: ["confirm"],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return { content: "load_ingest_into_form requires confirm: true.", isError: true }
    }
    const confirm = (input as Record<string, unknown>).confirm
    if (confirm !== true) {
      return {
        content:
          "load_ingest_into_form refused: confirm must be true. Summarise the review and wait for the user to say confirm.",
        isError: true,
      }
    }

    const stageId = context.pendingIngest?.stageId?.trim()
    if (!stageId) {
      return {
        content:
          "There's no schedule attached in this chat. Drop the xlsx here and I'll review it.",
        isError: true,
      }
    }

    const looked = await lookupIngestStage(stageId)
    if (!looked.ok) {
      if (looked.reason === "expired") {
        return {
          content:
            "That schedule review isn't available — it was only held for 24 hours. That's not something you did. Attach the file again and I'll pick it up.",
          isError: true,
          ingestStageMissing: true,
        }
      }
      return {
        content:
          "That schedule review isn't available. That's not something you did. Attach the file again and I'll pick it up.",
        isError: true,
        ingestStageMissing: true,
      }
    }

    const converted = ingestReviewToFormLineItems(looked.staged.review)
    const items = asFormItems(converted.items)
    if (items.length === 0) {
      return {
        content:
          "That schedule didn't produce line items to load into the form. Attach the file again if you still need it.",
        isError: true,
      }
    }

    const replace = (input as Record<string, unknown>).replace !== false
    context.capturedLineItemsLoad = {
      channel: converted.channel,
      items,
      replace,
    }

    const skipped =
      converted.skipped.length > 0
        ? ` ${converted.skipped.length} leftover row(s) weren't loaded — they're listed as ignored.`
        : ""
    return {
      content: `${items.length} ${converted.channel} line item(s) are in the form for you to review. Nothing has been saved.${skipped}`,
      isError: false,
    }
  },
}
