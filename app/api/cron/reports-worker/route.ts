import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { generateCampaignReportForMba } from "@/lib/reports/campaignReport/generateCampaignReportForMba"
import {
  claimNextReportRun,
  resetStuckReportRuns,
  saveFailedReportRun,
  saveGeneratedReportRun,
  saveSkippedReportRun,
} from "@/lib/reports/reportsWorkerStore"
import { isMonthlyReportEnqueueDay } from "@/lib/reports/selectMonthlyReportMbas"
import {
  reportsWorkerBatchSize,
  runReportsWorker,
} from "@/lib/reports/runReportsWorker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300
export const preferredRegion = ["syd1"]

/**
 * Hourly at :20 UTC on the 3rd, 4th and 5th. That window covers the Sydney
 * 4th and 5th. Hours that fall on the Sydney 3rd or 6th return
 * outside_window. `AUTO_REPORTS_ENABLED` must be the string `true`.
 * Do not run until migration 0095 is applied.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  if (process.env.AUTO_REPORTS_ENABLED !== "true") {
    return NextResponse.json({ skipped: "disabled" })
  }

  if (!isMonthlyReportEnqueueDay(getMelbourneTodayISO())) {
    return NextResponse.json({ skipped: "outside_window" })
  }

  try {
    const summary = await runReportsWorker({
      batch: reportsWorkerBatchSize(process.env.REPORTS_WORKER_BATCH),
      resetStuck: resetStuckReportRuns,
      claimOne: claimNextReportRun,
      generate: (input) => generateCampaignReportForMba(input),
      saveGenerated: saveGeneratedReportRun,
      saveSkipped: saveSkippedReportRun,
      saveFailed: saveFailedReportRun,
    })
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reports worker failed"
    console.error("[reports-worker]", err)
    return NextResponse.json({ status: "error", message }, { status: 500 })
  }
}
