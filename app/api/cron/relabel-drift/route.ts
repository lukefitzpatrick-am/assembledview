import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runDataQualitySweep } from "@/lib/dataQuality/sources.server"
import { runRelabelDriftCheck } from "@/lib/pacing/relabel/listRelabelDrift"
import { logJob } from "@/lib/log"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Compare active LINE_ITEM_LABEL_MAP rows with applied delivery_relabels.
 * Auth: CRON_SECRET. Cron: 15 21 * * * (07:15 Melbourne, after the portfolio snapshot).
 * Then the Data quality sweep (S17, switch data_quality_queue): it runs even
 * when the drift check fails, and then leaves relabel items as they are. With
 * unmatched_delivery_queue on it also reads the unmatched delivery queue (S5b).
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  const asOfDate = getMelbourneTodayISO()

  let snapshot: Awaited<ReturnType<typeof runRelabelDriftCheck>> | null = null
  let failure: unknown = null
  try {
    snapshot = await runRelabelDriftCheck(asOfDate)
  } catch (err) {
    failure = err
  }
  const dataQuality = await runDataQualitySweep(snapshot?.findings ?? null).catch((err: unknown) => {
    console.error("[cron/relabel-drift] data quality sweep failed", err)
    return null
  })
  if (dataQuality) logJob(JSON.stringify({ event: "data_quality_sweep", asOfDate, ...dataQuality }))

  if (!snapshot) {
    console.error("[cron/relabel-drift] fatal", failure)
    return NextResponse.json(
      {
        status: "error",
        message: failure instanceof Error ? failure.message : String(failure),
      },
      { status: 500 },
    )
  }
  const summary = {
    status: "ok",
    asOfDate: snapshot.asOfDate,
    legacyCount: snapshot.legacyCount,
    driftCount: snapshot.driftCount,
    findingCount: snapshot.findings.length,
    durationMs: snapshot.durationMs,
    generatedAt: snapshot.generatedAt,
  }
  logJob(JSON.stringify({ event: "relabel_drift_check", ...summary }))
  return NextResponse.json(summary)
}

export async function POST(request: Request) {
  return GET(request)
}
