/**
 * Null-only bulk import for publisher_kpi, media_container_best_practice, and publishers.best_practice.
 *
 * Only writes metrics/JSON where the live value is null, empty, or zero (metrics).
 * Idempotent: re-running after a successful apply should mostly skip.
 *
 * Requires XANO_PUBLISHERS_BASE_URL in .env.local (XANO_API_KEY optional if endpoints are public).
 *
 * Usage:
 *   npx tsx scripts/bulk-import-kpi-best-practice.ts --dry-run
 *   npx tsx scripts/bulk-import-kpi-best-practice.ts --apply
 *   npx tsx scripts/bulk-import-kpi-best-practice.ts --apply --only=kpi
 *   npx tsx scripts/bulk-import-kpi-best-practice.ts --apply --only=publisher-bp --ids=2
 *   npx tsx scripts/bulk-import-kpi-best-practice.ts --data-dir="C:\path\to\outputs"
 *
 * Publisher best_practice updates use PATCH on `publishers/{id}` (partial body).
 * If that endpoint is unavailable in your Xano stack, use Xano admin CSV update on
 * publisher_best_practice_update.csv (match on id, map only id + best_practice).
 * Do NOT use edit_publishers PUT — it sends the full form and strips legacy fields.
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import type { PublisherKpi } from "@/lib/kpi/types"
import type { Publisher } from "@/lib/types/publisher"
import { normalizeBestPractice, type BestPractice } from "@/lib/types/bestPractice"
import {
  collectSubOnePercentCtrWarnings,
  kpiRowKey,
  mergeContainerBpRow,
  mergeKpiRow,
  mergePublisherBpRow,
  parseMetricCell,
  type ContainerBpImportRow,
  type KpiImportRow,
  type PublisherBpImportRow,
} from "./lib/kpiBpMerge"

const REPO_ROOT = process.cwd()
const DEFAULT_DATA_DIR = path.join(REPO_ROOT, "scripts", "data", "kpi-best-practice")
const REPORT_PATH = path.join(DEFAULT_DATA_DIR, "last-run-report.json")
const IMPORT_ACTOR = "bulk-import-kpi-best-practice"

type OnlyMode = "kpi" | "container-bp" | "publisher-bp" | "all"

type RunReport = {
  mode: "dry-run" | "apply"
  only: OnlyMode
  dataDir: string
  kpi: { create: number; patch: number; skip: number; error: number; errors: string[] }
  containerBp: { create: number; update: number; skip: number; error: number; errors: string[] }
  publisherBp: {
    create: number
    update: number
    skip: number
    error: number
    errors: string[]
    patchEndpoint: string | null
  }
  warnings: string[]
  duplicateKpiKeys: string[]
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
  only: OnlyMode
  dataDir: string
  ids: number[] | null
} {
  const argv = process.argv.slice(2)
  const dryRun = !argv.includes("--apply")
  let only: OnlyMode = "all"
  let dataDir = DEFAULT_DATA_DIR
  let ids: number[] | null = null

  for (const arg of argv) {
    if (arg.startsWith("--only=")) {
      const v = arg.slice("--only=".length) as OnlyMode
      if (v === "kpi" || v === "container-bp" || v === "publisher-bp" || v === "all") {
        only = v
      } else {
        console.error(`Unknown --only value: ${v}`)
        process.exit(1)
      }
    }
    if (arg.startsWith("--data-dir=")) {
      dataDir = arg.slice("--data-dir=".length).replace(/^["']|["']$/g, "")
    }
    if (arg.startsWith("--ids=")) {
      ids = arg
        .slice("--ids=".length)
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n))
    }
  }

  return { dryRun, only, dataDir, ids }
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
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field)
      field = ""
      if (row.length > 1 || row[0] !== "") rows.push(row)
      row = []
    } else if (ch !== "\r") {
      field += ch
    }
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

function parseKpiCsv(dataDir: string): KpiImportRow[] {
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

function parseJsonBestPractice(raw: string): BestPractice {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return normalizeBestPractice(JSON.parse(trimmed))
  } catch {
    return null
  }
}

function parseContainerBpCsv(dataDir: string): ContainerBpImportRow[] {
  const file = path.join(dataDir, "media_container_best_practice_import.csv")
  const rows = readCsvFile(file)
  const [header, ...body] = rows
  const cols = header.map((h) => h.trim())
  const iContainer = cols.indexOf("media_container")
  const iBp = cols.indexOf("best_practice")
  const iActive = cols.indexOf("is_active")

  const out: ContainerBpImportRow[] = []
  for (const line of body) {
    if (line.every((c) => c.trim() === "")) continue
    const activeRaw = iActive >= 0 ? line[iActive]?.trim().toLowerCase() : "true"
    out.push({
      media_container: line[iContainer]?.trim() ?? "",
      best_practice: parseJsonBestPractice(line[iBp] ?? ""),
      is_active: activeRaw === "true" || activeRaw === "1",
    })
  }
  return out
}

function parsePublisherBpCsv(dataDir: string): PublisherBpImportRow[] {
  const file = path.join(dataDir, "publisher_best_practice_update.csv")
  const rows = readCsvFile(file)
  const [header, ...body] = rows
  const cols = header.map((h) => h.trim())
  const iId = cols.indexOf("id")
  const iBp = cols.indexOf("best_practice")

  const out: PublisherBpImportRow[] = []
  for (const line of body) {
    if (line.every((c) => c.trim() === "")) continue
    const id = parseInt(line[iId]?.trim() ?? "", 10)
    if (!Number.isFinite(id)) continue
    out.push({
      id,
      best_practice: parseJsonBestPractice(line[iBp] ?? ""),
    })
  }
  return out
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

type PublisherPatchProbe = {
  ok: boolean
  endpoint: string | null
  message?: string
}

async function probePublisherPatchEndpoint(sampleId: number): Promise<PublisherPatchProbe> {
  const headers = authHeaders()
  const candidates = [`publishers/${sampleId}`, `publisher/${sampleId}`]

  for (const candidate of candidates) {
    const url = xanoUrl(candidate, "XANO_PUBLISHERS_BASE_URL")
    try {
      const res = await axios.patch(
        url,
        {},
        { headers, timeout: 15000, validateStatus: (s) => s < 500 },
      )
      if (res.status === 404) continue
      // 200/400/422 means route exists (empty body may be rejected but route is there)
      return { ok: true, endpoint: candidate.replace(`/${sampleId}`, "/{id}") }
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) continue
    }
  }

  return {
    ok: false,
    endpoint: null,
    message:
      "PATCH publishers/{id} not found. Use Xano admin CSV update for publisher_best_practice_update.csv (match on id, map only id + best_practice).",
  }
}

async function patchPublisherBestPractice(
  endpointTemplate: string,
  id: number,
  best_practice: BestPractice,
  dryRun: boolean,
): Promise<void> {
  const pathWithId = endpointTemplate.replace("{id}", String(id))
  const url = xanoUrl(pathWithId, "XANO_PUBLISHERS_BASE_URL")
  if (dryRun) return
  await axios.patch(url, { best_practice }, { headers: authHeaders(), timeout: 30000 })
}

async function runKpiImport(
  dataDir: string,
  dryRun: boolean,
  report: RunReport,
): Promise<void> {
  const importRows = parseKpiCsv(dataDir)
  report.warnings.push(...collectSubOnePercentCtrWarnings(importRows))

  const listUrl = xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL")
  const { items } = await fetchAllXanoPagesWithCompleteness(listUrl, {}, "publisher_kpi", 200, 50)
  const existingRows = items as PublisherKpi[]
  const { byKey, duplicateKeys } = indexKpiRows(existingRows)
  report.duplicateKpiKeys = duplicateKeys
  if (duplicateKeys.length > 0) {
    report.warnings.push(
      `Live Xano has ${duplicateKeys.length} duplicate publisher_kpi key(s); merge uses first row only.`,
    )
  }

  const headers = authHeaders()
  const base = listUrl.replace(/\/?$/, "")

  for (const importRow of importRows) {
    const key = kpiRowKey(importRow.publisher, importRow.media_type, importRow.bid_strategy)
    const existing = byKey.get(key)
    const result = mergeKpiRow(existing, importRow)

    if (result.action === "error") {
      report.kpi.error++
      report.kpi.errors.push(`${key}: ${result.error}`)
      continue
    }
    if (result.action === "skip") {
      report.kpi.skip++
      continue
    }
    if (result.action === "create") {
      report.kpi.create++
      if (!dryRun && result.createBody) {
        try {
          const res = await axios.post(base, result.createBody, { headers, timeout: 30000 })
          const created = res.data as PublisherKpi
          byKey.set(key, created)
        } catch (e) {
          report.kpi.error++
          const msg = axios.isAxiosError(e) ? e.message : String(e)
          report.kpi.errors.push(`${key}: POST failed: ${msg}`)
        }
      }
      continue
    }
    if (result.action === "patch" && result.patch && result.existingId != null) {
      report.kpi.patch++
      if (!dryRun) {
        try {
          await axios.patch(`${base}/${result.existingId}`, result.patch, {
            headers,
            timeout: 30000,
          })
        } catch (e) {
          report.kpi.error++
          const msg = axios.isAxiosError(e) ? e.message : String(e)
          report.kpi.errors.push(`${key}: PATCH failed: ${msg}`)
        }
      }
    }
  }
}

async function runContainerBpImport(
  dataDir: string,
  dryRun: boolean,
  report: RunReport,
): Promise<void> {
  const importRows = parseContainerBpCsv(dataDir)
  const listUrl = xanoUrl("media_container_best_practice", "XANO_PUBLISHERS_BASE_URL")
  const { items } = await fetchAllXanoPagesWithCompleteness(
    listUrl,
    {},
    "media_container_best_practice",
    200,
    10,
  )

  const bySlug = new Map<string, (typeof items)[0]>()
  for (const row of items) {
    const r = row as Record<string, unknown>
    const slug = String(r.media_container ?? "").trim()
    if (slug) bySlug.set(slug, row)
  }

  const headers = authHeaders()
  const base = listUrl.replace(/\/?$/, "")

  for (const importRow of importRows) {
    const existing = bySlug.get(importRow.media_container.trim()) as
      | { id: number; media_container: string; best_practice: unknown; is_active?: boolean }
      | undefined
    const result = mergeContainerBpRow(existing, importRow)

    if (result.action === "error") {
      report.containerBp.error++
      report.containerBp.errors.push(`${result.media_container}: ${result.error}`)
      continue
    }
    if (result.action === "skip") {
      report.containerBp.skip++
      continue
    }
    if (result.action === "create") {
      report.containerBp.create++
      if (!dryRun && result.body) {
        try {
          await axios.post(
            base,
            {
              media_container: result.media_container,
              best_practice: result.body.best_practice,
              is_active: result.body.is_active,
              _name: IMPORT_ACTOR,
            },
            { headers, timeout: 30000 },
          )
        } catch (e) {
          report.containerBp.error++
          const msg = axios.isAxiosError(e) ? e.message : String(e)
          report.containerBp.errors.push(`${result.media_container}: POST failed: ${msg}`)
        }
      }
      continue
    }
    if (result.action === "update" && result.body && result.existingId != null) {
      report.containerBp.update++
      if (!dryRun) {
        try {
          await axios.put(
            `${base}/${encodeURIComponent(String(result.existingId))}`,
            {
              best_practice: result.body.best_practice,
              is_active: result.body.is_active,
              _name: IMPORT_ACTOR,
            },
            { headers, timeout: 30000 },
          )
        } catch (e) {
          report.containerBp.error++
          const msg = axios.isAxiosError(e) ? e.message : String(e)
          report.containerBp.errors.push(`${result.media_container}: PUT failed: ${msg}`)
        }
      }
    }
  }
}

async function runPublisherBpImport(
  dataDir: string,
  dryRun: boolean,
  report: RunReport,
  filterIds: number[] | null,
): Promise<void> {
  let importRows = parsePublisherBpCsv(dataDir)
  if (filterIds && filterIds.length > 0) {
    const set = new Set(filterIds)
    importRows = importRows.filter((r) => set.has(r.id))
  }

  const listUrl = xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL")
  const response = await axios.get(listUrl, { headers: authHeaders(), timeout: 60000 })
  const publishers = (Array.isArray(response.data) ? response.data : []) as Publisher[]
  const byId = new Map(publishers.map((p) => [p.id, p]))

  const sampleId = importRows[0]?.id ?? publishers[0]?.id
  if (!sampleId) {
    report.publisherBp.error++
    report.publisherBp.errors.push("No publisher id available for PATCH endpoint probe")
    return
  }

  const probe = await probePublisherPatchEndpoint(sampleId)
  report.publisherBp.patchEndpoint = probe.endpoint
  if (!probe.ok) {
    report.publisherBp.error += importRows.length
    report.publisherBp.errors.push(probe.message ?? "Publisher PATCH endpoint unavailable")
    report.warnings.push(probe.message ?? "Publisher PATCH endpoint unavailable")
    return
  }

  for (const importRow of importRows) {
    const existing = byId.get(importRow.id)
    const result = mergePublisherBpRow(existing, importRow)

    if (result.action === "error") {
      report.publisherBp.error++
      report.publisherBp.errors.push(`id=${importRow.id}: ${result.error}`)
      continue
    }
    if (result.action === "skip") {
      report.publisherBp.skip++
      continue
    }
    if (result.action === "update" && result.best_practice) {
      report.publisherBp.update++
      if (!dryRun && probe.endpoint) {
        try {
          await patchPublisherBestPractice(probe.endpoint, importRow.id, result.best_practice, false)
        } catch (e) {
          report.publisherBp.error++
          const msg = axios.isAxiosError(e) ? e.message : String(e)
          report.publisherBp.errors.push(`id=${importRow.id}: PATCH failed: ${msg}`)
        }
      }
    }
  }
}

function emptyReport(mode: "dry-run" | "apply", only: OnlyMode, dataDir: string): RunReport {
  return {
    mode,
    only,
    dataDir,
    kpi: { create: 0, patch: 0, skip: 0, error: 0, errors: [] },
    containerBp: { create: 0, update: 0, skip: 0, error: 0, errors: [] },
    publisherBp: {
      create: 0,
      update: 0,
      skip: 0,
      error: 0,
      errors: [],
      patchEndpoint: null,
    },
    warnings: [],
    duplicateKpiKeys: [],
  }
}

function printSummary(report: RunReport): void {
  console.info(`\n[bulk-import] mode=${report.mode} only=${report.only} dataDir=${report.dataDir}`)
  console.info(
    `[bulk-import] KPI: create=${report.kpi.create} patch=${report.kpi.patch} skip=${report.kpi.skip} error=${report.kpi.error}`,
  )
  console.info(
    `[bulk-import] container BP: create=${report.containerBp.create} update=${report.containerBp.update} skip=${report.containerBp.skip} error=${report.containerBp.error}`,
  )
  console.info(
    `[bulk-import] publisher BP: update=${report.publisherBp.update} skip=${report.publisherBp.skip} error=${report.publisherBp.error} endpoint=${report.publisherBp.patchEndpoint ?? "n/a"}`,
  )
  if (report.duplicateKpiKeys.length > 0) {
    console.info(`[bulk-import] duplicate KPI keys in Xano: ${report.duplicateKpiKeys.length}`)
  }
  if (report.warnings.length > 0) {
    console.info(`[bulk-import] warnings (${report.warnings.length}):`)
    for (const w of report.warnings.slice(0, 10)) console.info(`  - ${w}`)
    if (report.warnings.length > 10) {
      console.info(`  … and ${report.warnings.length - 10} more (see report JSON)`)
    }
  }
  const allErrors = [
    ...report.kpi.errors,
    ...report.containerBp.errors,
    ...report.publisherBp.errors,
  ]
  if (allErrors.length > 0) {
    console.info(`[bulk-import] errors (${allErrors.length}):`)
    for (const e of allErrors.slice(0, 15)) console.info(`  - ${e}`)
  }
}

async function main(): Promise<void> {
  loadEnvLocal()
  const { dryRun, only, dataDir, ids } = parseArgs()

  if (!fs.existsSync(dataDir)) {
    console.error(`[bulk-import] data dir not found: ${dataDir}`)
    process.exit(1)
  }

  if (!process.env.XANO_PUBLISHERS_BASE_URL) {
    console.error("[bulk-import] Missing XANO_PUBLISHERS_BASE_URL")
    process.exit(1)
  }

  const report = emptyReport(dryRun ? "dry-run" : "apply", only, dataDir)

  if (only === "all" || only === "kpi") {
    console.info("[bulk-import] Processing publisher_kpi …")
    await runKpiImport(dataDir, dryRun, report)
  }
  if (only === "all" || only === "container-bp") {
    console.info("[bulk-import] Processing media_container_best_practice …")
    await runContainerBpImport(dataDir, dryRun, report)
  }
  if (only === "all" || only === "publisher-bp") {
    console.info("[bulk-import] Processing publishers.best_practice …")
    await runPublisherBpImport(dataDir, dryRun, report, ids)
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8")
  console.info(`[bulk-import] Report written to ${REPORT_PATH}`)

  printSummary(report)

  const totalErrors =
    report.kpi.error + report.containerBp.error + report.publisherBp.error
  if (totalErrors > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
