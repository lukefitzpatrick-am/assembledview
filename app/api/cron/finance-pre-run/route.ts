import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { isFinancePeriodsEnabled } from "@/lib/finance/periods/flag"
import { executePreRunSweep } from "@/lib/finance/periods/orchestrate"
import {
  isSydneyPreRunWindow,
  resolveInjectedNow,
} from "@/lib/finance/periods/sydneyClock"

export const dynamic = "force-dynamic"
export const maxDuration = 120
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * PC5 — 14th 06:00 Australia/Sydney pre-run sweep.
 * Vercel UTC schedules fire near the window; Sydney guard decides.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }
  if (!isFinancePeriodsEnabled()) {
    return NextResponse.json({ ok: true, skipped: "FINANCE_PERIODS off" })
  }
  const now = resolveInjectedNow(request)
  const force = new URL(request.url).searchParams.get("force") === "1"
  if (!force && !isSydneyPreRunWindow(now)) {
    return NextResponse.json({
      ok: true,
      skipped: "outside_sydney_pre_run_window",
      now: now.toISOString(),
    })
  }
  try {
    const result = await executePreRunSweep({ now, force: true })
    return NextResponse.json(result)
  } catch (err) {
    console.error("[finance-pre-run]", err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
