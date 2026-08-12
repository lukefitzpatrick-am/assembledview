import { NextResponse } from "next/server"
import { getTeamWeekTimeSummary } from "@/lib/myhours/timeSummary"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
} from "../../_shared"

export const runtime = "nodejs"

/**
 * GET /api/codex/time/team-week
 * Per roster member: Sydney-week hours + open/overdue task counts + unmapped_count.
 */
export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const summary = await getTeamWeekTimeSummary()
    return NextResponse.json(summary)
  } catch (error) {
    console.error("Failed to load team-week time summary:", error)
    return NextResponse.json(
      {
        error: "Failed to load team-week time",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
