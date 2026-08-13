import { NextResponse } from "next/server"
import { dismissAutoCreatedTask } from "@/lib/fireflies/proposalRepo"
import {
  codexFlagGuard,
  jsonError,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../_shared"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/codex/tasks/[id]/dismiss-auto
 * Soft-deletes an auto-created meeting task and records the dismissal
 * as an assignment_rules training signal. Inbox badge is unchanged.
 */
export async function POST(request: Request, context: Ctx) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  const email = sessionEmail(auth.session)
  if (!email) return jsonError(400, "email_required")

  const { id: rawId } = await context.params
  const taskId = Number(rawId)
  if (!Number.isFinite(taskId) || taskId <= 0) {
    return jsonError(400, "invalid_id")
  }

  try {
    const result = await dismissAutoCreatedTask(taskId, email)
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "not_auto_created" ||
              result.error === "already_deleted"
            ? 409
            : 400
      return jsonError(status, result.error)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to dismiss auto-created task:", error)
    return NextResponse.json(
      {
        error: "Failed to dismiss auto-created task",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
