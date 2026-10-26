import { billingRevisionToolGate } from "./billingRevisionToolShared"
import { asRecord, jsonContent } from "./helpers"
import type AvaTool from "./types"

export const applyBillingRevisionTool: AvaTool = {
  definition: {
    name: "apply_billing_revision",
    description:
      "Admin only. Publishes the billing revision from a preview. Call only after the user has seen the preview and said yes in chat. Needs the previewToken from preview_billing_revision. Refuses if the plan or its invoices changed since the preview, and then returns a fresh preview to show.",
    input_schema: {
      type: "object",
      properties: {
        confirm: { type: "boolean", description: "Must be true, after an explicit user yes." },
        previewToken: { type: "string" },
      },
      required: ["confirm", "previewToken"],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const gate = await billingRevisionToolGate(context, "apply_billing_revision")
    if (gate) return gate
    const args = asRecord(input)
    if (args.confirm !== true) {
      return { content: "Not applied. Ask the user to confirm the preview first, then call with confirm true.", isError: true }
    }
    if (typeof args.previewToken !== "string" || !args.previewToken) {
      return { content: "Not applied. Run preview_billing_revision first and use its previewToken.", isError: true }
    }
    const { lookupTeamMemberAuditId } = await import("@/lib/auth/teamMemberAuditId")
    const teamMemberId = await lookupTeamMemberAuditId({
      auth0UserId: context.userSub ?? null,
      email: context.userEmail ?? null,
    })
    if (teamMemberId == null || teamMemberId <= 0) {
      return { content: "Could not resolve your team member record for the audit. Use the finance panel instead.", isError: true }
    }
    const svc = await import("@/lib/finance/revisions/revisionService")
    const { previewForModel } = await import("./billingRevisionToolShared")
    const out = await svc.applyRevisionFromToken({
      token: args.previewToken,
      sub: context.userSub!,
      actor: { teamMemberId, name: context.userEmail ?? null, email: context.userEmail ?? null },
    })
    if (!out.ok) {
      return {
        content: jsonContent({
          ok: false,
          code: out.code,
          message: out.message,
          ...(out.freshPreview ? { freshPreview: previewForModel(out.freshPreview) } : {}),
        }),
        isError: true,
      }
    }
    const r = out.result
    return {
      content: jsonContent(
        r.status === "noted"
          ? { ok: true, status: "noted", mba: r.mbaNumber, revisionId: r.revisionId, credits: r.plan.credits, warnings: r.warnings }
          : {
              ok: true,
              status: "published",
              mba: r.mbaNumber,
              revisionId: r.revisionId,
              fromVersion: r.baseVersionNumber,
              toVersion: r.newVersionNumber,
              movedCents: r.plan.movedCents,
              warnings: r.warnings,
              next: "Tell the user the new version number. Months that were approved now need Re-approve on Clients billing.",
            },
      ),
    }
  },
}
