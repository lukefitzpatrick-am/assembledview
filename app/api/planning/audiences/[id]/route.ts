import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { resolveAudiencePatchInput } from "@/lib/planning/clientSafeAudienceShared"
import {
  getPlanningAudience,
  updatePlanningAudience,
  XanoPlanningAudienceError,
} from "@/lib/planning/xanoPlanningAudiences"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

function xanoErrorResponse(error: unknown): NextResponse {
  if (error instanceof XanoPlanningAudienceError) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Xano unauthorized" }, { status: 401 })
    }
    if (error.status === 404) {
      return NextResponse.json({ error: "Audience not found" }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  console.error("[api/planning/audiences/[id]]", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

/**
 * PATCH /api/planning/audiences/[id]
 * Whitelist: mba_number | client_visible | name.
 * Detach (mba_number null/empty) forces client_visible = false server-side.
 * Gate: admin | manager.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  const { id: idRaw } = await context.params
  const id = Number(idRaw)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid audience id" }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 })
  }
  const o = body as Record<string, unknown>

  const allowed = new Set(["mba_number", "client_visible", "name"])
  for (const key of Object.keys(o)) {
    if (!allowed.has(key)) {
      return NextResponse.json(
        { error: `Field "${key}" is not patchable` },
        { status: 400 }
      )
    }
  }

  const patchInput: {
    mba_number?: string | null
    client_visible?: boolean
    name?: string
  } = {}
  if ("mba_number" in o) {
    patchInput.mba_number =
      o.mba_number == null || o.mba_number === ""
        ? null
        : String(o.mba_number)
  }
  if ("client_visible" in o) {
    if (typeof o.client_visible !== "boolean") {
      return NextResponse.json(
        { error: "client_visible must be a boolean" },
        { status: 400 }
      )
    }
    patchInput.client_visible = o.client_visible
  }
  if ("name" in o) {
    if (typeof o.name !== "string" || !o.name.trim()) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 })
    }
    patchInput.name = o.name.trim()
  }

  const patch = resolveAudiencePatchInput(patchInput)
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No patchable fields provided" }, { status: 400 })
  }

  try {
    if (patch.client_visible === true) {
      const existing = await getPlanningAudience(id)
      const nextMba =
        "mba_number" in patch ? patch.mba_number : existing.mba_number
      if (nextMba == null || String(nextMba).trim() === "") {
        return NextResponse.json(
          { error: "Attach an MBA before making the audience visible to the client" },
          { status: 400 }
        )
      }
    }

    const row = await updatePlanningAudience(id, patch)
    return NextResponse.json(row)
  } catch (error) {
    return xanoErrorResponse(error)
  }
}
