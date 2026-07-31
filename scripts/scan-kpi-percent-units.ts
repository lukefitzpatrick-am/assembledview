/**
 * O5 / AV-25 v2 — read-only impact scan of KPI ratio percent fields in BOTH stores.
 *
 * Writes NOTHING to Xano or Postgres. Emits per-cell CSV for Luke's per-row calls
 * on ambiguous 1.0-class values.
 *
 * Usage:
 *   npx tsx scripts/scan-kpi-percent-units.ts
 *   npx tsx scripts/scan-kpi-percent-units.ts --out=tmp/kpi-percent-unit-scan.csv
 *
 * Requires: DATABASE_URL (Postgres), XANO_CLIENTS_BASE_URL + XANO_PUBLISHERS_BASE_URL
 * (or a prior Xano export under scripts/migration/snapshots — falls back to live API).
 */
import fs from "node:fs"
import path from "node:path"
import { loadEnvLocal } from "./migration/_shared"
import { getDb, schema, closeDb } from "@/db"
import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"
import {
  KPI_PERCENT_UNIT_CONTRACT,
  classifyStoredKpiPercentForScan,
} from "@/lib/kpi/percentUnits"

loadEnvLocal()

const REPO_ROOT = process.cwd()
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  "scripts",
  "data",
  "kpi-percent-unit-scan",
  `kpi-percent-unit-scan-${stamp()}.csv`
)

const RATIO_FIELDS = ["ctr", "vtr", "conversion_rate"] as const
const TABLES = [
  {
    name: "campaign_kpi",
    xanoEnv: "XANO_CLIENTS_BASE_URL" as const,
    pg: () => getDb().select().from(schema.campaignKpi),
  },
  {
    name: "client_kpi",
    xanoEnv: "XANO_CLIENTS_BASE_URL" as const,
    pg: () => getDb().select().from(schema.clientKpi),
  },
  {
    name: "publisher_kpi",
    xanoEnv: "XANO_PUBLISHERS_BASE_URL" as const,
    pg: () => getDb().select().from(schema.publisherKpi),
  },
] as const

type CsvRow = {
  store: "xano" | "postgres"
  table: string
  row_id: string
  mba_or_publisher: string
  media_type: string
  bid_strategy: string
  metric: string
  current_value: string
  inferred_unit: string
  proposed_decimal: string
  ambiguous: string
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function parseArgs(): { out: string } {
  let out = DEFAULT_OUT
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length).replace(/^["']|["']$/g, "")
    }
  }
  return { out: path.isAbsolute(out) ? out : path.join(REPO_ROOT, out) }
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function rowMeta(row: Record<string, unknown>): {
  id: string
  mbaOrPublisher: string
  mediaType: string
  bidStrategy: string
} {
  const id = String(row.id ?? row.Id ?? "")
  const mbaOrPublisher = String(
    row.mba_number ??
      row.mbaNumber ??
      row.publisher ??
      row.publisher_name ??
      row.publisherName ??
      row.mp_client_name ??
      row.mpClientName ??
      ""
  )
  const mediaType = String(row.media_type ?? row.mediaType ?? "")
  const bidStrategy = String(row.bid_strategy ?? row.bidStrategy ?? "")
  return { id, mbaOrPublisher, mediaType, bidStrategy }
}

function metricRaw(
  row: Record<string, unknown>,
  metric: (typeof RATIO_FIELDS)[number]
): unknown {
  if (metric === "conversion_rate") {
    return row.conversion_rate ?? row.conversionRate
  }
  return row[metric]
}

function scanRows(
  store: "xano" | "postgres",
  table: string,
  rows: Record<string, unknown>[]
): CsvRow[] {
  const out: CsvRow[] = []
  for (const row of rows) {
    const meta = rowMeta(row)
    for (const metric of RATIO_FIELDS) {
      const classified = classifyStoredKpiPercentForScan(metricRaw(row, metric))
      if (classified.inferredUnit === "empty") continue
      out.push({
        store,
        table,
        row_id: meta.id,
        mba_or_publisher: meta.mbaOrPublisher,
        media_type: meta.mediaType,
        bid_strategy: meta.bidStrategy,
        metric,
        current_value:
          classified.currentValue == null ? "" : String(classified.currentValue),
        inferred_unit: classified.inferredUnit,
        proposed_decimal:
          classified.proposedDecimal == null
            ? ""
            : String(classified.proposedDecimal),
        ambiguous: classified.ambiguous ? "yes" : "no",
      })
    }
  }
  return out
}

async function loadXano(
  table: string,
  envKey: "XANO_CLIENTS_BASE_URL" | "XANO_PUBLISHERS_BASE_URL"
): Promise<Record<string, unknown>[]> {
  const { items, complete } = await fetchAllXanoPagesWithCompleteness(
    xanoUrl(table, envKey),
    {},
    table,
    200,
    200
  )
  if (!complete) {
    console.warn(`[scan] Xano ${table} pagination incomplete — counts may be low`)
  }
  return items as Record<string, unknown>[]
}

async function main(): Promise<void> {
  const { out } = parseArgs()
  const hasDb = Boolean(process.env.DATABASE_URL?.trim())
  if (!hasDb) {
    console.error("DATABASE_URL required for postgres scan")
    process.exit(1)
  }

  const all: CsvRow[] = []
  const summary: Record<
    string,
    { cells: number; ambiguous_1: number; percent_points: number; decimal: number; anomalous: number }
  > = {}

  function bump(key: string, unit: string) {
    if (!summary[key]) {
      summary[key] = {
        cells: 0,
        ambiguous_1: 0,
        percent_points: 0,
        decimal: 0,
        anomalous: 0,
      }
    }
    const s = summary[key]!
    s.cells++
    if (unit === "ambiguous_1") s.ambiguous_1++
    else if (unit === "percent_points") s.percent_points++
    else if (unit === "decimal") s.decimal++
    else if (unit === "anomalous") s.anomalous++
  }

  for (const t of TABLES) {
    const xanoRows = await loadXano(t.name, t.xanoEnv)
    const xanoCells = scanRows("xano", t.name, xanoRows)
    all.push(...xanoCells)
    for (const c of xanoCells) bump(`xano:${t.name}`, c.inferred_unit)

    const pgRaw = await t.pg()
    const pgRows = pgRaw.map((r) => r as unknown as Record<string, unknown>)
    const pgCells = scanRows("postgres", t.name, pgRows)
    all.push(...pgCells)
    for (const c of pgCells) bump(`postgres:${t.name}`, c.inferred_unit)
  }

  const header = [
    "store",
    "table",
    "row_id",
    "mba_or_publisher",
    "media_type",
    "bid_strategy",
    "metric",
    "current_value",
    "inferred_unit",
    "proposed_decimal",
    "ambiguous",
  ]
  const lines = [
    header.join(","),
    ...all.map((r) =>
      header.map((h) => csvEscape(String((r as Record<string, string>)[h] ?? ""))).join(",")
    ),
  ]

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, lines.join("\n") + "\n", "utf8")

  const ambiguousRows = all.filter((r) => r.ambiguous === "yes")
  const percentPointsCells = all.filter((r) => r.inferred_unit === "percent_points")
  const decimalCells = all.filter((r) => r.inferred_unit === "decimal")

  // Evidence check: if percent_points dominate non-null cells, decimal code assumption is risky.
  const classified = percentPointsCells.length + decimalCells.length + ambiguousRows.length
  const ppShare = classified > 0 ? percentPointsCells.length / classified : 0
  const contradictDecimal =
    ppShare > 0.5 && percentPointsCells.length >= 20

  console.log(
    JSON.stringify(
      {
        contract: KPI_PERCENT_UNIT_CONTRACT,
        csvPath: out,
        totalCells: all.length,
        ambiguous_1_count: ambiguousRows.length,
        percent_points_count: percentPointsCells.length,
        decimal_count: decimalCells.length,
        anomalous_count: all.filter((r) => r.inferred_unit === "anomalous").length,
        byStoreTable: summary,
        contradictDecimalRecommendation: contradictDecimal,
        note: contradictDecimal
          ? "STOP: majority still look like percentage points — do not treat code-only decimal flip as sufficient without Luke migration"
          : "decimal-storage recommendation supported enough to land code; migrate ambiguous_1 + remaining percent_points before trusting ETL reload",
      },
      null,
      2
    )
  )

  await closeDb()
  if (contradictDecimal) process.exitCode = 2
}

main().catch(async (err) => {
  console.error(err)
  try {
    await closeDb()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
