import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { getAsOfDate } from "@/lib/pacing/maths"
import { runRelabelDriftCheck } from "@/lib/pacing/relabel/listRelabelDrift"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Compare active LINE_ITEM_LABEL_MAP rows with applied delivery_relabels.
 * Auth: CRON_SECRET. Cron: 15 21 * * * (07:15 Melbourne, after the portfolio snapshot).
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  const asOfDate = getAsOfDate()

  try {
    const snapshot = await runRelabelDriftCheck(asOfDate)
    const summary = {
      status: "ok",
      asOfDate: snapshot.asOfDate,
      legacyCount: snapshot.legacyCount,
      driftCount: snapshot.driftCount,
      findingCount: snapshot.findings.length,
      durationMs: snapshot.durationMs,
      generatedAt: snapshot.generatedAt,
    }
    console.log(JSON.stringify({ event: "relabel_drift_check", ...summary }))
    return NextResponse.json(summary)
  } catch (err) {
    console.error("[cron/relabel-drift] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
