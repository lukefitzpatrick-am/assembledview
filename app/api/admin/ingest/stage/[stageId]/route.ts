import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { getIngestStage } from "@/lib/mediaplans/ingest/ingestStageStore"
import { summariseIngestReview } from "@/lib/mediaplans/ingest/summariseIngestReview"

export const runtime = "nodejs"

/** Load a staged ingest review (AVA chat deep-link — same upload, not a re-parse). */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ stageId: string }> },
) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    return auth.response
  }

  const { stageId } = await context.params
  const staged = await getIngestStage(stageId)
  if (!staged) {
    return NextResponse.json({ error: "Staged ingest not found" }, { status: 404 })
  }
  const mbaNumber = request.nextUrl.searchParams.get("mba")
  const summary = summariseIngestReview(staged.review, {
    stageId: staged.stageId,
    fileName: staged.fileName,
    mbaNumber,
    sourceFileRetained: staged.sourceFile != null,
  })
  return NextResponse.json({
    review: staged.review,
    stageId: staged.stageId,
    fileName: staged.fileName,
    summary,
    sourceFileRetained: summary.source_file_retained,
  })
}
