import type AvaTool from "./types"
import { executeIngestAccept } from "@/lib/mediaplans/ingest/executeIngestAccept"

export const acceptIngestProposalTool: AvaTool = {
  definition: {
    name: "accept_ingest_proposal",
    description:
      "After the user explicitly confirms in chat, accept the staged publisher-schedule ingest into the named MBA via the same Hub accept path (savePlanVersion). Never guess the MBA. A money-gate block (file total Δ > 0.5%) refuses with the delta and does not write. Do NOT call until the user confirms.",
    input_schema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true. Require an explicit user confirm in chat first.",
        },
        mbaNumber: {
          type: "string",
          description:
            "MBA to attach the schedule to. Omit only when page context already has it. Never invent an MBA.",
        },
      },
      required: ["confirm"],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return {
        content: "accept_ingest_proposal requires confirm: true.",
        isError: true,
      }
    }
    const body = input as Record<string, unknown>
    const mbaFromInput =
      typeof body.mbaNumber === "string" ? body.mbaNumber.trim() : ""
    const mba = mbaFromInput || context.mbaNumber?.trim() || ""
    const stageId = context.pendingIngest?.stageId?.trim()
    const uploadedBy = context.userEmail?.trim().toLowerCase() || null

    const result = await executeIngestAccept({
      stageId,
      mbaNumber: mba || undefined,
      uploadedBy,
      confirm: body.confirm === true,
      fileName: context.pendingIngest?.fileName ?? null,
    })

    if (!result.ok) {
      return { content: result.error, isError: true }
    }

    return {
      content: `Accepted ingest: ${result.lineCount} line item(s), ${result.panelCount} panel(s) into MBA ${mba} v${result.versionNumber}.`,
      isError: false,
    }
  },
}
