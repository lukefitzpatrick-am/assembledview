import { NextResponse } from "next/server"
import { resolveAssigneeForWrite } from "@/lib/codex/assigneeWrite"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { CodexHelpError } from "@/lib/codex/helpRoster"
import { HELP_ON_DONE_MESSAGE, requestHelp } from "@/lib/codex/repo"
import { ASK_HELP_MAX_CHARS } from "@/lib/codex/types"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
  hiddenTaskGuard,
  writeFailureResponse,
} from "../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const hidden = await hiddenTaskGuard(context, auth.session)
  if (hidden) return hidden

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

    // The helper by alias (F16, switch): the main email, or 409 for a shared address.
    const helper = await resolveAssigneeForWrite(assigneeEmail, null)
    if (!helper.ok) return NextResponse.json(helper.body, { status: helper.status })

    // codex_projects (B42, C-230 and C-240): the helper's task records the
    // asker as assigned by (My Work) and, like create, the helper follows it
    // and (codex_notifications) is told. Off: as before.
    const projectsOn = await isCodexProjectsEnabled()
    const result = await requestHelp(
      id,
      { assigneeEmail: helper.email, ask },
      {
        email: actorEmail,
        name:
          typeof currentUser?.name === "string" && currentUser.name.trim()
            ? currentUser.name.trim()
            : null,
      },
      undefined,
      { trackAssignedBy: projectsOn }
    )
    if (projectsOn) {
      const { afterTaskWrite } = await import("@/lib/codex/notify")
      await afterTaskWrite(actorEmail, new Map(), [Number(result.child.id)], { created: true })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof CodexHelpError) {
      const code =
        error.code ??
        (error.status === 404
          ? "not_found"
          : error.status === 409
            ? "helper_no_access"
            : error.message === HELP_ON_DONE_MESSAGE
              ? "invalid"
              : "bad_request")
      return NextResponse.json(
        { error: code, message: error.message },
        { status: error.status }
      )
    }
    return writeFailureResponse(error, "Failed to request help on codex task:", "Failed to request help")
  }
}
