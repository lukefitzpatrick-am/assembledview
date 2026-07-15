import type AvaTool from "./types"
import {
  applyAdjustLineItemOps,
  formatAdjustDiffSummary,
  parseAdjustOps,
  parseAdjustScope,
} from "@/lib/ava/lineItems/applyAdjustOps"

export const adjustLineItemsTool: AvaTool = {
  definition: {
    name: "adjust_line_items",
    description:
      "Bulk-align descriptor fields on already-loaded plan line items (radio/ooh) from structured ops. Emit ops only — never set or compute burst money/dates/quantities. Call once with confirm:false to preview a diff summary, then again with confirm:true after the user agrees. Client applies via setLineItems (not saved to Xano yet).",
    input_schema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: ["radio", "ooh"],
          description: "Which channel's loaded line items to adjust.",
        },
        ops: {
          type: "array",
          description:
            "Structured descriptor ops: setField | clearField | copyField | moveField. No money/dates/quantities.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["setField", "clearField", "copyField", "moveField"],
              },
              field: { type: "string" },
              value: {},
              fromField: { type: "string" },
              toField: { type: "string" },
            },
            required: ["type"],
            additionalProperties: false,
          },
        },
        scope: {
          description:
            'Which rows: string "all" (default), or object { where: { field, equals } }, { isBonus: true }, or { rowIndexes: number[] }.',
        },
        confirm: {
          type: "boolean",
          description:
            "false/omit = preview diff only. true = apply to the form after explicit user confirm (never skip).",
        },
        replace: {
          type: "boolean",
          description: "When confirming, replace channel lines (default true).",
        },
      },
      required: ["channel", "ops"],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return { content: "adjust_line_items requires channel + ops.", isError: true }
    }
    const body = input as Record<string, unknown>
    const channel = body.channel
    if (channel !== "radio" && channel !== "ooh") {
      return { content: "channel must be radio or ooh.", isError: true }
    }

    const ops = parseAdjustOps(body.ops)
    if (!ops) {
      return {
        content: "ops must be a non-empty list of setField/clearField/copyField/moveField.",
        isError: true,
      }
    }

    const scope = parseAdjustScope(body.scope ?? "all")
    if (scope === null) {
      return {
        content:
          'Invalid scope. Use "all", { where: { field, equals } }, { isBonus: true }, or { rowIndexes: number[] }.',
        isError: true,
      }
    }

    const bag = context.currentLineItems
    const source = bag?.[channel]
    if (!Array.isArray(source)) {
      return {
        content:
          "No current line items for this channel on the page. Open create/edit media plan with lines loaded (e.g. after apply_parsed_plan), then retry.",
        isError: true,
      }
    }
    if (source.length === 0) {
      return {
        content: `No ${channel} line items loaded to adjust.`,
        isError: true,
      }
    }

    const result = applyAdjustLineItemOps(source, ops, scope)
    const diff = formatAdjustDiffSummary(result)

    // All ops blocked (e.g. pure money instruction)
    if (result.summaryParts.length === 0 && result.blockedOps.length > 0) {
      return {
        content: [
          "Refused: those ops only touch money/dates/quantities or unknown fields.",
          "Edit budgets/quantities in the grid (per-cell or bulk burst edit), not via adjust_line_items.",
          result.blockedOps.join("; "),
        ].join("\n"),
        isError: true,
      }
    }

    const confirm = body.confirm === true
    if (!confirm) {
      return {
        content: [
          "Preview (not applied yet):",
          diff,
          "Ask the user to confirm, then call again with confirm: true.",
        ].join("\n"),
        isError: false,
      }
    }

    const replace = body.replace !== false
    context.capturedLineItemsLoad = {
      channel,
      items: result.items,
      replace,
    }

    return {
      content: [
        `Validated adjust of ${result.matchedCount} ${channel} line item(s) (${replace ? "replace" : "append"}).`,
        diff,
        "Client will apply for human review — not saved to Xano yet.",
      ].join("\n"),
      isError: false,
    }
  },
}
