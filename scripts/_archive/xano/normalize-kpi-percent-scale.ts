/**
 * Normalize publisher_kpi percent metrics (ctr, conversion_rate, vtr) from
 * percent-as-number (0.10 = 0.10%) to decimal-fraction (0.001 = 0.1%).
 *
 * Idempotent: only PATCHes when stored value matches migration map `old_value_percent`.
 *
 * Requires XANO_PUBLISHERS_BASE_URL in .env.local (XANO_API_KEY optional).
 *
 * Usage:
 *   npx tsx scripts/normalize-kpi-percent-scale.ts --dry-run
 *   npx tsx scripts/normalize-kpi-percent-scale.ts --apply
 *   npx tsx scripts/normalize-kpi-percent-scale.ts --apply --only=dav360
 *   npx tsx scripts/normalize-kpi-percent-scale.ts --dry-run --ids=12,34
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import type { PublisherKpi } from "@/lib/kpi/types"
import {
  isMetricEmpty,
  kpiRowKey,
  parseMetricCell,
  type KpiImportRow,
  type KpiMetricField,
} from "./lib/kpiBpMerge"

const REPO_ROOT = process.cwd()
const DEFAULT_DATA_DIR = path.join(REPO_ROOT, "scripts", "data", "kpi-best-practice")
const LAST_RUN_REPORT_PATH = path.join(DEFAULT_DATA_DIR, "last-run-report.json")
const MIGRATION_MAP_PATH = path.join(DEFAULT_DATA_DIR, "publisher_kpi_scale_migration_map.csv")
const NORMALIZE_REPORT_PATH = path.join(DEFAULT_DATA_DIR, "normalize-scale-report.json")

const PERCENT_METRICS = new Set<string>(["ctr", "conversion_rate", "vtr"])

type MigrationEntry = {
  publisher: string
  media_type: string
  bid_strategy: string
  metric: KpiMetricField
  old_value_percent: number
  new_value_decimal: number
}

type MetricDecision =
  | { action: "rescale"; metric: KpiMetricField; stored: number; new: number }
  | { action: "skip_done"; metric: KpiMetricField; stored: number }
  | { action: "skip_warn"; metric: KpiMetricField; stored: number; old: number; new: number }

type RowResult = {
  key: string
  id: number
  patch: Partial<Record<KpiMetricField, number>> | null
  decisions: MetricDecision[]
  error?: string
}

type NormalizeReport = {
  mode: "dry-run" | "apply"
  dataDir: string
  inScopeRowCount: number
  totals: {
    rescale: number
    skip_done: number
    skip_warn: number
    rows_patched: number
    rows_unchanged: number
    errors: number
  }
  byMetric: Record<string, { rescale: number; skip_done: number; skip_warn: number }>
  duplicateKpiKeys: string[]
  warnings: string[]
  rows: RowResult[]
}

function loadEnvLocal(): void {
  const p = path.join(REPO_ROOT, ".env.local")
  if (!fs.existsSync(p)) return
  const text = fs.readFileSync(p, "utf8")
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val
    }
  }
}

function parseArgs(): {
  dryRun: boolean
  dataDir: string
  onlyPublisher: string | null
  ids: number[] | null
} {
  const argv = process.argv.slice(2)
  const dryRun = !argv.includes("--apply")
  let dataDir = DEFAULT_DATA_DIR
  let onlyPublisher: string | null = null
  let ids: number[] | null = null

  for (const arg of argv) {
    if (arg.startsWith("--data-dir=")) {
      dataDir = arg.slice("--data-dir=".length).replace(/^["']|["']$/g, "")
    }
    if (arg.startsWith("--only=")) {
      onlyPublisher = arg.slice("--only=".length).trim()
    }
    if (arg.startsWith("--ids=")) {
      ids = arg
        .slice("--ids=".length)
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n))
    }
  }

  return { dryRun, dataDir, onlyPublisher, ids }
}

/** Minimal RFC-style CSV parser (handles quoted fields with commas and doubled quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ",") {
      row.push(field)
      field = ""
      continue
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(field)
      field = ""
      if (row.length > 1 || row[0] !== "") rows.push(row)
      row = []
      if (ch === "\r") i++
      continue
    }
    if (ch === "\r") {
      row.push(field)
      field = ""
      if (row.length > 1 || row[0] !== "") rows.push(row)
      row = []
      continue
    }
    field += ch
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== "") rows.push(row)
  }

  return rows
}

function readCsvFile(filePath: string): string[][] {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")
  return parseCsv(text)
}

function parseKpiImportCsv(dataDir: string): KpiImportRow[] {
  const file = path.join(dataDir, "publisher_kpi_import.csv")
  const rows = readCsvFile(file)
  const [header, ...body] = rows
  const cols = header.map((h) => h.trim())
  const idx = (name: string) => cols.indexOf(name)

  const iPublisher = idx("publisher")
  const iMedia = idx("media_type")
  const iBid = idx("bid_strategy")
  const iCtr = idx("ctr")
  const iCpv = idx("cpv")
  const iConv = idx("conversion_rate")
  const iVtr = idx("vtr")
  const iFreq = idx("frequency")

  const out: KpiImportRow[] = []
  for (const line of body) {
    if (line.every((c) => c.trim() === "")) continue
    const metrics: KpiImportRow["metrics"] = {}
    const ctr = parseMetricCell(line[iCtr])
    const cpv = parseMetricCell(line[iCpv])
    const conv = parseMetricCell(line[iConv])
    const vtr = parseMetricCell(line[iVtr])
    const freq = parseMetricCell(line[iFreq])
    if (ctr !== null) metrics.ctr = ctr
    if (cpv !== null) metrics.cpv = cpv
    if (conv !== null) metrics.conversion_rate = conv
    if (vtr !== null) metrics.vtr = vtr
    if (freq !== null) metrics.frequency = freq

    out.push({
      publisher: line[iPublisher]?.trim() ?? "",
      media_type: line[iMedia]?.trim() ?? "",
      bid_strategy: line[iBid]?.trim() ?? "",
      metrics,
    })
  }
  return out
}

function parseMigrationMap(mapPath: string): MigrationEntry[] {
  const rows = readCsvFile(mapPath)
  const [header, ...body] = rows
  const cols = header.map((h) => h.trim())
  const idx = (name: string) => cols.indexOf(name)

  const out: MigrationEntry[] = []
  for (const line of body) {
    if (line.every((c) => c.trim() === "")) continue
    const metric = line[idx("metric")]?.trim() as KpiMetricField
    if (!PERCENT_METRICS.has(metric)) continue
    const oldVal = parseFloat(line[idx("old_value_percent")] ?? "")
    const newVal = parseFloat(line[idx("new_value_decimal")] ?? "")
    if (!Number.isFinite(oldVal) || !Number.isFinite(newVal)) continue
    out.push({
      publisher: line[idx("publisher")]?.trim() ?? "",
      media_type: line[idx("media_type")]?.trim() ?? "",
      bid_strategy: line[idx("bid_strategy")]?.trim() ?? "",
      metric,
      old_value_percent: oldVal,
      new_value_decimal: newVal,
    })
  }
  return out
}

function keyToDisplay(key: string): string {
  const [publisher, media_type, bid_strategy] = key.split("\0")
  return `${publisher}/${media_type}/${bid_strategy}`
}

function nearOld(stored: number, old: number): boolean {
  return Math.abs(stored - old) <= Math.abs(old) * 1e-6
}

function nearNew(stored: number, newVal: number): boolean {
  return Math.abs(stored - newVal) <= Math.abs(newVal) * 1e-6 + 1e-12
}

function storedNumeric(row: PublisherKpi, metric: KpiMetricField): number | null {
  // Typed as number, but Xano payloads can deliver strings/empties at runtime.
  const raw = row[metric] as number | string | null | undefined
  if (raw === null || raw === undefined || raw === "") return null
  const n = typeof raw === "number" ? raw : Number(String(raw).trim())
  return Number.isFinite(n) ? n : null
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  }
  const apiKey = process.env.XANO_API_KEY
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

function indexKpiRows(rows: PublisherKpi[]): {
  byKey: Map<string, PublisherKpi>
  duplicateKeys: string[]
} {
  const byKey = new Map<string, PublisherKpi>()
  const duplicateKeys: string[] = []
  for (const row of rows) {
    const key = kpiRowKey(row.publisher, row.media_type, row.bid_strategy)
    if (byKey.has(key)) duplicateKeys.push(key)
    else byKey.set(key, row)
  }
  return { byKey, duplicateKeys }
}

type LastRunReport = {
  kpi?: {
    create?: number
    patch?: number
    skip?: number
    inScopeKeys?: string[]
  }
}

function importValueMatchesStored(importVal: number, stored: number): boolean {
  return Math.abs(stored - importVal) <= Math.abs(importVal) * 1e-6 + 1e-12
}

/**
 * Rows the bulk import created or patched (559 + 24 = 583). Prefer explicit
 * `kpi.inScopeKeys` from last-run-report.json; otherwise derive from import CSV:
 * a row is in scope when at least one import metric still matches live (import
 * wrote it). Skipped import rows (pre-existing values kept) are excluded.
 */
function deriveInScopeKeys(
  importRows: KpiImportRow[],
  byKey: Map<string, PublisherKpi>,
  migrationByKey: Map<string, MigrationEntry[]>,
  report: LastRunReport | null,
): Set<string> {
  if (report?.kpi?.inScopeKeys?.length) {
    return new Set(report.kpi.inScopeKeys)
  }

  const inScope = new Set<string>()
  for (const importRow of importRows) {
    const key = kpiRowKey(importRow.publisher, importRow.media_type, importRow.bid_strategy)
    const mapForKey = migrationByKey.get(key)
    if (!mapForKey?.length) continue

    const existing = byKey.get(key)
    if (!existing) {
      inScope.add(key)
      continue
    }

    const percentFieldsInMap = new Set(mapForKey.map((e) => e.metric))
    let anyImportPercentMatches = false
    for (const field of percentFieldsInMap) {
      const importVal = importRow.metrics[field]
      if (importVal === undefined || importVal === null) continue
      const stored = storedNumeric(existing, field)
      if (stored === null || isMetricEmpty(stored)) continue
      if (importValueMatchesStored(importVal, stored)) {
        anyImportPercentMatches = true
        break
      }
    }
    if (anyImportPercentMatches) inScope.add(key)
  }

  const expected = (report?.kpi?.create ?? 0) + (report?.kpi?.patch ?? 0)
  if (expected > 0 && inScope.size !== expected) {
    console.warn(
      `[normalize] in-scope key count ${inScope.size} != last-run-report create+patch (${expected}); review before --apply`,
    )
  }

  return inScope
}

function groupMigrationByKey(entries: MigrationEntry[]): Map<string, MigrationEntry[]> {
  const map = new Map<string, MigrationEntry[]>()
  for (const entry of entries) {
    const key = kpiRowKey(entry.publisher, entry.media_type, entry.bid_strategy)
    const list = map.get(key) ?? []
    list.push(entry)
    map.set(key, list)
  }
  return map
}

function decideMetric(
  row: PublisherKpi,
  entry: MigrationEntry,
): MetricDecision {
  const stored = storedNumeric(row, entry.metric)
  const { old_value_percent: old, new_value_decimal: newVal, metric } = entry

  if (stored === null || isMetricEmpty(stored)) {
    return { action: "skip_warn", metric, stored: stored ?? 0, old, new: newVal }
  }

  if (nearOld(stored, old)) {
    return { action: "rescale", metric, stored, new: newVal }
  }
  if (nearNew(stored, newVal)) {
    return { action: "skip_done", metric, stored }
  }
  return { action: "skip_warn", metric, stored, old, new: newVal }
}

function emptyReport(mode: "dry-run" | "apply", dataDir: string): NormalizeReport {
  return {
    mode,
    dataDir,
    inScopeRowCount: 0,
    totals: {
      rescale: 0,
      skip_done: 0,
      skip_warn: 0,
      rows_patched: 0,
      rows_unchanged: 0,
      errors: 0,
    },
    byMetric: {},
    duplicateKpiKeys: [],
    warnings: [],
    rows: [],
  }
}

function bumpMetricCount(
  byMetric: NormalizeReport["byMetric"],
  metric: string,
  action: "rescale" | "skip_done" | "skip_warn",
): void {
  if (!byMetric[metric]) {
    byMetric[metric] = { rescale: 0, skip_done: 0, skip_warn: 0 }
  }
  byMetric[metric][action]++
}

function printTable(report: NormalizeReport): void {
  const changes = report.rows.flatMap((row) =>
    row.decisions
      .filter((d) => d.action === "rescale")
      .map((d) => ({
        key: keyToDisplay(row.key),
        metric: d.metric,
        stored: (d as { stored: number }).stored,
        new: (d as { new: number }).new,
      })),
  )

  console.info("\n[normalize] Planned RESCALE changes:")
  console.info("key · metric · stored → new")
  for (const c of changes.slice(0, 50)) {
    console.info(`${c.key} · ${c.metric} · ${c.stored} → ${c.new}`)
  }
  if (changes.length > 50) {
    console.info(`… and ${changes.length - 50} more`)
  }

  console.info("\n[normalize] Totals:")
  console.info(
    `  RESCALE=${report.totals.rescale} SKIP-done=${report.totals.skip_done} SKIP-warn=${report.totals.skip_warn}`,
  )
  console.info(
    `  rows: patched=${report.totals.rows_patched} unchanged=${report.totals.rows_unchanged} errors=${report.totals.errors}`,
  )
  console.info("  per-metric:")
  for (const [metric, counts] of Object.entries(report.byMetric).sort()) {
    console.info(
      `    ${metric}: rescale=${counts.rescale} skip_done=${counts.skip_done} skip_warn=${counts.skip_warn}`,
    )
  }
}

async function main(): Promise<void> {
  loadEnvLocal()
  const { dryRun, dataDir, onlyPublisher, ids } = parseArgs()

  if (!process.env.XANO_PUBLISHERS_BASE_URL) {
    console.error("[normalize] Missing XANO_PUBLISHERS_BASE_URL")
    process.exit(1)
  }

  const mapPath = path.join(dataDir, "publisher_kpi_scale_migration_map.csv")
  if (!fs.existsSync(mapPath)) {
    console.error(`[normalize] migration map not found: ${mapPath}`)
    process.exit(1)
  }

  let lastRunReport: LastRunReport | null = null
  if (fs.existsSync(LAST_RUN_REPORT_PATH)) {
    lastRunReport = JSON.parse(fs.readFileSync(LAST_RUN_REPORT_PATH, "utf8")) as LastRunReport
  }

  const migrationEntries = parseMigrationMap(mapPath)
  const migrationByKey = groupMigrationByKey(migrationEntries)
  const importRows = parseKpiImportCsv(dataDir)

  const listUrl = xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL")
  console.info("[normalize] Fetching publisher_kpi from Xano …")
  const { items } = await fetchAllXanoPagesWithCompleteness(listUrl, {}, "publisher_kpi", 200, 50)
  const liveRows = items as PublisherKpi[]
  const { byKey, duplicateKeys } = indexKpiRows(liveRows)

  const inScopeKeys = deriveInScopeKeys(importRows, byKey, migrationByKey, lastRunReport)
  const report = emptyReport(dryRun ? "dry-run" : "apply", dataDir)
  report.duplicateKpiKeys = duplicateKeys
  report.inScopeRowCount = inScopeKeys.size

  if (duplicateKeys.length > 0) {
    report.warnings.push(
      `Live Xano has ${duplicateKeys.length} duplicate publisher_kpi key(s); using first row only.`,
    )
  }

  const base = listUrl.replace(/\/?$/, "")
  const headers = authHeaders()

  for (const key of inScopeKeys) {
    const [publisher] = key.split("\0")
    if (onlyPublisher && publisher !== onlyPublisher) continue

    const row = byKey.get(key)
    if (!row) {
      report.warnings.push(`${keyToDisplay(key)}: no live row (missing in Xano)`)
      continue
    }

    if (ids && !ids.includes(row.id)) continue

    if (duplicateKeys.includes(key)) {
      report.warnings.push(`${keyToDisplay(key)}: duplicate key — using id=${row.id}`)
    }

    const mapForKey = migrationByKey.get(key) ?? []
    const decisions: MetricDecision[] = []
    const patch: Partial<Record<KpiMetricField, number>> = {}

    for (const entry of mapForKey) {
      const decision = decideMetric(row, entry)
      decisions.push(decision)
      bumpMetricCount(report.byMetric, entry.metric, decision.action)
      report.totals[decision.action]++

      if (decision.action === "rescale") {
        patch[decision.metric] = decision.new
      }
    }

    const rowResult: RowResult = {
      key,
      id: row.id,
      patch: Object.keys(patch).length > 0 ? patch : null,
      decisions,
    }

    if (Object.keys(patch).length > 0) {
      if (!dryRun) {
        try {
          await axios.patch(`${base}/${row.id}`, patch, { headers, timeout: 30000 })
          report.totals.rows_patched++
        } catch (e) {
          report.totals.errors++
          const msg = axios.isAxiosError(e) ? e.message : String(e)
          rowResult.error = msg
          report.warnings.push(`${keyToDisplay(key)}: PATCH failed: ${msg}`)
        }
      } else {
        report.totals.rows_patched++
      }
    } else {
      report.totals.rows_unchanged++
    }

    report.rows.push(rowResult)
  }

  printTable(report)

  if (!dryRun) {
    fs.writeFileSync(NORMALIZE_REPORT_PATH, JSON.stringify(report, null, 2), "utf8")
    console.info(`\n[normalize] Wrote report: ${NORMALIZE_REPORT_PATH}`)
  }

  console.info(`\n[normalize] mode=${report.mode} inScopeRows=${report.inScopeRowCount}`)
  if (report.warnings.length > 0) {
    console.info(`[normalize] warnings (${report.warnings.length}):`)
    for (const w of report.warnings.slice(0, 15)) console.info(`  - ${w}`)
  }

  if (report.totals.errors > 0) process.exit(1)
}

main().catch((err) => {
  console.error("[normalize] fatal:", err)
  process.exit(1)
})
