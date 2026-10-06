/**
 * Author-only: one-time move of Finance Forecast snapshots Xano → Postgres.
 *
 * Requires:
 *   - 0016_finance_forecast_snapshots.sql applied
 *   - DATABASE_URL
 *   - XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL (source)
 *
 * Usage:
 *   npm run db:migrate-forecast-snapshots
 *
 * Re-inserts headers+lines with new PG ids (does not preserve Xano ids).
 * Skips when Xano list is empty or env unset.
 */
import { loadEnvLocal } from "@/scripts/migration/_shared"
import {
  fetchFinanceForecastSnapshotLinesFromXanoLegacy,
  fetchFinanceForecastSnapshotListFromXanoLegacy,
} from "@/lib/finance/forecast/snapshot/xanoSnapshotQuery"
import {
  countFinanceForecastSnapshotRows,
  persistFinanceForecastSnapshotToPostgres,
} from "@/lib/finance/forecast/snapshot/pgSnapshots"
import type { FinanceForecastSnapshotStagingPayload } from "@/lib/types/financeForecastSnapshot"

loadEnvLocal()

async function main() {
  const xanoBase = process.env.XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL?.trim()
  if (!xanoBase) {
    console.log(
      JSON.stringify(
        {
          scanMode: "xano-env-unset-skip",
          xanoHeaders: 0,
          upsertedHeaders: 0,
          upsertedLines: 0,
        },
        null,
        2
      )
    )
    return
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required")
  }

  const before = await countFinanceForecastSnapshotRows()
  const headers = await fetchFinanceForecastSnapshotListFromXanoLegacy()
  if (headers.length === 0) {
    console.log(
      JSON.stringify(
        {
          scanMode: "xano-empty-skip",
          xanoHeaders: 0,
          upsertedHeaders: 0,
          upsertedLines: 0,
          pgBefore: before,
          pgAfter: before,
        },
        null,
        2
      )
    )
    return
  }

  let upsertedHeaders = 0
  let upsertedLines = 0

  for (const header of headers) {
    const lines = await fetchFinanceForecastSnapshotLinesFromXanoLegacy(String(header.id))
    const staging: FinanceForecastSnapshotStagingPayload = {
      header: {
        snapshot_label: header.snapshot_label,
        snapshot_type: header.snapshot_type,
        financial_year: header.financial_year,
        scenario: header.scenario,
        taken_at: header.taken_at,
        taken_by: header.taken_by,
        notes: header.notes,
        source_version_summary: header.source_version_summary,
        filter_context_json: header.filter_context_json ?? null,
      },
      lines: lines.map(({ id: _id, snapshot_id: _sid, ...rest }) => rest),
    }
    await persistFinanceForecastSnapshotToPostgres(staging)
    upsertedHeaders += 1
    upsertedLines += lines.length
  }

  const after = await countFinanceForecastSnapshotRows()
  console.log(
    JSON.stringify(
      {
        scanMode: "full",
        xanoHeaders: headers.length,
        upsertedHeaders,
        upsertedLines,
        pgBefore: before,
        pgAfter: after,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
