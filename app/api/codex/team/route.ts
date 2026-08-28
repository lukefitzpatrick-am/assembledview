import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  isAuth0ManagementClientConfigured,
  listAllAuth0UsersUnpaged,
} from "@/lib/api/auth0Management"
import { createTeamMember, listRosterLoginRows, listTeamMembers, listEmailAliasCollisions } from "@/lib/codex/repo"
import { AliasCollisionError } from "@/lib/codex/rosterAliasGuard"
import { rosterEmailsNeverLoggedIn } from "@/lib/codex/rosterLoginCheck"
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
    let neverLoggedIn: string[] = []
    let aliasCollisions: Awaited<ReturnType<typeof listEmailAliasCollisions>> = []
    try {
      if (isAuth0ManagementClientConfigured()) {
        const [roster, users] = await Promise.all([
          listRosterLoginRows(),
          listAllAuth0UsersUnpaged(),
        ])
        neverLoggedIn = rosterEmailsNeverLoggedIn(roster, users)
      }
    } catch (err) {
      console.warn("[auth0-roster-login] never-logged-in fail-soft:", err)
    }
    try {
      aliasCollisions = await listEmailAliasCollisions()
    } catch (err) {
      console.warn("[roster-alias] collision report fail-soft:", err)
    }
    return NextResponse.json({
      ...data,
      never_logged_in: neverLoggedIn,
      alias_collisions: aliasCollisions,
    })
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
        ...(Array.isArray(raw.email_aliases)
          ? {
              emailAliases: raw.email_aliases.filter(
                (x): x is string => typeof x === "string"
              ),
            }
          : {}),
      },
      actor
    )
    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    if (error instanceof AliasCollisionError) {
      return NextResponse.json(
        { error: "alias_collision", message: error.message },
        { status: 409 }
      )
    }
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
