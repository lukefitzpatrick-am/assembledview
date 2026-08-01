/**
 * S8 soak — report-only timing baseline for campaigns list + finance-hub shadow.
 * No behaviour changes. Measures against current .env.local flags.
 *
 * Usage:
 *   node --import ./scripts/test-shims/register-server-only.mjs \
 *     --require ./scripts/test-shims/mock-server-only.cjs \
 *     --import tsx scripts/verify/soak-s8-perf-baseline.ts
 */

import { performance } from "node:perf_hooks"
import { loadEnvLocal } from "@/scripts/migration/_shared"
import { closeDb } from "@/db"

loadEnvLocal()

function ms(start: number): number {
  return Math.round(performance.now() - start)
}

function flag(name: string, fallback = "(unset→default)"): string {
  const v = process.env[name]
  return v != null && v.trim() !== "" ? v.trim() : fallback
}

async function main() {
  const tBoot = performance.now()
  // Defer heavy imports until after env load.
  const { getCachedMediaPlansList } = await import("@/lib/api/mediaPlansListCache")
  const { getDataBackend, getDataBackendFor, getWriteBackend, getPlanDetailBackend } =
    await import("@/lib/data/backend")
  const { getFinanceScheduleBackend, hydrateVersionsFinanceScheduleSource, loadScheduleMonthRowsForVersions } =
    await import("@/lib/finance/scheduleMonthsSource")
  const { fetchRelevantPlanVersionsForFinanceMonth } = await import(
    "@/lib/finance/relevantPlanVersions"
  )
  const bootMs = ms(tBoot)

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  console.log("=== S8 PERF BASELINE (report-only) ===")
  console.log("Flags (from process.env after .env.local):")
  console.log(
    JSON.stringify(
      {
        DATA_BACKEND: getDataBackend(),
        WRITE_BACKEND: getWriteBackend(),
        DATA_BACKEND_PLANS: getDataBackendFor("plans"),
        DATA_BACKEND_FINANCE: getDataBackendFor("finance"),
        DATA_BACKEND_KPI: getDataBackendFor("kpi"),
        DATA_BACKEND_APPROVALS: getDataBackendFor("approvals"),
        DATA_BACKEND_PLAN_DETAIL: getPlanDetailBackend(),
        DATA_BACKEND_FINANCE_SCHEDULE: getFinanceScheduleBackend(),
        SAVE_GATE_FULL_SCOPE: flag("SAVE_GATE_FULL_SCOPE", "off"),
        FEE_SNAPSHOT_WRITE_ONCE: flag("FEE_SNAPSHOT_WRITE_ONCE", "off"),
        MEDIA_PLAN_VERSIONS_CACHE_TTL_MS: flag("MEDIA_PLAN_VERSIONS_CACHE_TTL_MS"),
      },
      null,
      2
    )
  )
  console.log(`import/boot (after env): ${bootMs}ms  (dev-compile / module graph noise)`)

  // --- Campaigns list (GET /api/mediaplans core) ---
  const tList1 = performance.now()
  const list1 = await getCachedMediaPlansList()
  const listColdMs = ms(tList1)
  const tList2 = performance.now()
  const list2 = await getCachedMediaPlansList()
  const listWarmMs = ms(tList2)

  console.log("\n--- Campaigns list (getCachedMediaPlansList) ---")
  console.log(
    JSON.stringify(
      {
        coldMs: listColdMs,
        warmMs: listWarmMs,
        count: list1.data.length,
        stale: list1.stale,
        warmCount: list2.data.length,
        notes:
          "Cold includes postgres versions+masters (DATA_BACKEND=postgres) + merge; warm is TTL coalesced cache. P-2 Xano crawl not on this path when plans=postgres. P-8 is client remount refetch — not measured here.",
      },
      null,
      2
    )
  )

  // --- Finance hub billing path: relevant versions + schedule shadow hydrate ---
  const tVers = performance.now()
  const versionsResult = await fetchRelevantPlanVersionsForFinanceMonth(month)
  const versionsMs = ms(tVers)
  if ("error" in versionsResult) {
    console.error("relevant versions failed", versionsResult)
    process.exitCode = 1
    return
  }

  const relevant = versionsResult.relevantVersions as Record<string, unknown>[]
  const versionIds = relevant
    .map((v) => Number(v.id ?? v.version_id ?? 0))
    .filter((id) => id > 0)

  const tRows = performance.now()
  const rowsByVersion = await loadScheduleMonthRowsForVersions(versionIds)
  const scheduleQueryMs = ms(tRows)
  let rowCount = 0
  for (const rows of rowsByVersion.values()) rowCount += rows.length

  // Clone shallow copies so hydrate can attach without mutating the timed rows map path oddly
  const hydrateInput = relevant.map((v) => ({ ...v }))
  const tHydrate = performance.now()
  const hydrate = await hydrateVersionsFinanceScheduleSource(hydrateInput)
  const hydrateTotalMs = ms(tHydrate)
  // Second hydrate approximates warm shadow (rows already loaded inside; still re-queries)
  const hydrateInput2 = relevant.map((v) => ({ ...v }))
  const tHydrate2 = performance.now()
  const hydrate2 = await hydrateVersionsFinanceScheduleSource(hydrateInput2)
  const hydrate2Ms = ms(tHydrate2)

  // Shadow compare cost ≈ hydrate − schedule query (same query inside hydrate).
  // First hydrate includes its own schedule_months load; attribute separately.
  const shadowCompareEstMs = Math.max(0, hydrateTotalMs - scheduleQueryMs)

  console.log("\n--- Finance hub (billing-relevant month + DATA_BACKEND_FINANCE_SCHEDULE=shadow) ---")
  console.log(
    JSON.stringify(
      {
        billingMonth: month,
        relevantVersionsFetchMs: versionsMs,
        relevantVersionCount: relevant.length,
        allVersionsCount: versionsResult.allVersions.length,
        scheduleMonthsQueryMs: scheduleQueryMs,
        scheduleMonthRowCount: rowCount,
        hydrateShadowTotalMs: hydrateTotalMs,
        hydrateShadowSecondPassMs: hydrate2Ms,
        shadowCompareEstMs,
        hydrateMeta: {
          mode: hydrate.mode,
          versionCount: hydrate.versionCount,
          fallbackCount: hydrate.fallbackCount,
          shadowDiffCount: hydrate.shadowDiffCount,
        },
        hydrate2Meta: {
          shadowDiffCount: hydrate2.shadowDiffCount,
          fallbackCount: hydrate2.fallbackCount,
        },
        notes:
          "Finance hub GET /api/finance/billing hydrates after relevantPlanVersions. With schedule=shadow: serve blob, query schedule_months + compare (P-2 still applies if relevantPlanVersions walks Xano). Shadow compare est = hydrateTotal − standalone schedule query (same work duplicated inside hydrate).",
      },
      null,
      2
    )
  )

  console.log("\n=== SUMMARY TABLE (paste into soak report) ===")
  console.log(
    [
      "| Surface | Metric | ms | Attribution |",
      "|---|---|---:|---|",
      `| module boot | import graph | ${bootMs} | dev-compile / cold module noise |`,
      `| campaigns list | cold getCachedMediaPlansList | ${listColdMs} | query+merge (plans postgres); P-2 N/A |`,
      `| campaigns list | warm cache | ${listWarmMs} | TTL coalesce (not P-8 client remount) |`,
      `| finance hub | relevantPlanVersions (${month}) | ${versionsMs} | plan crawl (P-2 if Xano) |`,
      `| finance hub | schedule_months query | ${scheduleQueryMs} | PG query for shadow |`,
      `| finance hub | hydrate shadow total | ${hydrateTotalMs} | query + blob↔rows compare |`,
      `| finance hub | shadow compare (est.) | ${shadowCompareEstMs} | hydrate − query; M8 rows flip baseline |`,
      `| finance hub | hydrate 2nd pass | ${hydrate2Ms} | repeat shadow cost |`,
    ].join("\n")
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await closeDb()
    } catch {
      /* ignore */
    }
  })
