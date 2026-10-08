import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/lib/requireRole"
import {
  loadReportRunForGenerate,
  markReportRunGenerating,
} from "@/lib/reports/adminReportRunsStore"
import { generateCampaignReportForMba } from "@/lib/reports/campaignReport/generateCampaignReportForMba"
import {
  saveFailedReportRun,
  saveGeneratedReportRun,
  saveSkippedReportRun,
} from "@/lib/reports/reportsWorkerStore"
import { trimReportRunError } from "@/lib/reports/runReportsWorker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300
export const preferredRegion = ["syd1"]

const MISSING_FILE = "Report was generated without a stored file."

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Generates one report_runs row now. Attempts are not incremented, so a
 * manual run does not use up the worker's three-attempt cap.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  const { id } = await context.params
  if (!id.trim()) {
    return NextResponse.json({ error: "Report run id is required" }, { status: 400 })
  }

  const row = await loadReportRunForGenerate(id)
  if (!row) {
    return NextResponse.json({ error: "Report run not found" }, { status: 404 })
  }

  await markReportRunGenerating(row.id)

  try {
    const result = await generateCampaignReportForMba({
      mbaNumber: row.mbaNumber,
      period: { kind: "custom", start: row.periodStart, end: row.periodEnd },
      store: true,
      withCommentary: true,
    })

    if (result.skipped) {
      await saveSkippedReportRun(row.id, result.skipped)
      return NextResponse.json({
        id: row.id,
        status: "skipped",
        skipReason: result.skipped,
      })
    }

    if (!result.blobPathname) {
      await saveFailedReportRun(row.id, MISSING_FILE)
      return NextResponse.json(
        { id: row.id, status: "failed", error: MISSING_FILE },
        { status: 500 },
      )
    }

    await saveGeneratedReportRun(row.id, {
      blobPathname: result.blobPathname,
      fileName: result.fileName,
      commentaryGenerated: result.commentaryGenerated,
    })
    return NextResponse.json({
      id: row.id,
      status: "generated",
      fileName: result.fileName,
      blobPathname: result.blobPathname,
      commentaryGenerated: result.commentaryGenerated,
    })
  } catch (error) {
    const message = trimReportRunError(error)
    try {
      await saveFailedReportRun(row.id, message)
    } catch (saveError) {
      console.error("[admin/reports/generate] save failed", saveError)
    }
    return NextResponse.json(
      { id: row.id, status: "failed", error: message },
      { status: 500 },
    )
  }
}
