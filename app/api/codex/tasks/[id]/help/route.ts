import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { CodexHelpError } from "@/lib/codex/helpRoster"
import { requestHelp } from "@/lib/codex/repo"
import { ASK_HELP_MAX_CHARS } from "@/lib/codex/types"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw } = await context.params
    const id = Number(idRaw)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id is required." },
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
    const assigneeEmail =
      typeof raw.assignee_email === "string" ? raw.assignee_email : ""
    const ask = typeof raw.ask === "string" ? raw.ask : ""
    if (!assigneeEmail.trim()) {
      return NextResponse.json(
        { error: "bad_request", message: "assignee_email is required." },
        { status: 400 }
      )
    }
    if (!ask.trim()) {
      return NextResponse.json(
        { error: "bad_request", message: "ask is required." },
        { status: 400 }
      )
    }
    if (ask.trim().length > ASK_HELP_MAX_CHARS) {
      return NextResponse.json(
        {
          error: "bad_request",
          message: `ask must be ${ASK_HELP_MAX_CHARS} characters or fewer.`,
        },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actorEmail = sessionEmail(auth.session, currentUser?.email)
    if (!actorEmail) {
      return NextResponse.json(
        { error: "no_user", message: "Could not resolve session email." },
        { status: 401 }
      )
    }

    const result = await requestHelp(
      id,
      { assigneeEmail, ask },
      {
        email: actorEmail,
        name:
          typeof currentUser?.name === "string" && currentUser.name.trim()
            ? currentUser.name.trim()
            : null,
      }
    )
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof CodexHelpError) {
      return NextResponse.json(
        { error: error.status === 404 ? "not_found" : "bad_request", message: error.message },
        { status: error.status }
      )
    }
    console.error("Failed to request help on codex task:", error)
    return NextResponse.json(
      {
        error: "Failed to request help",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
