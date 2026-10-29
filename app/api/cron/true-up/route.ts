import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { resolveInjectedNow } from "@/lib/finance/periods/sydneyClock"
import { runTrueUpMonthly } from "@/lib/finance/trueUp/monthlyRun"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300
export const preferredRegion = ["syd1"]

/**
 * Monthly true-up (T10): 07:00 Sydney on the 2nd. Vercel calls at 20:00 and
 * 21:00 UTC on the 1st (AEDT and AEST); the route runs only inside the Sydney
 * window, once per as-of month. Needs TRUE_UP, TRUE_UP_CRON and 0109.
 * `?force=1` skips the window check (still once per month).
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised", hint: "cron_secret_required" }, { status: 401 })
  }
  try {
    const force = new URL(request.url).searchParams.get("force") === "1"
    const result = await runTrueUpMonthly({ now: resolveInjectedNow(request), source: "cron", force })
    return NextResponse.json(result)
  } catch (err) {
    console.error("[true-up-run]", err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
