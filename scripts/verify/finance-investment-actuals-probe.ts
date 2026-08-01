/**
 * Live probe: Investment cut Actuals (Xero) coverage + grain refusal.
 *
 *   npm run probe:finance-investment-actuals -- --fy=2025
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
    fetchInvestmentCut,
    normalizeInvestmentCutRequest,
  } = await import("../../lib/finance/sections/investment/cutQuery")
  const { grainRuleMatrix } = await import("../../lib/finance/sections/investment/cutGrain")
  const { closeDb } = await import("../../db")

  const fy = parseFyArg(process.argv.slice(2)) ?? australianFyStartYearForDate()
  const currentMonth = getCurrentBillingMonth()
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const currentFy = australianFyStartYearForDate()
  const to = fy < currentFy ? fyMonths[fyMonths.length - 1]! : currentMonth
  const from = fyMonths[0]!

  console.log("=== Investment Actuals probe ===")
  console.log(`FY=${fy} from=${from} to=${to}`)
  console.log("")
  console.log("--- Grain matrix (dim × measure) ---")
  console.log(["dim", "measure", "allowed"].join("\t"))
  for (const row of grainRuleMatrix()) {
    if (!row.measure.includes("invoiced") && row.measure !== "paid_cents") continue
    console.log([row.dim, row.measure, row.allowed ? "yes" : "BLOCKED"].join("\t"))
  }

  const refused = normalizeInvestmentCutRequest({
    fy,
    monthRange: { from, to },
    basis: "billing",
    dimensions: ["publisher"],
    measures: ["invoiced_cents"],
  })
  console.log("")
  console.log("--- Grain refusal (publisher + invoiced) ---")
  console.log(JSON.stringify(refused, null, 2))

  const ok = normalizeInvestmentCutRequest({
    fy,
    monthRange: { from, to },
    basis: "billing",
    dimensions: ["client"],
    measures: ["billable_cents", "invoiced_cents", "paid_cents", "invoiced_delta_cents"],
  })
  if ("error" in ok) {
    console.error("unexpected normalize error", ok)
    process.exit(1)
  }

  try {
    const cut = await fetchInvestmentCut(ok)
    console.log("")
    console.log("--- Live client cut + Actuals ---")
    console.log(
      [
        "billable_cents",
        "invoiced_cents",
        "paid_cents",
        "invoiced_delta_cents",
        "ar_matchedPct",
        "publisherMatchedPct",
        "rows",
      ].join("\t")
    )
    console.log(
      [
        String(cut.totals.billable_cents ?? 0),
        String(cut.totals.invoiced_cents ?? 0),
        String(cut.totals.paid_cents ?? 0),
        String(cut.totals.invoiced_delta_cents ?? 0),
        String(cut.coverage.ar?.matchedPct ?? ""),
        String(cut.coverage.publisherMatchedPct),
        String(cut.coverage.rowCount),
      ].join("\t")
    )
    if (cut.coverage.ar) {
      console.log("")
      console.log(
        `AR coverage: ${cut.coverage.ar.bookedWithArLinkCents}/${cut.coverage.ar.bookedBillableCents} cents linked (${cut.coverage.ar.matchedPct}%)`
      )
      console.log(cut.coverage.ar.note)
    }
    if (cut._debugSql?.arMbaMonth) {
      console.log("")
      console.log("--- AR SQL ---")
      console.log(cut._debugSql.arMbaMonth)
    }
  } finally {
    await closeDb().catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
