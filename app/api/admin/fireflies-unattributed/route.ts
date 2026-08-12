import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/lib/requireRole"
import { codexClientExists } from "@/lib/codex/clientExists"
import {
  assignFirefliesNote,
  listUnattributedFirefliesNotes,
} from "@/lib/fireflies/runSync"

export const runtime = "nodejs"

/**
 * GET — unattributed Fireflies notes (client_id null, not internal).
 * POST — { note_id, client_id } assign + learn domains (MR-5).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) return auth.response

  try {
    const rows = await listUnattributedFirefliesNotes()
    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        meeting_date: r.meetingDate,
        participants: r.participants,
        transcript_url: r.transcriptUrl,
        duration_seconds: r.durationSeconds,
        body: r.body,
      })),
    })
  } catch (error) {
    console.error("Failed to list unattributed Fireflies notes:", error)
    return NextResponse.json(
      {
        error: "Failed to list unattributed notes",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) return auth.response

  try {
    const body = (await request.json()) as {
      note_id?: unknown
      client_id?: unknown
    }
    const noteId = Number(body.note_id)
    const clientId = Number(body.client_id)
    if (!Number.isFinite(noteId) || !Number.isFinite(clientId)) {
      return NextResponse.json(
        { error: "bad_request", message: "note_id and client_id required" },
        { status: 400 }
      )
    }
    if (!(await codexClientExists(clientId))) {
      return NextResponse.json(
        { error: "bad_request", message: "client_id does not exist" },
        { status: 400 }
      )
    }

    const result = await assignFirefliesNote(noteId, clientId)
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json({
      ok: true,
      reattributed: result.reattributed,
    })
  } catch (error) {
    console.error("Failed to assign Fireflies note:", error)
    return NextResponse.json(
      {
        error: "Failed to assign note",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
