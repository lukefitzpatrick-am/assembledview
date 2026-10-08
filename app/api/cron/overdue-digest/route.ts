import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runOverdueDigest } from "@/lib/finance/overdueDigest"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60
export const preferredRegion = ["syd1"]

/**
 * 01:30 UTC = 12:30 AEDT or 11:30 AEST, Monday to Friday, after the nightly
 * Xero sync (00:15-01:00 UTC) so payments received that morning are already counted.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  try {
    const result = await runOverdueDigest()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Overdue digest failed"
    console.error("[overdue-digest]", err)
    return NextResponse.json({ status: "error", message }, { status: 500 })
  }
}
