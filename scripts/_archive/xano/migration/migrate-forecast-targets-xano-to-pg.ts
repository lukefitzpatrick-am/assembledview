/**
 * One-off: copy Xano revenue_forecast_lines → Postgres (idempotent natural key).
 *
 * Live probe 2026-08-01: Xano held **0** rows across all clients × FY 2023–2027
 * (API requires financial_year_start_year + client_id). Default run samples the first
 * N clients; if empty, skips the full crawl. Pass `--full` to scan every client.
 *
 * Usage:
 *   npm run db:migrate-forecast-targets
 *   npm run db:migrate-forecast-targets -- --dry-run
 *   npm run db:migrate-forecast-targets -- --full
 */
import { sql } from "drizzle-orm"
import { getDb, closeDb } from "@/db"
import { loadEnvLocal } from "@/scripts/migration/_shared"
import { fetchRevenueForecastTargetLinesFromXano } from "@/lib/finance/forecast/targets/xanoTargetLines"
import { upsertRevenueForecastTargetLine } from "@/lib/finance/forecast/targets/pgTargetLines"

loadEnvLocal()

const DRY = process.argv.includes("--dry-run")
const FULL = process.argv.includes("--full")
const SAMPLE_CLIENTS = 5
const FYS = [2023, 2024, 2025, 2026, 2027]
const CONCURRENCY = 6

function countN(result: unknown): number {
  const row = (
    Array.isArray(result) ? result[0] : (result as { rows: { n: number }[] }).rows[0]
  ) as { n: number }
  return row?.n ?? 0
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return out
}

async function scanClientYears(
  clientIds: number[],
  fys: number[]
): Promise<{ xanoTotal: number; lines: Awaited<ReturnType<typeof fetchRevenueForecastTargetLinesFromXano>> }> {
  const jobs = clientIds.flatMap((id) =>
    fys.map((fy) => ({ client_id: String(id), financial_year_start_year: fy }))
  )
  const batches = await mapPool(jobs, CONCURRENCY, (job) =>
    fetchRevenueForecastTargetLinesFromXano(job)
  )
  const lines = batches.flat()
  return { xanoTotal: lines.length, lines }
}

async function main() {
  const db = getDb()
  const beforeN = countN(
    await db.execute(sql`SELECT count(*)::int AS n FROM revenue_forecast_lines`)
  )

  const clientResult = await db.execute(sql`SELECT id FROM clients ORDER BY id`)
  const clients = (
    Array.isArray(clientResult)
      ? clientResult
      : ((clientResult as { rows?: { id: number }[] }).rows ?? [])
  ) as { id: number }[]

  const clientIds = clients.map((c) => c.id)
  if (clientIds.length === 0) {
    console.log(
      JSON.stringify(
        {
          dryRun: DRY,
          xanoRowsScanned: 0,
          upserted: 0,
          pgBefore: beforeN,
          pgAfter: beforeN,
          note: "No clients in PG — nothing to migrate.",
        },
        null,
        2
      )
    )
    await closeDb()
    return
  }

  const sampleIds = clientIds.slice(0, SAMPLE_CLIENTS)
  const sample = await scanClientYears(sampleIds, FYS)

  let toMigrate = sample.lines
  let xanoTotal = sample.xanoTotal
  let scanMode: "sample-empty-skip" | "sample-found-full" | "full" = "full"

  if (!FULL && sample.xanoTotal === 0) {
    scanMode = "sample-empty-skip"
    xanoTotal = 0
    toMigrate = []
  } else if (!FULL && sample.xanoTotal > 0) {
    scanMode = "sample-found-full"
    const rest = clientIds.slice(SAMPLE_CLIENTS)
    if (rest.length > 0) {
      const restScan = await scanClientYears(rest, FYS)
      xanoTotal += restScan.xanoTotal
      toMigrate = [...sample.lines, ...restScan.lines]
    }
  } else {
    scanMode = "full"
    if (clientIds.length > SAMPLE_CLIENTS) {
      // Re-scan all (sample already counted — avoid double-count by rescanning all)
      const all = await scanClientYears(clientIds, FYS)
      xanoTotal = all.xanoTotal
      toMigrate = all.lines
    }
  }

  let upserted = 0
  if (!DRY) {
    for (const line of toMigrate) {
      await upsertRevenueForecastTargetLine({
        cell: {
          client_id: line.client_id,
          financial_year_start_year: line.financial_year_start_year,
          line_key: line.line_key,
          month_key: line.month_key,
          amount: line.amount,
          client_name: line.client_name ?? null,
        },
        updatedBy: line.updated_by ?? "migrate-forecast-targets",
      })
      upserted += 1
    }
  }

  const afterN = countN(
    await db.execute(sql`SELECT count(*)::int AS n FROM revenue_forecast_lines`)
  )

  console.log(
    JSON.stringify(
      {
        dryRun: DRY,
        scanMode,
        clientsInPg: clientIds.length,
        sampleClients: sampleIds.length,
        xanoRowsScanned: xanoTotal,
        upserted: DRY ? 0 : upserted,
        pgBefore: beforeN,
        pgAfter: afterN,
        note:
          scanMode === "sample-empty-skip"
            ? `Sample of ${SAMPLE_CLIENTS} clients × FY ${FYS[0]}–${FYS[FYS.length - 1]} empty on Xano — full crawl skipped (pass --full to force). No row migration needed.`
            : "Migrated Xano → PG on (clients_id, fy, line_key, month).",
      },
      null,
      2
    )
  )
  await closeDb()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
