import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { summarizeShadowDiffs } from "@/lib/data/shadowDiff"
import {
  getFinanceScheduleBackend,
  probeFinanceScheduleDiffs,
} from "@/lib/finance/scheduleMonthsSource"

export const runtime = "nodejs"

/**
 * Admin-only summary of shadow field-level diffs from the last 24h (in-memory,
 * process-local). The only producer left is the finance schedule blob vs
 * `schedule_months` compare (`DATA_BACKEND_FINANCE_SCHEDULE=shadow`).
 * `?probe=finance-schedule` runs that compare across all published versions
 * (PC1) and returns CSV + top divergent MBAs. The Xano-era `?probe=finance`,
 * `pacing` and `plans` no-ops and the `DATA_BACKEND*` echo are gone (B6).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  const probe = request.nextUrl.searchParams.get("probe")
  if (probe === "finance-schedule") {
    try {
      const result = await probeFinanceScheduleDiffs()
      const summary = summarizeShadowDiffs(24 * 60 * 60 * 1000)
      return NextResponse.json({
        financeScheduleBackend: getFinanceScheduleBackend(),
        financeScheduleProbe: {
          versionCount: result.versionCount,
          fallbackCount: result.fallbackCount,
          diffCount: result.diffCount,
          topDivergentMbas: result.topDivergentMbas,
        },
        financeScheduleCsv: result.csv,
        ...summary,
      })
    } catch (err) {
      console.error("[migration-diffs] finance-schedule probe failed", err)
      return NextResponse.json(
        {
          error: "finance-schedule probe failed",
          message: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      )
    }
  }

  const summary = summarizeShadowDiffs(24 * 60 * 60 * 1000)

  const financeDomain = summary.byDomain.find((d) => d.domain === "finance")
  const financeSplit = financeDomain
    ? {
        unexpectedMissingInPostgres: financeDomain.totalUnexpectedMissingInPostgres,
        duplicateClassMissingInPostgres: financeDomain.totalDuplicateClassMissingInPostgres,
        unexpectedFieldDiffRows: financeDomain.totalRowsWithFieldDiffs,
        unexpectedMissingInXano: financeDomain.totalMissingInXano,
      }
    : null

  return NextResponse.json({
    financeScheduleBackend: getFinanceScheduleBackend(),
    financeDiffSplit: financeSplit,
    ...summary,
  })
}
