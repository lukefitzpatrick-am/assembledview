import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  createTemplateItem,
  listTemplateItems,
  reorderTemplateItems,
} from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../_shared"

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
    const templateId = parseId(idRaw)
    if (templateId == null) {
      return NextResponse.json(
        { error: "bad_request", message: "Template id is required." },
        { status: 400 }
      )
    }
    const items = await listTemplateItems(templateId)
    return NextResponse.json({ items })
  } catch (error) {
    console.error("Failed to list template items:", error)
    return NextResponse.json(
      {
        error: "Failed to list template items",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw } = await context.params
    const templateId = parseId(idRaw)
    if (templateId == null) {
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
    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)

    if (Array.isArray(raw.ordered_ids)) {
      const orderedIds = raw.ordered_ids.map(Number).filter(Number.isFinite)
      if (orderedIds.length !== raw.ordered_ids.length) {
        return NextResponse.json(
          {
            error: "bad_request",
            message: "ordered_ids must be an array of numbers.",
          },
          { status: 400 }
        )
      }
      try {
        const items = await reorderTemplateItems(templateId, orderedIds, actor)
        if (!items) {
          return NextResponse.json({ error: "not_found" }, { status: 404 })
        }
        return NextResponse.json({ items })
      } catch (err) {
        if (
          err instanceof Error &&
          /permutation of template item ids/i.test(err.message)
        ) {
          return NextResponse.json(
            { error: "bad_request", message: err.message },
            { status: 400 }
          )
        }
        throw err
      }
    }

    const label = typeof raw.label === "string" ? raw.label.trim() : ""
    if (!label) {
      return NextResponse.json(
        { error: "bad_request", message: "label is required." },
        { status: 400 }
      )
    }
    const item = await createTemplateItem(templateId, { label }, actor)
    if (!item) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error("Failed to create/reorder template item:", error)
    return NextResponse.json(
      {
        error: "Failed to update template items",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
