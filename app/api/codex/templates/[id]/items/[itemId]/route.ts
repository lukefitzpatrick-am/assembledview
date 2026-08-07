import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  deleteTemplateItem,
  updateTemplateItem,
} from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

function parseId(idRaw: string): number | null {
  const id = Number(idRaw)
  if (!Number.isFinite(id) || id < 1) return null
  return id
}

export async function PATCH(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw, itemId: itemIdRaw } = await context.params
    const templateId = parseId(idRaw)
    const itemId = parseId(itemIdRaw)
    if (templateId == null || itemId == null) {
      return NextResponse.json(
        { error: "bad_request", message: "Template and item ids are required." },
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
    const patch: { label?: string } = {}
    if (typeof raw.label === "string") patch.label = raw.label

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const item = await updateTemplateItem(templateId, itemId, patch, actor)
    if (!item) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (error) {
    console.error("Failed to patch template item:", error)
    return NextResponse.json(
      {
        error: "Failed to update template item",
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
    const { id: idRaw, itemId: itemIdRaw } = await context.params
    const templateId = parseId(idRaw)
    const itemId = parseId(itemIdRaw)
    if (templateId == null || itemId == null) {
      return NextResponse.json(
        { error: "bad_request", message: "Template and item ids are required." },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const ok = await deleteTemplateItem(templateId, itemId, actor)
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to delete template item:", error)
    return NextResponse.json(
      {
        error: "Failed to delete template item",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
