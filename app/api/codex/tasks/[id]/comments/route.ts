import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { isCodexNotificationsEnabled, isCodexProjectsEnabled, isCodexRosterAliasesEnabled } from "@/lib/codex/flag"
import { isProjectsUnavailable, PROJECT_FAILURE_STATUS } from "@/lib/codex/projectFailureStatus"
import { createComment, listComments } from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

function parseTaskId(idRaw: string): number | null {
  const id = Number(idRaw)
  if (!Number.isFinite(id) || id < 1) return null
  return id
}

export async function GET(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw } = await context.params
    const taskId = parseTaskId(idRaw)
    if (taskId == null) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id is required." },
        { status: 400 }
      )
    }

    // codex_projects (B41): comments carry their mentions, and a private
    // project's task is not found for someone who cannot see it. Before 0118,
    // or with the switch off, as before. The store loads only with the switch on.
    if (await isCodexProjectsEnabled()) {
      const viewer = sessionEmail(auth.session)
      if (!viewer) return NextResponse.json({ error: "unauthorised" }, { status: 401 })
      try {
        const { listCommentsWithMentions } = await import("@/lib/codex/collabRepo")
        const result = await listCommentsWithMentions(taskId, viewer)
        if (!result.ok) return NextResponse.json({ error: "not_found" }, { status: 404 })
        return NextResponse.json({ items: result.items })
      } catch (err) {
        if (!isProjectsUnavailable(err)) throw err
      }
    }
    const items = await listComments(taskId)
    return NextResponse.json({ items })
  } catch (error) {
    console.error("Failed to list comments:", error)
    return NextResponse.json(
      {
        error: "Failed to list comments",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id: idRaw } = await context.params
    const taskId = parseTaskId(idRaw)
    if (taskId == null) {
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
    const commentBody = typeof raw.body === "string" ? raw.body.trim() : ""
    if (!commentBody) {
      return NextResponse.json(
        { error: "bad_request", message: "body is required." },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const authorName =
      typeof raw.author_name === "string"
        ? raw.author_name
        : currentUser?.name ?? null

    // codex_projects (B41): @mentions are parsed here from the body (a
    // `mentions` key in the request is never read), stored, and the author and
    // the people mentioned follow the task; with codex_notifications on they
    // are told. Tokens that match two people, no one, or someone who cannot
    // see a private project stay text and come back in `unresolved_mentions`.
    // Before 0118 the comment saves as before.
    if (actor && (await isCodexProjectsEnabled())) {
      try {
        const [{ createCommentWithMentions }, { loadRosterPeople }, { unresolvedMentionMessage }] = await Promise.all([
          import("@/lib/codex/collabRepo"),
          import("@/lib/codex/rosterRead"),
          import("@/lib/codex/mentions"),
        ])
        const [roster, aliases, notify] = await Promise.all([
          loadRosterPeople(),
          isCodexRosterAliasesEnabled(),
          isCodexNotificationsEnabled(),
        ])
        const result = await createCommentWithMentions(taskId, {
          body: commentBody,
          authorEmail: actor,
          authorName,
          roster,
          aliases,
          notify,
        })
        if (!result.ok) {
          return NextResponse.json(
            { error: result.reason === "task_not_found" ? "not_found" : result.reason, message: result.message },
            { status: PROJECT_FAILURE_STATUS[result.reason] ?? 409 }
          )
        }
        return NextResponse.json(
          {
            ...result.comment,
            unresolved_mentions: result.unresolved.map((u) => ({ ...u, message: unresolvedMentionMessage(u) })),
          },
          { status: 201 }
        )
      } catch (err) {
        if (!isProjectsUnavailable(err)) throw err
      }
    }

    // Stage 1: person comments only (`author_kind: user`). AVA path is Stage 4.
    const comment = await createComment(
      taskId,
      {
        body: commentBody,
        authorEmail: actor,
        authorName,
        authorKind: "user",
      },
      actor
    )
    if (!comment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    console.error("Failed to create comment:", error)
    return NextResponse.json(
      {
        error: "Failed to create comment",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
