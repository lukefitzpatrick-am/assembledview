import { NextResponse } from "next/server"
import {
  batchAcceptForNote,
  listProposedInbox,
} from "@/lib/fireflies/proposalRepo"
import { clampPage, clampPerPage } from "@/lib/codex/queryHelpers"
import {
  codexFlagGuard,
  jsonError,
  requireCodexInternalAccess,
  sessionEmail,
} from "../_shared"

export const runtime = "nodejs"

/**
 * GET /api/codex/proposals — Inbox of proposed meeting action items (paginated by meeting).
 * POST /api/codex/proposals — batch accept: { note_id } or { action: "batch_accept", note_id }
 */
export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const page = clampPage(Number(url.searchParams.get("page")))
  const perPage = clampPerPage(Number(url.searchParams.get("per_page") ?? 20))

  try {
    const inbox = await listProposedInbox(undefined, { page, perPage })
    return NextResponse.json(inbox)
  } catch (error) {
    console.error("Failed to list proposals:", error)
    return NextResponse.json(
      {
        error: "Failed to list proposals",
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

  const email = sessionEmail(auth.session)
  if (!email) return jsonError(400, "email_required")

  let body: { note_id?: number; action?: string }
  try {
    body = (await request.json()) as { note_id?: number; action?: string }
  } catch {
    return jsonError(400, "invalid_json")
  }

  const noteId = Number(body.note_id)
  if (!Number.isFinite(noteId) || noteId <= 0) {
    return jsonError(400, "note_id_required")
  }

  try {
    const result = await batchAcceptForNote(noteId, email)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to batch-accept proposals:", error)
    return NextResponse.json(
      {
        error: "Failed to batch-accept proposals",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
