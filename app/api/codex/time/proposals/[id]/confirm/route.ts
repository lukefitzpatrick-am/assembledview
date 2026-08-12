import { NextResponse } from "next/server"

import { MyHoursClient } from "@/lib/myhours/client"
import { ensureClientCampaignStructure } from "@/lib/myhours/ensureOneStructure"
import {
  listMyHoursLinks,
  listSameDayTimeEntries,
  loadTimeEntryProposal,
  loadTimeEntryProposalContext,
  saveMyHoursLink,
  updateTimeEntryProposal,
} from "@/lib/myhours/proposalRepo"
import { confirmTimeEntryProposal } from "@/lib/myhours/timeEntryProposals"
import {
  codexFlagGuard,
  jsonError,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** POST /api/codex/time/proposals/[id]/confirm */
export async function POST(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  const actorEmail = sessionEmail(auth.session)
  if (!actorEmail) return jsonError(400, "email_required")

  const { id: rawId } = await context.params
  const proposalId = Number(rawId)
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    return jsonError(400, "invalid_id")
  }

  const client = new MyHoursClient({
    getApiKey: () => process.env.MYHOURS_API_KEY?.trim() ?? "",
  })

  try {
    const result = await confirmTimeEntryProposal(proposalId, actorEmail, {
      loadProposal: loadTimeEntryProposal,
      updateProposal: updateTimeEntryProposal,
      listUsers: () => client.listUsers(),
      ensureStructure: async (proposal) => {
        const proposalContext = await loadTimeEntryProposalContext(proposal.id)
        if (
          !proposalContext ||
          proposalContext.clientId == null ||
          !proposalContext.clientName?.trim()
        ) {
          return {
            ok: false,
            reason: `no client mapping for time-entry proposal ${proposal.id}`,
          }
        }
        return ensureClientCampaignStructure({
          clientId: proposalContext.clientId,
          clientName: proposalContext.clientName,
          mbaNumber: proposalContext.mbaNumber,
          campaignName: proposalContext.campaignName,
          client,
          loadLinks: listMyHoursLinks,
          saveLink: saveMyHoursLink,
        })
      },
      listSameDayEntries: listSameDayTimeEntries,
      createTimeLog: (input) => client.createTimeLog(input),
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to confirm time-entry proposal:", error)
    return NextResponse.json(
      {
        error: "Failed to confirm time-entry proposal",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
