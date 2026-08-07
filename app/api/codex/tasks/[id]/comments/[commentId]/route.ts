import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { deleteComment } from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; commentId: string }> }

function parseId(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

export async function DELETE(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

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
    console.error("Failed to delete comment:", error)
    return NextResponse.json(
      {
        error: "Failed to delete comment",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
