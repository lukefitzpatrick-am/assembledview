import { parseRevisionParams } from "@/lib/finance/revisions/revisionParams"

import { billingRevisionToolGate, previewForModel } from "./billingRevisionToolShared"
import { asRecord, jsonContent } from "./helpers"
import type AvaTool from "./types"

export const previewBillingRevisionTool: AvaTool = {
  definition: {
    name: "preview_billing_revision",
    description:
      "Admin only. Preview a billing timing change on the published plan, for example 'bill $100k this month from future months'. Never writes. Returns before and after per line and month, locks, impacts, warnings and a previewToken. Approved (not sent) months are locked unless listed in unlockApprovedMonths; they then need Re-approve. Show the table to the user and ask them to confirm before calling apply_billing_revision.",
    input_schema: {
      type: "object",
      properties: {
        mbaNumber: { type: "string", description: "Defaults to page context. Never invent." },
        mode: {
          type: "string",
          enum: ["bill_amount", "bill_remainder", "pull_month", "underspend", "restore"],
          description: "restore undoes a revision and needs revisionId.",
        },
        intoMonth: { type: "string", description: "YYYY-MM. Default: current Sydney month. A month before the campaign start is a prebill." },
        amount: { type: "number", description: "Dollars ex GST, for bill_amount." },
        strategy: {
          type: "string",
          enum: ["earliest_first", "proportional"],
          description: "Default earliest_first (take from the next months first).",
        },
        fromMonth: { type: "string", description: "YYYY-MM, for pull_month." },
        underspendMonth: { type: "string", description: "YYYY-MM, for underspend." },
        actuals: {
          type: "array",
          description: "Underspend: the actual billed media per line, typed by finance, in dollars.",
          items: {
            type: "object",
            properties: { lineItemId: { type: "string" }, amount: { type: "number" } },
            required: ["lineItemId", "amount"],
            additionalProperties: false,
          },
        },
        noRemaining: {
          type: "array",
          description: "Underspend: for a line with no open month left, last_month or credit (a change-log note only).",
          items: {
            type: "object",
            properties: { lineItemId: { type: "string" }, choice: { type: "string", enum: ["last_month", "credit"] } },
            required: ["lineItemId", "choice"],
            additionalProperties: false,
          },
        },
        unlockApprovedMonths: { type: "array", items: { type: "string" }, description: "Approved, not sent months the user agreed to change (YYYY-MM)." },
        includeProduction: { type: "boolean" },
        feeMode: { type: "string", enum: ["follow", "keep"] },
        revisionId: { type: "number", description: "restore only: the billing revision to undo." },
        reason: { type: "string", description: "Required. Why the timing changes." },
      },
      required: ["mode", "reason"],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const gate = await billingRevisionToolGate(context, "preview_billing_revision")
    if (gate) return gate
    const args = asRecord(input)
    const svc = await import("@/lib/finance/revisions/revisionService")
    const sub = context.userSub!

    if (args.mode === "restore") {
      const revisionId = Number(args.revisionId)
      if (!Number.isInteger(revisionId) || revisionId <= 0) {
        return { content: "restore needs the revisionId to undo.", isError: true }
      }
      const out = await svc.previewUndo({
        revisionId,
        sub,
        source: "ava",
        reason: typeof args.reason === "string" ? args.reason : undefined,
      })
      if (!out.ok) return { content: jsonContent({ ok: false, code: out.code, message: out.message }), isError: true }
      return { content: jsonContent(previewForModel(out)) }
    }

    const parsed = parseRevisionParams(args, {
      currentMonth: svc.currentRevisionMonth(),
      mbaNumber: context.mbaNumber ?? null,
    })
    if (!parsed.ok) return { content: parsed.message, isError: true }
    const out = await svc.previewRevision({ ...parsed.value, source: "ava", sub })
    if (!out.ok) {
      return {
        content: jsonContent({
          ok: false,
          code: out.code,
          message: out.message,
          ...(out.plan?.availableCents != null ? { availableCents: out.plan.availableCents, offer: "Offer to bill the remainder instead (mode bill_remainder)." } : {}),
          ...(out.plan?.choicesNeeded ? { choicesNeeded: out.plan.choicesNeeded } : {}),
          ...(out.plan?.lockedMonths ? { lockedMonths: out.plan.lockedMonths } : {}),
        }),
        isError: true,
      }
    }
    return { content: jsonContent(previewForModel(out)) }
  },
}
