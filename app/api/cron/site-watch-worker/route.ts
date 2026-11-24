import { NextResponse } from "next/server"

import { getDb } from "@/db"
import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { isFeatureOn } from "@/lib/features/server"
import { runWorker } from "@/lib/siteWatch/worker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300
export const preferredRegion = ["syd1"]

/**
 * Roz (Site Watch) worker: every 5 minutes from 19:00 to 22:55 UTC (the
 * Melbourne morning in AEDT and AEST). Claims queued runs one at a time and
 * scans for up to 240 s; an unfinished run resumes on the next call. A run
 * with Critical changes emails the ops list once. Idle calls return at once.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised", hint: "cron_secret_required" }, { status: 401 })
  }
  if (!(await isFeatureOn("site_watch"))) return NextResponse.json({ skipped: "disabled" })
  try {
    return NextResponse.json({ status: "ok", ...(await runWorker(getDb())) })
  } catch (err) {
    console.error("[site-watch-worker]", err)
    return NextResponse.json({ status: "error", message: err instanceof Error ? err.message : "worker failed" }, { status: 500 })
  }
}
