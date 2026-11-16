import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { deleteComment } from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
  hiddenTaskGuard,
  writeFailureResponse,
} from "../../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; commentId: string }> }

function parseId(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

export async function DELETE(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const hidden = await hiddenTaskGuard(context, auth.session)
  if (hidden) return hidden

  try {
    const { id: idRaw, commentId: commentRaw } = await context.params
    const taskId = parseId(idRaw)
    const commentId = parseId(commentRaw)
    if (taskId == null || commentId == null) {
      return NextResponse.json(
        {
          error: "bad_request",
          message: "Task id and comment id are required.",
        },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const ok = await deleteComment(taskId, commentId, actor)
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return writeFailureResponse(error, "Failed to delete comment:", "Failed to delete comment")
  }
}
