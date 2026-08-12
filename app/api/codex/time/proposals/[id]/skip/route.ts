import { NextResponse } from "next/server"

import {
  loadTimeEntryProposal,
  updateTimeEntryProposal,
} from "@/lib/myhours/proposalRepo"
import { skipTimeEntryProposal } from "@/lib/myhours/timeEntryProposals"
import {
  codexFlagGuard,
  jsonError,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** POST /api/codex/time/proposals/[id]/skip */
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

  try {
    const result = await skipTimeEntryProposal(proposalId, actorEmail, {
      loadProposal: loadTimeEntryProposal,
      updateProposal: updateTimeEntryProposal,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to skip time-entry proposal:", error)
    return NextResponse.json(
      {
        error: "Failed to skip time-entry proposal",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
