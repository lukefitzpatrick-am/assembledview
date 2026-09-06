import type AvaTool from "./types"
import {
  INGEST_CHANNEL_LABEL,
  ingestChannelWillSwitchOn,
  type IngestLoadChannel,
} from "@/lib/ava/applyIngestLineItemsLoad"
import { recordIngestRun } from "@/lib/mediaplans/ingest/ingestRuns"
import { lookupIngestStage } from "@/lib/mediaplans/ingest/ingestStageStore"
import { ingestReviewToFormLineItems } from "@/lib/mediaplans/ingest/toFormLineItems"
import { evaluateRequiredFieldGate } from "@/lib/mediaplans/ingest/templateCoverage"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"

const MONEY_BLOCK_FALLBACK =
  "Money total is outside the 0.5% gate. Nothing was written."

function asFormItems(items: unknown[]): Record<string, unknown>[] {
  return items.flatMap((row) =>
    row !== null && typeof row === "object" && !Array.isArray(row)
      ? [row as Record<string, unknown>]
      : [],
  )
}

function requiredCoverageFrom(
  coverage: IngestReviewPackage["template_coverage"],
): number | null {
  if (!coverage) return null
  return coverage.required_count > 0
    ? coverage.required_matched / coverage.required_count
    : coverage.completeness
}

async function recordMoneyBlockedRun(args: {
  review: IngestReviewPackage
  fileName: string | null
  uploadedBy: string | null
  recon: IngestProposal["reconciliation"]
  reason: string
}): Promise<void> {
  await recordIngestRun({
    publisherId: null,
    publisherName: args.review.detected_publisher,
    fileName: args.fileName,
    uploadedBy: args.uploadedBy,
    detectedConfidence: args.review.publisher_confidence,
    requiredCoverage: requiredCoverageFrom(args.review.template_coverage),
    lineItemCount: args.recon.line_item_count ?? 0,
    panelCount: args.recon.panel_count ?? 0,
    burstCount: args.recon.burst_count ?? 0,
    moneyDelta: args.recon.delta ?? null,
    outcome: "blocked",
    outcomeReason: args.reason,
    acceptedVersionId: null,
  })
}

export const loadIngestIntoFormTool: AvaTool = {
  definition: {
    name: "load_ingest_into_form",
    description:
      "Loads the staged publisher schedule into the create/edit form for human review. Writes nothing. Requires an explicit user confirm first — do not call until the user confirms. Refuses when the money total is outside the 0.5% gate, a required template field has no source column, or a sourced controlled value is still unanswered.",
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

    const review = looked.staged.review
    const recon = review.proposal?.reconciliation
    if (recon && recon.accept_ok === false) {
      const reason = recon.block_reason ?? MONEY_BLOCK_FALLBACK
      await recordMoneyBlockedRun({
        review,
        fileName: looked.staged.fileName,
        uploadedBy: context.userEmail?.trim().toLowerCase() || null,
        recon,
        reason,
      })
      return {
        content: reason,
        isError: true,
        block_reason: reason,
        delta: recon.delta ?? null,
      }
    }

    const gate = evaluateRequiredFieldGate(
      review.template_coverage ?? { required: [], waivers: [] },
    )
    if (!gate.ok) {
      if (gate.unresolvedValues.length > 0) {
        return {
          content: gate.reason ?? "Answer the value card before loading.",
          isError: true,
        }
      }
      const named = gate.missing.join(", ")
      return {
        content: `These fields have no source column, so the schedule wasn't loaded: ${named}. Answer the mapping cards and I'll load it.`,
        isError: true,
      }
    }

    const converted = ingestReviewToFormLineItems(review)
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
      ingestStageId: looked.staged.stageId,
    }

    const enabled =
      context.pageContext?.entities?.enabledMediaTypes ??
      context.enabledMediaTypes
    const channel = converted.channel as IngestLoadChannel
    const label = INGEST_CHANNEL_LABEL[channel] ?? converted.channel
    const willSwitchOn = ingestChannelWillSwitchOn(enabled, channel)
    const switchClause = willSwitchOn
      ? ` The ${label} channel is off on this plan and will be switched on.`
      : ""
    const skipped =
      converted.skipped.length > 0
        ? ` ${converted.skipped.length} leftover row(s) weren't loaded — they're listed as ignored.`
        : ""
    return {
      content: `${items.length} ${label} line item(s) are in the form for you to review.${switchClause} Nothing has been saved.${skipped}`,
      isError: false,
    }
  },
}
