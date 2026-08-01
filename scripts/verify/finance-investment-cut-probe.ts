/**
 * Live Investment cut probe — coverage + recon vs FN3a sections summary.
 *
 * Usage:
 *   npx tsx scripts/verify/finance-investment-cut-probe.ts
 *   npx tsx scripts/verify/finance-investment-cut-probe.ts --fy=2025
 */

import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

function parseFyArg(argv: string[]): number | undefined {
  for (const a of argv) {
    if (a.startsWith("--fy=")) {
      const n = Number.parseInt(a.slice(5), 10)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

async function main() {
  const {
    australianFyStartYearForDate,
    billingMonthsInAustralianFinancialYear,
    getCurrentBillingMonth,
    referenceDateForFyStartYear,
  } = await import("../../lib/finance/months")
  const {
    fetchFinanceSectionsSummary,
    normalizeSummaryQuery,
  } = await import("../../lib/finance/sections/summaryQuery")
  const {
    fetchInvestmentCut,
    normalizeInvestmentCutRequest,
    investmentCutSqlText,
  } = await import("../../lib/finance/sections/investment/cutQuery")
  const { closeDb } = await import("../../db")

  const fy = parseFyArg(process.argv.slice(2)) ?? australianFyStartYearForDate()
  const currentMonth = getCurrentBillingMonth()
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const currentFy = australianFyStartYearForDate()
  const to = fy < currentFy ? fyMonths[fyMonths.length - 1]! : currentMonth
  const from = fyMonths[0]!

  const summaryQ = normalizeSummaryQuery({ fy, from, to, clients: [] })

  console.log("=== Investment cut probe ===")
  console.log(`FY=${fy} from=${from} to=${to}`)
  console.log("")

  const billingNorm = normalizeInvestmentCutRequest({
    fy,
    monthRange: { from, to },
    basis: "billing",
    dimensions: ["client"],
    measures: ["media_cents", "fee_cents", "adserving_cents", "billable_cents"],
  })
  const deliveryNorm = normalizeInvestmentCutRequest({
    fy,
    monthRange: { from, to },
    basis: "delivery",
    dimensions: ["client"],
    measures: ["media_cents", "fee_cents", "adserving_cents", "billable_cents"],
  })
  if ("error" in billingNorm || "error" in deliveryNorm) {
    console.error("normalize failed", billingNorm, deliveryNorm)
    process.exit(1)
  }

  console.log("--- Billing cut SQL (MCP re-run) ---")
  console.log(investmentCutSqlText(billingNorm).cut)
  console.log("")

  try {
    const [summary, billingCut, deliveryCut] = await Promise.all([
      fetchFinanceSectionsSummary(summaryQ),
      fetchInvestmentCut(billingNorm),
      fetchInvestmentCut(deliveryNorm),
    ])

    const billingDelta =
      (billingCut.totals.billable_cents ?? 0) - summary.receivablesFytd.cents
    const deliveryDelta =
      (deliveryCut.totals.billable_cents ?? 0) - summary.payablesFytd.cents

    console.log("--- Reconciliation (cut client-dim vs FN3a summary) ---")
    console.log(
      [
        "basis",
        "cut_billable_cents",
        "fn3a_cents",
        "delta_cents",
        "publisherMatchedPct",
        "feeCoveragePct",
        "mediaLineMonths",
        "feeLineMonths",
        "rowCount",
        "truncated",
      ].join("\t")
    )
    console.log(
      [
        "billing",
        String(billingCut.totals.billable_cents),
        String(summary.receivablesFytd.cents),
        String(billingDelta),
        String(billingCut.coverage.publisherMatchedPct),
        String(billingCut.coverage.fee?.coveragePct ?? ""),
        String(billingCut.coverage.fee?.mediaLineMonths ?? ""),
        String(billingCut.coverage.fee?.feeLineMonths ?? ""),
        String(billingCut.coverage.rowCount),
        String(billingCut.truncated),
      ].join("\t")
    )
    console.log(
      [
        "delivery",
        String(deliveryCut.totals.billable_cents),
        String(summary.payablesFytd.cents),
        String(deliveryDelta),
        String(deliveryCut.coverage.publisherMatchedPct),
        String(deliveryCut.coverage.fee?.coveragePct ?? ""),
        String(deliveryCut.coverage.fee?.mediaLineMonths ?? ""),
        String(deliveryCut.coverage.fee?.feeLineMonths ?? ""),
        String(deliveryCut.coverage.rowCount),
        String(deliveryCut.truncated),
      ].join("\t")
    )

    console.log("")
    console.log("--- Fee caveat ---")
    console.log(billingCut.coverage.fee?.caveat ?? "(none)")

    const ok = billingDelta === 0 && deliveryDelta === 0
    console.log("")
    console.log(ok ? "PASS: cut totals match FN3a summary" : "FAIL: cut ≠ FN3a")
    process.exit(ok ? 0 : 2)
  } finally {
    await closeDb().catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
