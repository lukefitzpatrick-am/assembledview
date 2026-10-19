import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { PREVIEW_NIGHTLY_DAYS } from "@/lib/creative/previews/core"
import { runCreativePreviewCache } from "@/lib/creative/previews/job"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300
export const preferredRegion = ["syd1"]

/**
 * 17:00 UTC daily. That is 04:00 Melbourne in AEDT and 03:00 in AEST.
 * Copies Meta and TikTok preview images (last 30 days of delivery) into
 * private Blob. Does nothing until 0098 and 0102 are applied.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  try {
    const result = await runCreativePreviewCache({ days: PREVIEW_NIGHTLY_DAYS, confirm: true })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Creative preview cache failed"
    console.error("[creative-previews]", err)
    return NextResponse.json({ status: "error", message }, { status: 500 })
  }
}
