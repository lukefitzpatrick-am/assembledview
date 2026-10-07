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

function parseReplaceItems(
  raw: unknown
): Array<{ id?: number; label: string }> | NextResponse {
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "invalid", field: "items", message: "items must be an array." },
      { status: 400 }
    )
  }
  const items: Array<{ id?: number; label: string }> = []
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return NextResponse.json(
        {
          error: "invalid",
          field: "items",
          message: `items[${index}] must be an object.`,
        },
        { status: 400 }
      )
    }
    const row = entry as Record<string, unknown>
    const item: { id?: number; label: string } = {
      label: typeof row.label === "string" ? row.label : "",
    }
    if (row.id != null && row.id !== "") {
      const id = Number(row.id)
      if (!Number.isInteger(id) || id < 1) {
        return NextResponse.json(
          {
            error: "invalid",
            field: "items",
            message: `items[${index}].id must be a positive integer.`,
          },
          { status: 400 }
        )
      }
      item.id = id
    }
    items.push(item)
  }
  return items
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

export async function PUT(request: Request, context: RouteContext) {
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
    const name = typeof raw.name === "string" ? raw.name.trim() : ""
    if (!name) {
      return NextResponse.json(
        { error: "bad_request", message: "name is required." },
        { status: 400 }
      )
    }
    const items = parseReplaceItems(raw.items)
    if (items instanceof NextResponse) return items

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const template = await updateTemplate(
      id,
      {
        name,
        description:
          typeof raw.description === "string" ? raw.description : null,
        items,
      },
      actor
    )
    if (!template) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(template)
  } catch (error) {
    if (error instanceof Error && error.name === "TemplateLabelError") {
      return NextResponse.json(
        { error: "invalid", field: "items", message: error.message },
        { status: 400 }
      )
    }
    console.error("Failed to replace template:", error)
    return NextResponse.json(
      {
        error: "Failed to update template",
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
