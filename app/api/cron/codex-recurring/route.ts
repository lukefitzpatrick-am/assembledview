import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runCodexRecurring } from "@/lib/codex/runRecurring"
import { expireStaleProposals } from "@/lib/fireflies/proposalRepo"

export const dynamic = "force-dynamic"
export const maxDuration = 120
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Daily Codex retainer generation (Sydney calendar).
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 * Idempotent: (seed task id, period) — safe to re-run the same Sydney day.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  try {
    // Optional clock injection for local simulation: ?now=2026-08-29T10:00:00+10:00
    let now = new Date()
    try {
      const url = new URL(request.url)
      const q = url.searchParams.get("now")
      if (q) {
        const parsed = new Date(q)
        if (!Number.isNaN(parsed.getTime())) now = parsed
      }
    } catch {
      // ignore
    }

    const result = await runCodexRecurring(now)
    const proposalsExpired = await expireStaleProposals({ now })
    const body = { ...result, proposalsExpired }
    console.log(
      JSON.stringify({
        event: "codex_recurring",
        ...body,
      })
    )
    return NextResponse.json(body, {
      status: result.status === "error" ? 500 : 200,
    })
  } catch (err) {
    console.error("[codex-recurring] fatal", err)
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
