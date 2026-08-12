import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runFirefliesSyncToPostgres } from "@/lib/fireflies/runSync"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Pull Fireflies transcripts since stored cursor → client_notes.
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 * Env: FIREFLIES_API_KEY
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  try {
    const result = await runFirefliesSyncToPostgres()
    console.log(
      JSON.stringify({
        event: "fireflies_sync",
        status: result.status,
        meetings_seen: result.meetingsSeen,
        notes_created: result.notesCreated,
        notes_skipped: result.notesSkipped,
        unmatched: result.unmatched,
        domains_seeded: result.domainsSeeded,
        cursor_from: result.cursorFrom,
      })
    )
    return NextResponse.json(result, {
      status: result.status === "ok" ? 200 : 207,
    })
  } catch (err) {
    console.error("[fireflies-sync] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
