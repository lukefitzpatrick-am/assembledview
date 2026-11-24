import { NextResponse } from "next/server"

import { getDb } from "@/db"
import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { isMelbourneCronHour } from "@/lib/cron/melbourneCrons"
import { isFeatureOn } from "@/lib/features/server"
import { runEnqueue } from "@/lib/siteWatch/worker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60
export const preferredRegion = ["syd1"]

/**
 * Roz (Site Watch): 06:00 Melbourne (19:00 UTC in AEDT, 20:00 in AEST; only
 * the run in the Melbourne 06:00 hour acts). Adds sites for new client
 * websites, queues one run per enabled site, deletes runs older than 90 days.
 * Needs the site_watch switch (Admin > Features), which needs migration 0122.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised", hint: "cron_secret_required" }, { status: 401 })
  }
  if (!(await isFeatureOn("site_watch"))) return NextResponse.json({ skipped: "disabled" })
  if (!isMelbourneCronHour("/api/cron/site-watch-enqueue", new Date())) {
    return NextResponse.json({ skipped: "not_melbourne_0600_hour" })
  }
  try {
    return NextResponse.json({ status: "ok", ...(await runEnqueue(getDb())) })
  } catch (err) {
    console.error("[site-watch-enqueue]", err)
    return NextResponse.json({ status: "error", message: err instanceof Error ? err.message : "enqueue failed" }, { status: 500 })
  }
}
