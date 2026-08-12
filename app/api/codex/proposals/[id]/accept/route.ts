import { NextResponse } from "next/server"
import {
  acceptProposal,
  type AcceptEdits,
} from "@/lib/fireflies/proposalRepo"
import {
  codexFlagGuard,
  jsonError,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../_shared"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/codex/proposals/[id]/accept
 * Body optional edits for edit-then-accept.
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

  let edits: AcceptEdits | null = null
  try {
    const text = await request.text()
    if (text.trim()) {
      const body = JSON.parse(text) as Record<string, unknown>
      edits = {}
      if (typeof body.title === "string") edits.title = body.title
      if ("description" in body) {
        edits.description =
          body.description == null ? null : String(body.description)
      }
      if ("client_id" in body || "clientId" in body) {
        const v = body.client_id ?? body.clientId
        edits.clientId = v == null ? null : Number(v)
      }
      if ("mba_number" in body || "mbaNumber" in body) {
        const v = body.mba_number ?? body.mbaNumber
        edits.mbaNumber = v == null ? null : String(v)
      }
      if ("assignee_email" in body || "assigneeEmail" in body) {
        const v = body.assignee_email ?? body.assigneeEmail
        edits.assigneeEmail = v == null ? null : String(v)
      }
      if ("category" in body) {
        edits.category = body.category == null ? null : String(body.category)
      }
      if ("due_date" in body || "dueDate" in body) {
        const v = body.due_date ?? body.dueDate
        edits.dueDate = v == null ? null : String(v)
      }
      if (Object.keys(edits).length === 0) edits = null
    }
  } catch {
    return jsonError(400, "invalid_json")
  }

  try {
    const result = await acceptProposal(proposalId, email, edits)
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "not_proposed"
            ? 409
            : 400
      return jsonError(status, result.error)
    }
    return NextResponse.json({
      ok: true,
      task_id: result.taskId,
      possible_duplicate: result.possibleDuplicate,
    })
  } catch (error) {
    console.error("Failed to accept proposal:", error)
    return NextResponse.json(
      {
        error: "Failed to accept proposal",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
