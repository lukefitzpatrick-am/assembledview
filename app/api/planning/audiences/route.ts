import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import {
  createPlanningAudience,
  listPlanningAudiences,
  XanoPlanningAudienceError,
} from "@/lib/planning/xanoPlanningAudiences"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function xanoErrorResponse(error: unknown): NextResponse {
  if (error instanceof XanoPlanningAudienceError) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Xano unauthorized" }, { status: 401 })
    }
    if (error.status === 500 && error.message.includes("XANO_API_KEY")) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  console.error("[api/planning/audiences]", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

/**
 * GET /api/planning/audiences?clients_id= — list saved audiences (optional client filter).
 * Gate: admin | manager.
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  try {
    const raw = request.nextUrl.searchParams.get("clients_id")
    let clientsId: number | undefined
    if (raw != null && raw.trim() !== "") {
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(
          { error: "clients_id must be a positive number" },
          { status: 400 }
        )
      }
      clientsId = n
    }
    const rows = await listPlanningAudiences({ clientsId })
    return NextResponse.json(rows)
  } catch (error) {
    return xanoErrorResponse(error)
  }
}

/**
 * POST /api/planning/audiences — save an audience definition for a client.
 * Gate: admin | manager.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

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

  const clients_id = typeof o.clients_id === "number" ? o.clients_id : Number(o.clients_id)
  if (!Number.isFinite(clients_id) || clients_id <= 0) {
    return NextResponse.json({ error: "clients_id is required" }, { status: 400 })
  }

  const name = typeof o.name === "string" ? o.name.trim() : ""
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  if (o.definition_json == null || typeof o.definition_json !== "object") {
    return NextResponse.json(
      { error: "definition_json is required" },
      { status: 400 }
    )
  }

  const composed_wc =
    typeof o.composed_wc === "number" ? o.composed_wc : Number(o.composed_wc)
  if (!Number.isFinite(composed_wc)) {
    return NextResponse.json({ error: "composed_wc is required" }, { status: 400 })
  }

  const sessionEmail =
    typeof gate.session?.user?.email === "string" ? gate.session.user.email.trim() : ""
  const created_by_email =
    typeof o.created_by_email === "string" && o.created_by_email.trim()
      ? o.created_by_email.trim()
      : sessionEmail
  if (!created_by_email) {
    return NextResponse.json(
      { error: "created_by_email could not be resolved from session" },
      { status: 400 }
    )
  }

  try {
    const row = await createPlanningAudience({
      clients_id,
      mba_number:
        o.mba_number == null || o.mba_number === ""
          ? null
          : String(o.mba_number),
      name,
      definition_json: o.definition_json,
      composed_wc,
      client_visible: false,
      created_by_email,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    return xanoErrorResponse(error)
  }
}
