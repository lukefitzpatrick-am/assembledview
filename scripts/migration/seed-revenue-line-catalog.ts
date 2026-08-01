/**
 * Seed revenue_line_catalog from FINANCE_FORECAST_LINE_KEYS / labels.
 *
 * The catalog table mirrors code constants for future admin editing.
 * Runtime source of truth this phase remains the TypeScript constants.
 *
 * Usage: npm run db:seed-revenue-line-catalog
 */
import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import { loadEnvLocal } from "@/scripts/migration/_shared"
import {
  FINANCE_FORECAST_LINE_KEYS,
  FINANCE_FORECAST_LINE_LABELS,
  type FinanceForecastLineKey,
} from "@/lib/types/financeForecast"
import { seedRevenueLineCatalogFromCodeConstants } from "@/lib/finance/forecast/targets/pgTargetLines"

loadEnvLocal()

async function main() {
  const db = getDb()
  const before = await db.execute(sql`SELECT count(*)::int AS n FROM revenue_line_catalog`)
  const beforeN = (
    Array.isArray(before) ? before[0] : (before as { rows: { n: number }[] }).rows[0]
  ) as { n: number }

  // FIN-5 media_billing is presentation breakout only — not a target/catalog line.
  const entries = (Object.values(FINANCE_FORECAST_LINE_KEYS) as FinanceForecastLineKey[])
    .filter((lineKey) => lineKey !== FINANCE_FORECAST_LINE_KEYS.mediaBilling)
    .map((lineKey, i) => ({
      lineKey,
      label: FINANCE_FORECAST_LINE_LABELS[lineKey],
      sortOrder: i + 1,
    }))

  const result = await seedRevenueLineCatalogFromCodeConstants(entries)

  const after = await db.execute(sql`SELECT count(*)::int AS n FROM revenue_line_catalog`)
  const afterN = (
    Array.isArray(after) ? after[0] : (after as { rows: { n: number }[] }).rows[0]
  ) as { n: number }

  console.log(
    JSON.stringify(
      {
        before: beforeN.n,
        after: afterN.n,
        upserted: result.upserted,
        keys: entries.map((e) => e.lineKey),
        note:
          "Catalog mirrors FINANCE_FORECAST_LINE_KEYS; code constants remain runtime SoT this phase.",
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
