import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { codexClientExists } from "@/lib/codex/clientExists"
import { softDeleteTask, updateTask } from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

const PATCH_ALLOWLIST = [
  "title",
  "description",
  "status",
  "priority",
  "assignee_email",
  "assignee_name",
  "due_date",
  "mba_number",
  "category",
  "client_visible",
  "client_id",
] as const

export async function PATCH(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw } = await context.params
    const id = Number(idRaw)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id is required." },
        { status: 400 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON body." },
        { status: 400 }
      )
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "bad_request", message: "Expected an object body." },
        { status: 400 }
      )
    }

    const raw = body as Record<string, unknown>
    const patch: Parameters<typeof updateTask>[1] = {}
    for (const key of PATCH_ALLOWLIST) {
      if (!(key in raw)) continue
      const v = raw[key]
      switch (key) {
        case "title":
          if (typeof v === "string" && v.trim()) patch.title = v.trim()
          break
        case "description":
          patch.description = typeof v === "string" ? v : null
          break
        case "status":
          if (typeof v === "string") patch.status = v
          break
        case "priority":
          patch.priority = typeof v === "string" ? v : null
          break
        case "assignee_email":
          // Repo is the only normalisation point — pass the raw string through.
          patch.assigneeEmail = typeof v === "string" ? v : null
          break
        case "assignee_name":
          patch.assigneeName = typeof v === "string" ? v : null
          break
        case "due_date":
          patch.dueDate = typeof v === "string" ? v : null
          break
        case "mba_number":
          patch.mbaNumber = typeof v === "string" ? v : null
          break
        case "category":
          patch.category = typeof v === "string" ? v : null
          break
        case "client_visible":
          if (typeof v === "boolean") patch.clientVisible = v
          break
        case "client_id": {
          const clientIdNum = Number(v)
          if (!Number.isFinite(clientIdNum) || clientIdNum < 1) {
            return NextResponse.json(
              {
                error: "bad_request",
                message: "client_id must be a positive integer.",
              },
              { status: 400 }
            )
          }
          if (!(await codexClientExists(clientIdNum))) {
            return NextResponse.json(
              {
                error: "bad_request",
                message: `client_id ${clientIdNum} does not exist.`,
              },
              { status: 400 }
            )
          }
          patch.clientId = clientIdNum
          break
        }
      }
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const task = await updateTask(id, patch, actor)
    if (!task) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(task)
  } catch (error) {
    console.error("Failed to patch codex task:", error)
    return NextResponse.json(
      {
        error: "Failed to update task",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw } = await context.params
    const id = Number(idRaw)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id is required." },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const ok = await softDeleteTask(id, actor)
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to delete codex task:", error)
    return NextResponse.json(
      {
        error: "Failed to delete task",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
