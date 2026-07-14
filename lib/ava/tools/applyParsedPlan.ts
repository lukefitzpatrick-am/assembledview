import type AvaTool from "./types"
import type { AutopopulateChannel } from "@/lib/ava/autopopulate/types"
import { mapperResultToFormItems } from "@/lib/ava/autopopulate/toFormLineItems"

export const applyParsedPlanTool: AvaTool = {
  definition: {
    name: "apply_parsed_plan",
    description:
      "After the user explicitly confirms, load the pending AVA-parsed media-owner plan into the create/edit form (radio or ooh line items). Do NOT call until the user confirms. Never writes to Xano — only the form for human review.",
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
      return { content: "apply_parsed_plan requires confirm: true.", isError: true }
    }
    const confirm = (input as Record<string, unknown>).confirm
    if (confirm !== true) {
      return {
        content:
          "apply_parsed_plan refused: confirm must be true. Summarise the parse and wait for the user to say confirm.",
        isError: true,
      }
    }

    const pending = context.pendingParsedPlan
    if (!pending?.mapped) {
      return {
        content:
          "No pending parsed plan in this turn. Ask the user to re-upload the xlsx via AVA attach.",
        isError: true,
      }
    }

    const channel = pending.channel as AutopopulateChannel
    if (channel !== "radio" && channel !== "ooh") {
      return { content: "Pending plan channel must be radio or ooh.", isError: true }
    }

    const replace = (input as Record<string, unknown>).replace !== false
    const items = mapperResultToFormItems(pending.mapped, channel)
    if (items.length === 0) {
      return {
        content:
          "Pending parse produced no applyable line items (all flagged for review or empty).",
        isError: true,
      }
    }

    context.capturedLineItemsLoad = { channel, items, replace }

    return {
      content: `Validated load of ${items.length} ${channel} line item(s) into the form (${replace ? "replace" : "append"}). Client will apply for human review — not saved to Xano yet.`,
      isError: false,
    }
  },
}
