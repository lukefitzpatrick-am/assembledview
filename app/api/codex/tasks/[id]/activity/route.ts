import { NextResponse } from "next/server"
import { getTask, listTaskActivity } from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
} from "../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw } = await context.params
    const taskId = Number(idRaw)
    if (!Number.isFinite(taskId) || taskId < 1) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id is required." },
        { status: 400 }
      )
    }

    // Refuse activity for missing / soft-deleted tasks (same gate as children).
    const task = await getTask(taskId)
    if (!task) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    const items = await listTaskActivity(taskId)
    return NextResponse.json({ items })
  } catch (error) {
    console.error("Failed to list task activity:", error)
    return NextResponse.json(
      {
        error: "Failed to list activity",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
