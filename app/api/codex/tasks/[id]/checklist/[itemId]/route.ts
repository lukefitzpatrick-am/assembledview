import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  deleteChecklistItem,
  updateChecklistItem,
} from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

function parseId(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

export async function PATCH(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw, itemId: itemRaw } = await context.params
    const taskId = parseId(idRaw)
    const itemId = parseId(itemRaw)
    if (taskId == null || itemId == null) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id and item id are required." },
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
    const patch: { label?: string; done?: boolean } = {}
    if ("label" in raw) {
      if (typeof raw.label !== "string" || !raw.label.trim()) {
        return NextResponse.json(
          { error: "bad_request", message: "label must be a non-empty string." },
          { status: 400 }
        )
      }
      patch.label = raw.label.trim()
    }
    if ("done" in raw) {
      if (typeof raw.done !== "boolean") {
        return NextResponse.json(
          { error: "bad_request", message: "done must be a boolean." },
          { status: 400 }
        )
      }
      patch.done = raw.done
    }
    if (patch.label === undefined && patch.done === undefined) {
      return NextResponse.json(
        { error: "bad_request", message: "Provide label and/or done." },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const item = await updateChecklistItem(taskId, itemId, patch, actor)
    if (!item) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (error) {
    console.error("Failed to patch checklist item:", error)
    return NextResponse.json(
      {
        error: "Failed to update checklist item",
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
    const { id: idRaw, itemId: itemRaw } = await context.params
    const taskId = parseId(idRaw)
    const itemId = parseId(itemRaw)
    if (taskId == null || itemId == null) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id and item id are required." },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const ok = await deleteChecklistItem(taskId, itemId, actor)
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to delete checklist item:", error)
    return NextResponse.json(
      {
        error: "Failed to delete checklist item",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
