import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/lib/requireRole"
import { runAuth0RosterSync } from "@/lib/codex/auth0RosterSync"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Admin-triggered Auth0 → team_members roster sync (CX2-10 Layer 2).
 * Same handler as `/api/cron/auth0-roster-sync`; gate is requireAdmin not CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) return auth.response

  try {
    const result = await runAuth0RosterSync()
    console.log(JSON.stringify({ event: "auth0_roster_sync_admin", ...result }))
    const status =
      result.status === "ok" ? 200 : result.status === "not_configured" ? 200 : 500
    return NextResponse.json(result, { status })
  } catch (err) {
    console.error("[auth0-roster-sync admin] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        seen: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        missingInAuth0: 0,
        noResolvableRole: 0,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
