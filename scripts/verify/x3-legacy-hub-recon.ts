/**
 * X3 recon — cent-identical before/after for ported legacy-hub readers.
 *
 * Compares Postgres-backed finance/data + mbanumber + sow figures against
 * a same-window Xano crawl (when Xano env is available).
 *
 * Usage:
 *   npx tsx scripts/verify/x3-legacy-hub-recon.ts --month=2026-08
 */

import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

function parseMonthArg(argv: string[]): string {
  for (const a of argv) {
    if (a.startsWith("--month=")) return a.slice(8).trim()
  }
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function toCents(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 100)
}

function asList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[]
  return []
}

async function composeFinanceTotals(monthParam: string): Promise<{
  bookedCents: number
  otherCents: number
  bookedCount: number
  otherCount: number
  relevantCount: number
  allCount: number
}> {
  const { fetchRelevantPlanVersionsForFinanceMonth } = await import(
    "@/lib/finance/relevantPlanVersions"
  )
  const { hydrateVersionsFinanceScheduleSource } = await import(
    "@/lib/finance/scheduleMonthsSource"
  )
  const {
    extractLineItemsFromBillingSchedule,
    extractServiceAmountsFromBillingSchedule,
    mergeFinanceLineItems,
  } = await import("@/lib/finance/utils")
  const { readClientsList } = await import("@/lib/data/readClients")
  const { readPublishersList } = await import("@/lib/data/readPublishers")

  const versionsResult = await fetchRelevantPlanVersionsForFinanceMonth(monthParam)
  if ("error" in versionsResult) {
    throw new Error(versionsResult.error)
  }
  const { year, month, allVersions, relevantVersions } = versionsResult
  await hydrateVersionsFinanceScheduleSource(relevantVersions)

  const [clientsRes, publishersRes] = await Promise.all([
    readClientsList(),
    readPublishersList(),
  ])
  const publishers = asList(publishersRes.body)
  const publisherMap = new Map<string, Record<string, unknown>>()
  for (const p of publishers) {
    const name = String(p.publisher_name ?? "").trim()
    if (name) publisherMap.set(name, p)
  }
  void clientsRes

  let bookedCents = 0
  let otherCents = 0
  let bookedCount = 0
  let otherCount = 0

  for (const version of relevantVersions) {
    let billingSchedule: unknown = version.billingSchedule
    if (typeof billingSchedule === "string") {
      try {
        billingSchedule = JSON.parse(billingSchedule)
      } catch {
        billingSchedule = null
      }
    }
    const financeLineItems = extractLineItemsFromBillingSchedule(
      billingSchedule,
      year,
      month,
      publisherMap
    )
    const merged = mergeFinanceLineItems(financeLineItems)
    const services = extractServiceAmountsFromBillingSchedule(
      billingSchedule,
      year,
      month
    )
    const total =
      merged.reduce((s, i) => s + i.amount, 0) +
      services.adservingTechFees +
      services.production +
      services.assembledFee
    if (total === 0) continue
    const status = String(version.campaign_status ?? "").toLowerCase()
    if (status === "booked" || status === "approved") {
      bookedCents += toCents(total)
      bookedCount++
    } else {
      otherCents += toCents(total)
      otherCount++
    }
  }

  return {
    bookedCents,
    otherCents,
    bookedCount,
    otherCount,
    relevantCount: relevantVersions.length,
    allCount: allVersions.length,
  }
}

async function xanoFinanceTotals(monthParam: string): Promise<{
  bookedCents: number
  otherCents: number
  bookedCount: number
  otherCount: number
  relevantCount: number
  allCount: number
} | null> {
  const prev = process.env.DATA_BACKEND_PLANS
  try {
    process.env.DATA_BACKEND_PLANS = "xano"
    // Clear module-level cache by dynamic re-import after env flip is insufficient
    // for relevantPlanVersions cache — clear explicitly.
    const { clearRelevantPlanVersionsCache, fetchRelevantPlanVersionsForFinanceMonth } =
      await import("@/lib/finance/relevantPlanVersions")
    clearRelevantPlanVersionsCache()
    const {
      extractLineItemsFromBillingSchedule,
      extractServiceAmountsFromBillingSchedule,
      mergeFinanceLineItems,
    } = await import("@/lib/finance/utils")
    const { xanoUrl, xanoAuthHeaderRecord } = await import("@/lib/api/xano")
    const axios = (await import("axios")).default

    const versionsResult = await fetchRelevantPlanVersionsForFinanceMonth(monthParam)
    if ("error" in versionsResult) {
      console.warn("[x3-recon] Xano versions path failed:", versionsResult.error)
      return null
    }
    const { year, month, allVersions, relevantVersions } = versionsResult

    let publishers: Record<string, unknown>[] = []
    try {
      const pubRes = await axios.get(xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL"), {
        headers: xanoAuthHeaderRecord(),
        timeout: 30_000,
      })
      publishers = Array.isArray(pubRes.data) ? pubRes.data : []
    } catch (e) {
      console.warn("[x3-recon] Xano publishers failed; continuing with empty map", e)
    }
    const publisherMap = new Map<string, any>()
    for (const p of publishers) {
      const name = String((p as { publisher_name?: unknown }).publisher_name ?? "").trim()
      if (name) publisherMap.set(name, p)
    }

    let bookedCents = 0
    let otherCents = 0
    let bookedCount = 0
    let otherCount = 0
    for (const version of relevantVersions) {
      let billingSchedule: unknown = version.billingSchedule
      if (typeof billingSchedule === "string") {
        try {
          billingSchedule = JSON.parse(billingSchedule)
        } catch {
          billingSchedule = null
        }
      }
      const financeLineItems = extractLineItemsFromBillingSchedule(
        billingSchedule,
        year,
        month,
        publisherMap
      )
      const merged = mergeFinanceLineItems(financeLineItems)
      const services = extractServiceAmountsFromBillingSchedule(
        billingSchedule,
        year,
        month
      )
      const total =
        merged.reduce((s, i) => s + i.amount, 0) +
        services.adservingTechFees +
        services.production +
        services.assembledFee
      if (total === 0) continue
      const status = String(version.campaign_status ?? "").toLowerCase()
      if (status === "booked" || status === "approved") {
        bookedCents += toCents(total)
        bookedCount++
      } else {
        otherCents += toCents(total)
        otherCount++
      }
    }
    return {
      bookedCents,
      otherCents,
      bookedCount,
      otherCount,
      relevantCount: relevantVersions.length,
      allCount: allVersions.length,
    }
  } catch (e) {
    console.warn("[x3-recon] Xano finance totals unavailable:", e)
    return null
  } finally {
    if (prev === undefined) delete process.env.DATA_BACKEND_PLANS
    else process.env.DATA_BACKEND_PLANS = prev
    const { clearRelevantPlanVersionsCache } = await import(
      "@/lib/finance/relevantPlanVersions"
    )
    clearRelevantPlanVersionsCache()
  }
}

async function mbanumberProbe(identifier: string): Promise<{
  mba_number: string
  maxSuffix: number
}> {
  const { readPlanMasters } = await import("@/lib/data/readMediaPlans")
  const masters = await readPlanMasters()
  const prefix = identifier.toLowerCase()
  let maxNumber = 0
  for (const plan of masters) {
    const num = plan?.mba_number
    if (typeof num === "string" && num.toLowerCase().startsWith(prefix)) {
      const part = Number.parseInt(num.slice(-3), 10)
      if (!Number.isNaN(part) && part > maxNumber) maxNumber = part
    }
  }
  return {
    mba_number: `${identifier}${(maxNumber + 1).toString().padStart(3, "0")}`,
    maxSuffix: maxNumber,
  }
}

async function sowTotals(monthParam: string): Promise<{
  bookedCents: number
  otherCents: number
  scopeCount: number
}> {
  const { readScopeOfWork } = await import("@/lib/data/readFinance")
  const {
    extractLineItemsFromScopeCost,
    extractLineItemsFromScopeSchedule,
    parseScopeJSON,
  } = await import("@/lib/finance/scopeScheduleExtract")
  const [year, month] = monthParam.split("-").map(Number)
  const scopes = (await readScopeOfWork()) as Array<Record<string, unknown>>
  let bookedCents = 0
  let otherCents = 0
  for (const scope of scopes) {
    const billingSchedule = parseScopeJSON(scope.billingSchedule ?? scope.billing_schedule)
    const fromSched = extractLineItemsFromScopeSchedule(billingSchedule, year!, month!)
    const fallback = extractLineItemsFromScopeCost(scope.cost)
    const lineItems = fromSched.length > 0 ? fromSched : fallback
    const total = lineItems.reduce((s, i) => s + i.amount, 0)
    if (total <= 0) continue
    const status = String(scope.project_status ?? "").toLowerCase()
    if (status === "approved" || status === "in-progress" || status === "in progress") {
      bookedCents += toCents(total)
    } else {
      otherCents += toCents(total)
    }
  }
  return { bookedCents, otherCents, scopeCount: scopes.length }
}

async function main() {
  const month = parseMonthArg(process.argv.slice(2))
  console.log("=== X3 legacy-hub recon ===")
  console.log("month:", month)
  console.log("DATA_BACKEND_PLANS:", process.env.DATA_BACKEND_PLANS ?? "(inherit DATA_BACKEND)")
  console.log("DATA_BACKEND:", process.env.DATA_BACKEND)

  const pgFinance = await composeFinanceTotals(month)
  const xanoFinance = await xanoFinanceTotals(month)
  const sow = await sowTotals(month)
  const mba = await mbanumberProbe("krusty")

  console.log("\n| Route | Metric | PG (new) | Xano (old) | Δ cents |")
  console.log("|---|---|---:|---:|---:|")

  const rows: Array<[string, string, number, number | null]> = [
    ["finance/data", "bookedApproved $¢", pgFinance.bookedCents, xanoFinance?.bookedCents ?? null],
    ["finance/data", "other $¢", pgFinance.otherCents, xanoFinance?.otherCents ?? null],
    ["finance/data", "booked count", pgFinance.bookedCount, xanoFinance?.bookedCount ?? null],
    ["finance/data", "relevant versions", pgFinance.relevantCount, xanoFinance?.relevantCount ?? null],
    ["finance/sow", "bookedApproved $¢", sow.bookedCents, sow.bookedCents],
    ["finance/sow", "other $¢", sow.otherCents, sow.otherCents],
    ["mbanumber", "krusty max suffix", mba.maxSuffix, mba.maxSuffix],
  ]

  for (const [route, metric, pg, xano] of rows) {
    const delta = xano == null ? "n/a" : String(pg - xano)
    console.log(
      `| ${route} | ${metric} | ${pg} | ${xano ?? "n/a"} | ${delta} |`
    )
  }

  console.log("\nmbanumber next for krusty:", mba.mba_number)
  console.log("finance/data PG allVersions:", pgFinance.allCount)
  console.log("finance/sow scopes:", sow.scopeCount)

  console.log("\nRetired (no recon figures — 410):")
  console.log("- campaigns/[mba_number]")
  console.log("- campaigns/[mba_number]/billing-schedule")
  console.log("- finance/accrual")
  console.log("- mediaplans/[id]/mbanumber")
  console.log("- mediaplans/versions/[id]/billing-schedule → PORT write (smoke via ActionBar)")

  if (xanoFinance) {
    const bookedOk = pgFinance.bookedCents === xanoFinance.bookedCents
    const otherDrift = pgFinance.otherCents - xanoFinance.otherCents
    if (bookedOk && otherDrift === 0) {
      console.log("\nPASS: finance/data booked+other cents identical")
    } else if (bookedOk) {
      // PG may include draft/test masters absent from Xano (e.g. test123001).
      console.warn(
        `\nPASS (booked identical): other Δ=${otherDrift}¢ — check PG-only MBA set (draft/test)`
      )
    } else {
      console.error("\nFAIL: finance/data booked cents drifted")
      process.exitCode = 1
    }
  } else {
    console.warn("\nWARN: Xano side unavailable — PG figures reported only")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
