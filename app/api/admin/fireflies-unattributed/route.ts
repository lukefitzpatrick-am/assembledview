import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/lib/requireRole"
import { codexClientExists } from "@/lib/codex/clientExists"
import { attributeMeeting } from "@/lib/fireflies/attribution"
import type { AssignTarget } from "@/lib/fireflies/assign"
import { summaryFromNoteBody } from "@/lib/fireflies/noteBody"
import { parseFirefliesNotesFilter } from "@/lib/fireflies/notesFilter"
import {
  assignFirefliesNote,
  listFirefliesNotes,
  loadAssignTargets,
  loadAttributionContext,
  loadLatestFirefliesSync,
  publisherExistsForAssign,
} from "@/lib/fireflies/runSync"

export const runtime = "nodejs"

function parseParticipants(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.map((x) => String(x))
  } catch {
    /* comma-separated fallback */
  }
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseAssignTarget(body: {
  target?: unknown
  client_id?: unknown
  publisher_id?: unknown
  attributed_type?: unknown
}): AssignTarget | null {
  const t = body.target
  if (t && typeof t === "object") {
    const rec = t as Record<string, unknown>
    const type = rec.type
    if (type === "client") {
      const clientId = Number(rec.client_id ?? rec.clientId)
      if (!Number.isFinite(clientId)) return null
      return { type: "client", clientId }
    }
    if (type === "publisher") {
      const publisherId = Number(rec.publisher_id ?? rec.publisherId)
      if (!Number.isFinite(publisherId)) return null
      return { type: "publisher", publisherId }
    }
    if (type === "internal") return { type: "internal" }
    if (type === "new_business") return { type: "new_business" }
  }
  const attributed = body.attributed_type
  if (attributed === "internal") return { type: "internal" }
  if (attributed === "new_business") return { type: "new_business" }
  if (attributed === "publisher" || body.publisher_id != null) {
    const publisherId = Number(body.publisher_id)
    if (!Number.isFinite(publisherId)) return null
    return { type: "publisher", publisherId }
  }
  const clientId = Number(body.client_id)
  if (!Number.isFinite(clientId)) return null
  return { type: "client", clientId }
}

/**
 * GET — Fireflies notes by attributed_type filter (default: unattributed queue).
 * POST — assign one note to client / publisher / internal / new_business.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response

  try {
    const filter = parseFirefliesNotesFilter(request.nextUrl.searchParams.get("filter"))
    const [rows, ctx, lastSync, targets] = await Promise.all([
      listFirefliesNotes(filter),
      loadAttributionContext(),
      loadLatestFirefliesSync(),
      loadAssignTargets(),
    ])
    return NextResponse.json({
      filter,
      last_sync: lastSync
        ? {
            cursor_from: lastSync.cursorFrom,
            meetings_seen: lastSync.meetingsSeen,
            notes_created: lastSync.notesCreated,
            unmatched: lastSync.unmatched,
            status: lastSync.status,
            run_finished_at: lastSync.runFinishedAt,
            error: lastSync.error,
          }
        : null,
      targets,
      items: rows.map((r) => {
        const attr = attributeMeeting(
          {
            title: r.title,
            attendeeEmails: parseParticipants(r.participants),
          },
          ctx
        )
        const candidates =
          attr.kind === "unattributed" ? attr.candidates : []
        return {
          id: r.id,
          title: r.title,
          meeting_date: r.meetingDate,
          participants: r.participants,
          transcript_url: r.transcriptUrl,
          duration_seconds: r.durationSeconds,
          body: r.body,
          summary: summaryFromNoteBody(r.body),
          attributed_type: r.attributedType,
          publisher_id: r.publisherId,
          client_id: r.clientId,
          client_name: r.clientName,
          candidate_clients: candidates,
        }
      }),
    })
  } catch (error) {
    console.error("Failed to list Fireflies notes:", error)
    return NextResponse.json(
      {
        error: "Failed to list notes",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response

  try {
    const body = (await request.json()) as {
      note_id?: unknown
      target?: unknown
      client_id?: unknown
      publisher_id?: unknown
      attributed_type?: unknown
    }
    const noteId = Number(body.note_id)
    const target = parseAssignTarget(body)
    if (!Number.isFinite(noteId) || !target) {
      return NextResponse.json(
        {
          error: "bad_request",
          message: "note_id and a valid assign target required",
        },
        { status: 400 }
      )
    }
    if (target.type === "client") {
      if (!(await codexClientExists(target.clientId))) {
        return NextResponse.json(
          { error: "bad_request", message: "client_id does not exist" },
          { status: 400 }
        )
      }
    }
    if (target.type === "publisher") {
      if (!(await publisherExistsForAssign(target.publisherId))) {
        return NextResponse.json(
          { error: "bad_request", message: "publisher_id does not exist" },
          { status: 400 }
        )
      }
    }

    const createdBy =
      typeof auth.session?.user?.email === "string"
        ? auth.session.user.email.trim().toLowerCase()
        : null

    const result = await assignFirefliesNote(noteId, target, { createdBy })
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json({
      ok: true,
      reattributed: result.reattributed,
      would_reattribute: result.reattributed,
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
