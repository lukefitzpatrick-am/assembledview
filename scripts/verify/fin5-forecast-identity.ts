/**
 * FIN-5 live identity gate: Jayco + one other client.
 *
 * Usage:
 *   node --import ./scripts/test-shims/register-server-only.mjs --require ./scripts/test-shims/mock-server-only.cjs --import tsx scripts/verify/fin5-forecast-identity.ts
 *   … --fy=2025
 *
 * Requires Xano env (same as forecast API). Exits 1 on identity failure.
 */
import { loadEnvLocal } from "@/scripts/migration/_shared"
import { loadFinanceForecastDataset } from "@/lib/finance/forecast/server/loadFinanceForecastDataset"
import {
  evaluateClientForecastIdentity,
  type ClientIdentityResult,
} from "@/lib/finance/forecast/forecastPresentationIdentity"

loadEnvLocal()

function parseFy(): number {
  const arg = process.argv.find((a) => a.startsWith("--fy="))
  if (arg) return Number(arg.slice("--fy=".length))
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return m >= 7 ? y : y - 1
}

function pickClients(results: ClientIdentityResult[]): ClientIdentityResult[] {
  const jayco = results.find((r) => /jayco/i.test(r.client_name) || /jayco/i.test(r.client_id))
  const other = results.find(
    (r) =>
      r !== jayco &&
      (r.entityBillingFy > 0 || r.feesPlusCommissionsFy > 0) &&
      !/jayco/i.test(r.client_name)
  )
  const picked: ClientIdentityResult[] = []
  if (jayco) picked.push(jayco)
  if (other) picked.push(other)
  if (picked.length < 2) {
    // Fall back to two largest billing clients.
    return [...results]
      .sort((a, b) => b.entityBillingFy - a.entityBillingFy)
      .slice(0, 2)
  }
  return picked
}

async function main() {
  const fy = parseFy()
  const loaded = await loadFinanceForecastDataset({
    financialYearStartYear: fy,
    scenario: "confirmed",
    allowedClientSlugs: null,
    includeRowDebug: false,
  })
  const all = loaded.dataset.client_blocks.map(evaluateClientForecastIdentity)
  const picked = pickClients(all)

  let failed = false
  for (const r of picked) {
    const mediaOk = r.mediaMatchesEntity
    const feesOk =
      Math.abs(r.otherRevenueFy) <= 0.005
        ? r.feesCommissionsMatchRevenueExTotal
        : r.feesCommissionsPlusOtherMatchRevenueExTotal
    if (!mediaOk || !feesOk) failed = true
    console.log(
      JSON.stringify(
        {
          client: r.client_name,
          client_id: r.client_id,
          mediaMatchesEntity: mediaOk,
          entityBillingFy: r.entityBillingFy,
          mediaBreakoutFy: r.mediaBreakoutFy,
          feesPlusCommissionsFy: r.feesPlusCommissionsFy,
          otherRevenueFy: r.otherRevenueFy,
          revenueBodyExTotalFy: r.revenueBodyExTotalFy,
          feesCommissionsMatchRevenueExTotal: r.feesCommissionsMatchRevenueExTotal,
          feesCommissionsPlusOtherMatchRevenueExTotal:
            r.feesCommissionsPlusOtherMatchRevenueExTotal,
          gate: mediaOk && feesOk ? "PASS" : "FAIL",
        },
        null,
        2
      )
    )
  }

  if (picked.length === 0) {
    console.error("No client blocks in forecast dataset")
    process.exit(1)
  }
  if (failed) {
    console.error("FIN-5 identity gate FAILED")
    process.exit(1)
  }
  console.log(`FIN-5 identity gate PASS (${picked.length} clients, FY start ${fy})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
