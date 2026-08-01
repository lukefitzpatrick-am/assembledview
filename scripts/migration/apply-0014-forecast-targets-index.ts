/**
 * AUTHOR ONLY — apply db/migrations/0014_revenue_forecast_targets_pg.sql
 * (unique index for idempotent target upserts).
 */
import { sql } from "drizzle-orm"
import { getDb, closeDb } from "../../db/index"
import { loadEnvLocal } from "./_shared"

async function main() {
  loadEnvLocal()
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required")
  }
  const db = getDb()
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_forecast_lines_natural_key
    ON revenue_forecast_lines (clients_id, fy, line_key, month)
  `)
  console.log(
    JSON.stringify({ ok: true, index: "idx_revenue_forecast_lines_natural_key" })
  )
  await closeDb()
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
