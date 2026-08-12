import { NextResponse } from "next/server"

import { addSydneyDays } from "@/lib/codex/quickAddParse"
import { listTimeEntryProposalsForWeek } from "@/lib/myhours/proposalRepo"
import { sydneyWeekRange } from "@/lib/myhours/sydneyWeek"
import {
  codexFlagGuard,
  jsonError,
  requireCodexInternalAccess,
} from "../../_shared"

export const runtime = "nodejs"

function isMondayYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 1
  )
}

/** GET /api/codex/time/proposals?week_start=YYYY-MM-DD */
export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const weekStart =
    url.searchParams.get("week_start")?.trim() ||
    sydneyWeekRange().startYmd
  if (!isMondayYmd(weekStart)) {
    return jsonError(
      400,
      "invalid_week_start",
      "week_start must be a Monday in YYYY-MM-DD format."
    )
  }

  try {
    const proposals = await listTimeEntryProposalsForWeek(weekStart)
    return NextResponse.json({
      week_start: weekStart,
      week_end: addSydneyDays(weekStart, 6),
      proposals,
    })
  } catch (error) {
    console.error("Failed to list time-entry proposals:", error)
    return NextResponse.json(
      {
        error: "Failed to list time-entry proposals",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
