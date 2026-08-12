import { NextResponse } from "next/server"
import { dismissProposal } from "@/lib/fireflies/proposalRepo"
import {
  codexFlagGuard,
  jsonError,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../_shared"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/codex/proposals/[id]/dismiss
 * Records rejected + who + when (training signal later). Never creates a task.
 */
export async function POST(request: Request, context: Ctx) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  const email = sessionEmail(auth.session)
  if (!email) return jsonError(400, "email_required")

  const { id: rawId } = await context.params
  const proposalId = Number(rawId)
  if (!Number.isFinite(proposalId) || proposalId <= 0) {
    return jsonError(400, "invalid_id")
  }

  try {
    const result = await dismissProposal(proposalId, email)
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "not_proposed"
            ? 409
            : 400
      return jsonError(status, result.error)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to dismiss proposal:", error)
    return NextResponse.json(
      {
        error: "Failed to dismiss proposal",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
