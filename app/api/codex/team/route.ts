import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { createTeamMember, listTeamMembers } from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../_shared"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const url = new URL(request.url)
    const activeOnly = url.searchParams.get("active") !== "0"
    const data = await listTeamMembers({
      activeOnly,
      page: Number(url.searchParams.get("page") || 1),
      perPage: Number(url.searchParams.get("per_page") || 100),
    })
    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to list team members:", error)
    return NextResponse.json(
      {
        error: "Failed to list team",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON body." },
        { status: 400 }
      )
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "bad_request", message: "Expected an object body." },
        { status: 400 }
      )
    }
    const raw = body as Record<string, unknown>
    const email = typeof raw.email === "string" ? raw.email.trim() : ""
    const name = typeof raw.name === "string" ? raw.name.trim() : ""
    if (!email || !name) {
      return NextResponse.json(
        { error: "bad_request", message: "email and name are required." },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const member = await createTeamMember(
      {
        email,
        name,
        roleTitle: typeof raw.role_title === "string" ? raw.role_title : null,
        active: typeof raw.active === "boolean" ? raw.active : true,
        capacityNotes:
          typeof raw.capacity_notes === "string" ? raw.capacity_notes : null,
        workingStyle:
          typeof raw.working_style === "string" ? raw.working_style : null,
        defaultClientIds: Array.isArray(raw.default_client_ids)
          ? raw.default_client_ids.map(Number).filter(Number.isFinite)
          : undefined,
      },
      actor
    )
    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    console.error("Failed to create team member:", error)
    return NextResponse.json(
      {
        error: "Failed to create team member",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
