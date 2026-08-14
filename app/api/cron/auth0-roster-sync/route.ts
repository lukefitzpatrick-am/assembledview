import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runAuth0RosterSync } from "@/lib/codex/auth0RosterSync"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Auth0 → team_members full roster sync.
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 * Unconfigured Management API returns 200 `{ status: "not_configured" }` — never a crash.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  try {
    const result = await runAuth0RosterSync()
    console.log(JSON.stringify({ event: "auth0_roster_sync", ...result }))
    const status =
      result.status === "ok" ? 200 : result.status === "not_configured" ? 200 : 500
    return NextResponse.json(result, { status })
  } catch (err) {
    console.error("[auth0-roster-sync] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        seen: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        missingInAuth0: 0,
        noResolvableRole: 0,
        treatedAsAdminByDomainRule: 0,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
