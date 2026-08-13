import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/lib/requireRole"
import { runFirefliesSyncToPostgres } from "@/lib/fireflies/runSync"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Admin-triggered Fireflies sync. Same handler as the cron, admin gate not CRON_SECRET.
 * Optional body: { lookbackDays?: number } — used only when no cursor exists (default 60).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) return auth.response

  let lookbackDays: number | undefined
  try {
    const body = (await request.json().catch(() => null)) as {
      lookbackDays?: unknown
    } | null
    if (body?.lookbackDays != null) {
      const n = Number(body.lookbackDays)
      if (Number.isFinite(n)) lookbackDays = n
    }
  } catch {
    /* empty body is fine */
  }

  try {
    const result = await runFirefliesSyncToPostgres({ lookbackDays })
    console.log(
      JSON.stringify({
        event: "fireflies_sync_admin",
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
    console.error("[fireflies-sync admin] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
