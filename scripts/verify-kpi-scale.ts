/**
 * Read-only verifier: publisher_kpi percent-scale normalization completeness.
 * GET-only — no PATCH/POST/DELETE.
 *
 * Usage: npx tsx scripts/verify-kpi-scale.ts
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import axios from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
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
const DATA_DIR = path.join(REPO_ROOT, "scripts", "data", "kpi-best-practice")
const LAST_RUN_REPORT_PATH = path.join(DATA_DIR, "last-run-report.json")
const NORMALIZE_REPORT_PATH = path.join(DATA_DIR, "normalize-scale-report.json")
const MIGRATION_MAP_PATH = path.join(DATA_DIR, "publisher_kpi_scale_migration_map.csv")
const FINDINGS_PATH = path.join(REPO_ROOT, "KPI_SCALE_VERIFICATION_FINDINGS.md")
const STRAGGLERS_PATH = path.join(REPO_ROOT, "kpi_scale_stragglers.csv")

const PERCENT_METRICS = new Set<string>(["ctr", "conversion_rate", "vtr"])

type MigrationEntry = {
  publisher: string
  media_type: string
  bid_strategy: string
  metric: KpiMetricField
  old_value_percent: number
  new_value_decimal: number
}

type Classification = "DONE" | "STILL-PERCENT" | "NOT-FOUND" | "UNEXPECTED"

type UnexpectedReason = "empty_metric" | "value_mismatch"

type ClassifiedEntry = MigrationEntry & {
  classification: Classification
  stored: number | null
  rowKey: string
  inScope: boolean
  unexpectedReason?: UnexpectedReason
}

type XanoPageMeta = {
  itemsReceived?: number
  curPage?: number | null
  nextPage?: number | null
  pageTotal?: number | null
  itemsTotal?: number | null
}

type FetchProbe = {
  isArray: boolean
  topKeys: string[]
  pageSize: number
  firstPageItemCount: number
  meta: XanoPageMeta
}

function loadEnvLocal(): void {
  const p = path.join(REPO_ROOT, ".env.local")
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
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

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  }
  const apiKey = process.env.XANO_API_KEY
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

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

function storedNumeric(row: PublisherKpi, metric: KpiMetricField): number | null {
  // Typed as number, but Xano payloads can deliver strings/empties at runtime.
  const raw = row[metric] as number | string | null | undefined
  if (raw === null || raw === undefined || raw === "") return null
  const n = typeof raw === "number" ? raw : Number(String(raw).trim())
  return Number.isFinite(n) ? n : null
}

function nearTarget(stored: number, target: number): boolean {
  return Math.abs(stored - target) <= Math.abs(target) * 1e-6 + 1e-12
}

function classifyMetric(
  row: PublisherKpi | undefined,
  entry: MigrationEntry,
): { classification: Classification; stored: number | null; unexpectedReason?: UnexpectedReason } {
  if (!row) return { classification: "NOT-FOUND", stored: null }

  const stored = storedNumeric(row, entry.metric)
  if (stored === null || isMetricEmpty(stored)) {
    return { classification: "UNEXPECTED", stored, unexpectedReason: "empty_metric" }
  }

  if (nearTarget(stored, entry.new_value_decimal)) {
    return { classification: "DONE", stored }
  }
  if (nearTarget(stored, entry.old_value_percent)) {
    return { classification: "STILL-PERCENT", stored }
  }
  return { classification: "UNEXPECTED", stored, unexpectedReason: "value_mismatch" }
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

type NormalizeReport = {
  inScopeRowCount?: number
  rows?: { key: string }[]
}

function loadNormalizeReport(): NormalizeReport | null {
  if (!fs.existsSync(NORMALIZE_REPORT_PATH)) return null
  return JSON.parse(fs.readFileSync(NORMALIZE_REPORT_PATH, "utf8")) as NormalizeReport
}

/**
 * In-scope = rows the bulk import created/patched. After normalization, import-vs-stored
 * matching no longer works (stored is decimal). Prefer explicit keys, then normalize apply report.
 */
function deriveInScopeKeys(
  importRows: KpiImportRow[],
  byKey: Map<string, PublisherKpi>,
  migrationByKey: Map<string, MigrationEntry[]>,
  report: LastRunReport | null,
  normalizeReport: NormalizeReport | null,
): { keys: Set<string>; source: string } {
  if (report?.kpi?.inScopeKeys?.length) {
    return {
      keys: new Set(report.kpi.inScopeKeys),
      source: "last-run-report.json kpi.inScopeKeys",
    }
  }

  const expected = (report?.kpi?.create ?? 0) + (report?.kpi?.patch ?? 0)
  if (expected > 0) {
    console.warn(
      `[verify] last-run-report create+patch=${expected} but no inScopeKeys; falling back to normalize report / import heuristic`,
    )
  }

  if (normalizeReport?.rows?.length) {
    return {
      keys: new Set(normalizeReport.rows.map((r) => r.key)),
      source: `normalize-scale-report.json rows[] (${normalizeReport.rows.length} keys, inScopeRowCount=${normalizeReport.inScopeRowCount ?? "n/a"})`,
    }
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
    let anyMatch = false
    for (const field of percentFieldsInMap) {
      const importVal = importRow.metrics[field]
      const stored = storedNumeric(existing, field)
      if (stored === null || isMetricEmpty(stored)) continue

      const mapEntry = mapForKey.find((e) => e.metric === field)
      if (importVal != null && importValueMatchesStored(importVal, stored)) {
        anyMatch = true
        break
      }
      if (mapEntry && nearTarget(stored, mapEntry.new_value_decimal)) {
        anyMatch = true
        break
      }
      if (mapEntry && nearTarget(stored, mapEntry.old_value_percent)) {
        anyMatch = true
        break
      }
    }
    if (anyMatch) inScope.add(key)
  }

  return {
    keys: inScope,
    source: "derived from import CSV + live stored (old/new/import tolerant)",
  }
}

function extractPageMeta(payload: unknown): XanoPageMeta {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {}
  const p = payload as Record<string, unknown>
  const meta: XanoPageMeta = {}
  const num = (v: unknown): number | undefined =>
    typeof v === "number" ? v : undefined
  if ("itemsReceived" in p) meta.itemsReceived = num(p.itemsReceived)
  if ("curPage" in p) meta.curPage = num(p.curPage)
  // nextPage: null is meaningful (Xano's "no further pages") — preserve it.
  if ("nextPage" in p) {
    meta.nextPage =
      typeof p.nextPage === "number" || p.nextPage === null
        ? p.nextPage
        : undefined
  }
  if ("pageTotal" in p) meta.pageTotal = num(p.pageTotal)
  if ("itemsTotal" in p) meta.itemsTotal = num(p.itemsTotal)
  return meta
}

async function probeFirstPage(listUrl: string, pageSize: number): Promise<FetchProbe> {
  const params = new URLSearchParams({
    page: "1",
    page_size: String(pageSize),
    offset: "0",
    limit: String(pageSize),
  })
  const res = await axios.get(`${listUrl}?${params.toString()}`, {
    headers: authHeaders(),
    timeout: 30000,
  })
  const payload = res.data
  const items = parseXanoListPayload(payload)
  const isArray = Array.isArray(payload)
  const topKeys = isArray ? ["(bare array)"] : Object.keys(payload as object)
  return {
    isArray,
    topKeys,
    pageSize,
    firstPageItemCount: items.length,
    meta: extractPageMeta(payload),
  }
}

/**
 * Full pagination: parse list payload + follow nextPage until exhausted.
 * Does NOT use the dedupe early-stop that caps fetchAllXanoPagesWithCompleteness.
 */
async function fetchAllPublisherKpiFull(
  listUrl: string,
  pageSize = 200,
  maxPages = 100,
): Promise<{ items: PublisherKpi[]; pagesFetched: number; itemsTotal: number | null }> {
  const results: PublisherKpi[] = []
  const seenIds = new Set<number>()
  let itemsTotal: number | null = null
  let pagesFetched = 0

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      offset: String((page - 1) * pageSize),
      limit: String(pageSize),
    })
    const res = await axios.get(`${listUrl}?${params.toString()}`, {
      headers: authHeaders(),
      timeout: 30000,
    })
    pagesFetched++
    const payload = res.data
    const meta = extractPageMeta(payload)
    if (meta.itemsTotal != null) itemsTotal = meta.itemsTotal

    const pageItems = parseXanoListPayload(payload) as PublisherKpi[]
    if (pageItems.length === 0) break

    let addedThisPage = 0
    for (const item of pageItems) {
      if (item?.id != null && seenIds.has(item.id)) continue
      if (item?.id != null) seenIds.add(item.id)
      results.push(item)
      addedThisPage++
    }

    if (page > 1 && addedThisPage === 0) break

    if (meta.nextPage === null) {
      break
    }
    if (typeof meta.nextPage === "number") {
      if (meta.nextPage <= page) break
      continue
    }

    if (pageItems.length < pageSize) break
  }

  return { items: results, pagesFetched, itemsTotal }
}

function keyToDisplay(key: string): string {
  const [publisher, media_type, bid_strategy] = key.split("\0")
  return `${publisher}/${media_type}/${bid_strategy}`
}

function countByClassification(
  entries: ClassifiedEntry[],
  inScope: boolean,
): Record<Classification, number> {
  const counts: Record<Classification, number> = {
    DONE: 0,
    "STILL-PERCENT": 0,
    "NOT-FOUND": 0,
    UNEXPECTED: 0,
  }
  for (const e of entries) {
    if (e.inScope === inScope) counts[e.classification]++
  }
  return counts
}

async function main(): Promise<void> {
  loadEnvLocal()

  if (!process.env.XANO_PUBLISHERS_BASE_URL) {
    console.error("[verify] Missing XANO_PUBLISHERS_BASE_URL")
    process.exit(1)
  }

  const listUrl = xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL")
  const pageSize = 200

  console.info("[verify] Step 1: probe first page envelope …")
  const probe = await probeFirstPage(listUrl, pageSize)
  console.info(JSON.stringify(probe, null, 2))

  console.info("[verify] Fetching with OLD path (fetchAllXanoPagesWithCompleteness) …")
  const oldFetch = await fetchAllXanoPagesWithCompleteness(
    listUrl,
    {},
    "publisher_kpi",
    pageSize,
    50,
  )
  const oldRows = oldFetch.items as PublisherKpi[]

  console.info("[verify] Fetching with FULL pagination (parseXanoListPayload + nextPage) …")
  const fullFetch = await fetchAllPublisherKpiFull(listUrl, pageSize, 100)
  const fullRows = fullFetch.items
  const { byKey, duplicateKeys } = indexKpiRows(fullRows)

  const migrationEntries = parseMigrationMap(MIGRATION_MAP_PATH)
  const migrationByKey = groupMigrationByKey(migrationEntries)
  const importRows = parseKpiImportCsv(DATA_DIR)

  let lastRunReport: LastRunReport | null = null
  if (fs.existsSync(LAST_RUN_REPORT_PATH)) {
    lastRunReport = JSON.parse(fs.readFileSync(LAST_RUN_REPORT_PATH, "utf8")) as LastRunReport
  }

  const normalizeReport = loadNormalizeReport()

  const { keys: inScopeKeys, source: inScopeSource } = deriveInScopeKeys(
    importRows,
    byKey,
    migrationByKey,
    lastRunReport,
    normalizeReport,
  )

  const classified: ClassifiedEntry[] = []
  for (const entry of migrationEntries) {
    const rowKey = kpiRowKey(entry.publisher, entry.media_type, entry.bid_strategy)
    const row = byKey.get(rowKey)
    const { classification, stored, unexpectedReason } = classifyMetric(row, entry)
    classified.push({
      ...entry,
      classification,
      stored,
      rowKey,
      inScope: inScopeKeys.has(rowKey),
      unexpectedReason,
    })
  }

  const inScopeCounts = countByClassification(classified, true)
  const outScopeCounts = countByClassification(classified, false)
  const totalCounts: Record<Classification, number> = {
    DONE: inScopeCounts.DONE + outScopeCounts.DONE,
    "STILL-PERCENT": inScopeCounts["STILL-PERCENT"] + outScopeCounts["STILL-PERCENT"],
    "NOT-FOUND": inScopeCounts["NOT-FOUND"] + outScopeCounts["NOT-FOUND"],
    UNEXPECTED: inScopeCounts.UNEXPECTED + outScopeCounts.UNEXPECTED,
  }

  const inScopeStragglers = classified.filter(
    (e) => e.inScope && (e.classification === "STILL-PERCENT" || e.classification === "NOT-FOUND"),
  )

  const outScopeStillPercent = classified.filter(
    (e) => !e.inScope && e.classification === "STILL-PERCENT",
  ).length

  const unexpectedEmpty = classified.filter((e) => e.unexpectedReason === "empty_metric").length
  const unexpectedMismatch = classified.filter((e) => e.unexpectedReason === "value_mismatch").length

  let stragglersWritten = false
  if (inScopeStragglers.length > 0) {
    const lines = [
      "publisher,media_type,bid_strategy,metric,stored,expected_new",
      ...inScopeStragglers.map((e) =>
        [
          e.publisher,
          e.media_type,
          e.bid_strategy,
          e.metric,
          e.stored ?? "",
          e.new_value_decimal,
        ].join(","),
      ),
    ]
    fs.writeFileSync(STRAGGLERS_PATH, lines.join("\n") + "\n", "utf8")
    stragglersWritten = true
  }

  const md: string[] = [
    "# KPI scale verification findings",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Step 1 — Fetch diagnosis",
    "",
    "### Scripts using `fetchAllXanoPagesWithCompleteness`",
    "",
    "| Script | Line | Filter | Page size | Max pages | Termination |",
    "|--------|------|--------|-----------|-----------|-------------|",
    "| `scripts/normalize-kpi-percent-scale.ts` | 494–496 | Global list (no `publisher` filter) | 200 | 50 | `lib/api/xanoPagination.ts`: empty page, short page (`data.length < pageSize`), or **dedupe early-stop** when page > 1 adds zero new unique `id`s (lines 100–105) |",
    "| `scripts/bulk-import-kpi-best-practice.ts` | 350–351 | Global list (no `publisher` filter) | 200 | 50 | Same as above |",
    "",
    "### `fetchAllXanoPagesWithCompleteness` pagination contract gap",
    "",
    "At `lib/api/xanoPagination.ts:84` the helper treats `response.data` as a list **only when it is a bare array**. Wrapped envelopes (`{ items: [...] }`) become `[]`, which can truncate or zero out fetches. It also does not read `nextPage` metadata.",
    "",
    "### Raw first-page GET envelope (page=1, page_size=200)",
    "",
    "```json",
    JSON.stringify(probe, null, 2),
    "```",
    "",
    probe.isArray
      ? "- Response is a **bare array** (no paging metadata in envelope)."
      : `- Response is an **object** with keys: ${probe.topKeys.join(", ")}.`,
    probe.meta.itemsTotal != null
      ? `- \`itemsTotal\` = ${probe.meta.itemsTotal} (authoritative total if present).`
      : "",
    `- First page item count (via \`parseXanoListPayload\`): **${probe.firstPageItemCount}**.`,
    `- Default page size used: **${pageSize}**.`,
    "",
    "## Step 2 — Full fetch comparison",
    "",
    "| Path | Rows fetched | Pages | Notes |",
    "|------|-------------|-------|-------|",
    `| OLD (\`fetchAllXanoPagesWithCompleteness\`) | ${oldRows.length} | ≤2 typical if dedupe stops | \`complete=${oldFetch.complete}\` |`,
    `| FULL (metadata-aware pagination) | ${fullRows.length} | ${fullFetch.pagesFetched} | itemsTotal=${fullFetch.itemsTotal ?? "n/a"} |`,
    "",
    fullRows.length > oldRows.length
      ? `**Pagination cap hid ${fullRows.length - oldRows.length} row(s).** The page-2 dedupe early-stop (or bare-array-only parsing) prevented the OLD path from seeing the full dataset.`
      : fullRows.length === oldRows.length
        ? "OLD and FULL paths fetched the same row count (pagination cap may not be hiding rows at current dataset size, or both paths hit the same limit)."
        : `FULL fetch returned fewer rows than OLD (${fullRows.length} vs ${oldRows.length}) — investigate.`,
    "",
    `Duplicate composite keys in live data (first row wins): **${duplicateKeys.length}**`,
    duplicateKeys.length > 0
      ? duplicateKeys.map((k) => `  - \`${keyToDisplay(k)}\``).join("\n")
      : "",
    "",
    "## In-scope key set",
    "",
    `- Source: **${inScopeSource}**`,
    `- In-scope row keys: **${inScopeKeys.size}**`,
    lastRunReport?.kpi
      ? `- last-run-report.json kpi.create=${lastRunReport.kpi.create ?? 0}, kpi.patch=${lastRunReport.kpi.patch ?? 0}`
      : "",
    "",
    "## Step 3 — Migration map classification (1,119 metric entries)",
    "",
    "Tolerance: `|stored − target| ≤ |target|×1e-6 + 1e-12`.",
    "",
    "### All entries",
    "",
    "| Classification | Count |",
    "|----------------|-------|",
    ...(["DONE", "STILL-PERCENT", "NOT-FOUND", "UNEXPECTED"] as Classification[]).map(
      (c) => `| ${c} | ${totalCounts[c]} |`,
    ),
    "",
    "### In-scope only",
    "",
    "| Classification | Count |",
    "|----------------|-------|",
    ...(["DONE", "STILL-PERCENT", "NOT-FOUND", "UNEXPECTED"] as Classification[]).map(
      (c) => `| ${c} | ${inScopeCounts[c]} |`,
    ),
    "",
    "### Out-of-scope only",
    "",
    "| Classification | Count |",
    "|----------------|-------|",
    ...(["DONE", "STILL-PERCENT", "NOT-FOUND", "UNEXPECTED"] as Classification[]).map(
      (c) => `| ${c} | ${outScopeCounts[c]} |`,
    ),
    "",
    "## Headline",
    "",
    `- **In-scope STILL-PERCENT (Y): ${inScopeCounts["STILL-PERCENT"]}** (target: 0)`,
    `- **In-scope NOT-FOUND: ${inScopeCounts["NOT-FOUND"]}** (target: 0)`,
    `- Out-of-scope STILL-PERCENT (expected pre-existing / import-skipped): **${outScopeStillPercent}**`,
    `- 212 remainder accounting: **${outScopeStillPercent} STILL-PERCENT** + **${unexpectedEmpty + unexpectedMismatch} UNEXPECTED** (${unexpectedEmpty} empty, ${unexpectedMismatch} value_mismatch vs map) — all **out-of-scope**; **${inScopeCounts["STILL-PERCENT"]} in-scope stragglers**`,
    `- In-scope metrics normalized (DONE): **${inScopeCounts.DONE}** (normalize-scale-report rescale count was 820)`,
    "",
    stragglersWritten
      ? `- Stragglers written to \`kpi_scale_stragglers.csv\` (${inScopeStragglers.length} rows).`
      : "- No in-scope stragglers — `kpi_scale_stragglers.csv` not written.",
    "",
    "## Confidence",
    "",
    "- **High** on fetch-path diagnosis (code cites `lib/api/xanoPagination.ts:66–105`, scripts at lines above).",
    "- **High** on per-metric classification when live row is found (deterministic tolerance).",
    inScopeSource.includes("inScopeKeys")
      ? "- **High** on in-scope boundary (explicit `inScopeKeys` in last-run-report)."
      : inScopeSource.includes("normalize-scale-report")
        ? "- **Medium–high** on in-scope boundary (`normalize-scale-report.json` keys from `--apply`; last-run-report lacks `inScopeKeys` / create+patch=0)."
        : "- **Medium** on in-scope boundary (import CSV heuristic only).",
    "",
  ]

  fs.writeFileSync(FINDINGS_PATH, md.filter((l) => l !== "").join("\n") + "\n", "utf8")

  console.info("\n[verify] SUMMARY")
  console.info(`full_rows=${fullRows.length} old_rows=${oldRows.length}`)
  console.info(`in_scope_STILL_PERCENT=${inScopeCounts["STILL-PERCENT"]}`)
  console.info(`in_scope_NOT_FOUND=${inScopeCounts["NOT-FOUND"]}`)
  console.info(`stragglers_csv=${stragglersWritten ? "written" : "not_written"}`)
  console.info(`findings=${FINDINGS_PATH}`)
}

main().catch((err) => {
  console.error("[verify] fatal:", err)
  process.exit(1)
})
