import { NextResponse } from "next/server"
import { dismissAllProposedForNote } from "@/lib/fireflies/proposalRepo"
import {
  codexFlagGuard,
  jsonError,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../_shared"

export const runtime = "nodejs"

/**
 * POST /api/codex/proposals/dismiss-all
 * One UPDATE of every `proposed` row for `{ note_id }` — full set, not the loaded page.
 * Same rejected + training semantics as single dismiss. Never creates a task.
 */
export async function POST(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  const email = sessionEmail(auth.session)
  if (!email) return jsonError(400, "email_required")

  let body: { note_id?: number }
  try {
    body = (await request.json()) as { note_id?: number }
  } catch {
    return jsonError(400, "invalid_json")
  }

  const noteId = Number(body.note_id)
  if (!Number.isFinite(noteId) || noteId <= 0) {
    return jsonError(400, "note_id_required")
  }

  try {
    const result = await dismissAllProposedForNote(noteId, email)
    if (!result.ok) {
      return jsonError(400, result.error)
    }
    return NextResponse.json({ ok: true, dismissed: result.dismissed })
  } catch (error) {
    console.error("Failed to dismiss-all proposals:", error)
    return NextResponse.json(
      {
        error: "Failed to dismiss proposals",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
