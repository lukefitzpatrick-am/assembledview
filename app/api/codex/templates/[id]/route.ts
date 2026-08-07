import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  deleteTemplate,
  getTemplate,
  updateTemplate,
} from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

function parseId(idRaw: string): number | null {
  const id = Number(idRaw)
  if (!Number.isFinite(id) || id < 1) return null
  return id
}

export async function GET(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw } = await context.params
    const id = parseId(idRaw)
    if (id == null) {
      return NextResponse.json(
        { error: "bad_request", message: "Template id is required." },
        { status: 400 }
      )
    }
    const template = await getTemplate(id)
    if (!template) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(template)
  } catch (error) {
    console.error("Failed to get template:", error)
    return NextResponse.json(
      {
        error: "Failed to load template",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw } = await context.params
    const id = parseId(idRaw)
    if (id == null) {
      return NextResponse.json(
        { error: "bad_request", message: "Template id is required." },
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
    const patch: { name?: string; description?: string | null } = {}
    if ("name" in raw && typeof raw.name === "string") patch.name = raw.name
    if ("description" in raw) {
      patch.description =
        typeof raw.description === "string" ? raw.description : null
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const template = await updateTemplate(id, patch, actor)
    if (!template) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(template)
  } catch (error) {
    console.error("Failed to patch template:", error)
    return NextResponse.json(
      {
        error: "Failed to update template",
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
    const id = parseId(idRaw)
    if (id == null) {
      return NextResponse.json(
        { error: "bad_request", message: "Template id is required." },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const ok = await deleteTemplate(id, actor)
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to delete template:", error)
    return NextResponse.json(
      {
        error: "Failed to delete template",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
