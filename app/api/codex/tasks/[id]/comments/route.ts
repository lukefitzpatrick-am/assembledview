import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
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
  const flag = codexFlagGuard()
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
  const flag = codexFlagGuard()
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
