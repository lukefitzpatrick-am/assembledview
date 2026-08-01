/**
 * Probe costs summary against live Postgres (coverage + KPI smoke).
 *
 * Usage:
 *   npx tsx --import ./scripts/test-shims/register-server-only.mjs scripts/verify/finance-costs-summary-probe.ts
 *   npx tsx ... -- --fy=2025
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
    bookedByPublisherMonthSqlText,
    fetchFinanceCostsSummary,
    normalizeCostsQuery,
  } = await import("../../lib/finance/sections/costsQuery")
  const { closeDb } = await import("../../db")

  const fy = parseFyArg(process.argv.slice(2)) ?? australianFyStartYearForDate()
  const currentMonth = getCurrentBillingMonth()
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const currentFy = australianFyStartYearForDate()
  const to = fy < currentFy ? fyMonths[fyMonths.length - 1]! : currentMonth
  const from = fyMonths[0]!
  const query = normalizeCostsQuery({ fy, from, to, clients: [] })

  console.log("=== Finance costs summary probe ===")
  console.log(`FY=${query.fy} from=${query.from} to=${query.to}`)
  console.log("")
  console.log("--- Booked SQL ---")
  console.log(bookedByPublisherMonthSqlText(query))
  console.log("")

  try {
    const payload = await fetchFinanceCostsSummary(query)
    console.log("--- KPIs (cents) ---")
    console.log(JSON.stringify(payload.kpis, null, 2))
    console.log("--- Coverage ---")
    console.log(JSON.stringify(payload.coverage, null, 2))
    console.log("--- Attribution rule ---")
    console.log(payload.attributionRule)
    console.log("--- Top publishers ---")
    console.log(
      payload.topPublishers
        .map((p) => `${p.publisher}\t${(p.bookedCents / 100).toFixed(2)}`)
        .join("\n") || "(none)"
    )
    console.log("--- Unattributed bill count ---")
    console.log(String(payload.unattributedBills.length))
    console.log("--- byMonth count / publisherMonths count ---")
    console.log(`${payload.byMonth.length} / ${payload.publisherMonths.length}`)
  } finally {
    await closeDb().catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
