import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runMyHoursSyncToPostgres } from "@/lib/myhours/runSync"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * MyHours structure ensure + activity pull → time_entries.
 * Auth: CRON_SECRET. Env: MYHOURS_API_KEY.
 * On 401 the run fails with "API key invalid or rotated" (no auth retry).
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  try {
    const result = await runMyHoursSyncToPostgres()
    console.log(
      JSON.stringify({
        event: "myhours_sync",
        status: result.status,
        entries_upserted: result.entriesUpserted,
        structures_created: result.structuresCreated,
        unmapped_count: result.unmappedCount,
        unknown_user_count: result.unknownUserCount,
        date_from: result.dateFrom,
        date_to: result.dateTo,
        error: result.error ?? null,
      })
    )
    return NextResponse.json(result, {
      status: result.status === "ok" ? 200 : 207,
    })
  } catch (err) {
    console.error("[myhours-sync] fatal", err)
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
