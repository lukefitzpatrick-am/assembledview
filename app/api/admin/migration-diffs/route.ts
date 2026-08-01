import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { getDataBackend, getDataBackendFor } from "@/lib/data/backend"
import { summarizeShadowDiffs } from "@/lib/data/shadowDiff"
import { probeFinanceShadowDiffs } from "@/lib/data/readFinance"
import { probePacingShadowDiffs } from "@/lib/data/readPacing"
import { probePlansShadowDiffs } from "@/lib/data/readMediaPlans"
import {
  getFinanceScheduleBackend,
  probeFinanceScheduleDiffs,
} from "@/lib/finance/scheduleMonthsSource"

export const runtime = "nodejs"

/**
 * Admin-only summary of DATA_BACKEND=shadow field-level diffs from the last 24h
 * (in-memory, process-local). Includes per-domain counts.
 *
 * Finance: `unexpected` vs `duplicate-class` (PG deduped / Xano duplicated — EXPECTED)
 * are split in byDomain/byTable totals. Optional `?probe=finance` triggers a
 * read of all finance tables so cold processes accumulate diffs.
 * Optional `?probe=pacing` probes pacing-owned Xano tables (masters/versions/orphan_fixes).
 * Optional `?probe=plans` probes media-plan masters/versions + sample channel line items.
 * Optional `?probe=finance-schedule` compares blob vs schedule_months-derived amounts
 * across all published versions (PC1); returns CSV + top divergent MBAs.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  const probe = request.nextUrl.searchParams.get("probe")
  if (probe === "finance" && getDataBackendFor("finance") === "shadow") {
    try {
      await probeFinanceShadowDiffs()
    } catch (err) {
      console.error("[migration-diffs] finance probe failed", err)
    }
  }
  if (probe === "pacing" && getDataBackendFor("pacing") === "shadow") {
    try {
      await probePacingShadowDiffs()
    } catch (err) {
      console.error("[migration-diffs] pacing probe failed", err)
    }
  }
  if (probe === "plans" && getDataBackendFor("plans") === "shadow") {
    try {
      await probePlansShadowDiffs()
    } catch (err) {
      console.error("[migration-diffs] plans probe failed", err)
    }
  }
  if (probe === "finance-schedule") {
    try {
      const result = await probeFinanceScheduleDiffs()
      const summary = summarizeShadowDiffs(24 * 60 * 60 * 1000)
      return NextResponse.json({
        dataBackend: getDataBackend(),
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
    dataBackend: getDataBackend(),
    dataBackendsByDomain: {
      reference: getDataBackendFor("reference"),
      publishers: getDataBackendFor("publishers"),
      clients: getDataBackendFor("clients"),
      kpi: getDataBackendFor("kpi"),
      finance: getDataBackendFor("finance"),
      pacing: getDataBackendFor("pacing"),
      plans: getDataBackendFor("plans"),
    },
    financeScheduleBackend: getFinanceScheduleBackend(),
    financeDiffSplit: financeSplit,
    ...summary,
  })
}
