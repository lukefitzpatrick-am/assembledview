import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { updateTeamMember } from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

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
        { error: "bad_request", message: "Team member id is required." },
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

    const member = await updateTeamMember(
      id,
      {
        email: typeof raw.email === "string" ? raw.email : undefined,
        name: typeof raw.name === "string" ? raw.name : undefined,
        roleTitle:
          "role_title" in raw
            ? typeof raw.role_title === "string"
              ? raw.role_title
              : null
            : undefined,
        active: typeof raw.active === "boolean" ? raw.active : undefined,
        capacityNotes:
          "capacity_notes" in raw
            ? typeof raw.capacity_notes === "string"
              ? raw.capacity_notes
              : null
            : undefined,
        workingStyle:
          "working_style" in raw
            ? typeof raw.working_style === "string"
              ? raw.working_style
              : null
            : undefined,
        defaultClientIds: Array.isArray(raw.default_client_ids)
          ? raw.default_client_ids.map(Number).filter(Number.isFinite)
          : undefined,
      },
      actor
    )
    if (!member) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(member)
  } catch (error) {
    console.error("Failed to update team member:", error)
    return NextResponse.json(
      {
        error: "Failed to update team member",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
