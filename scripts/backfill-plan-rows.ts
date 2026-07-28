/**
 * Plan C S2-P4 — history backfill recon for plan_billing_rows / plan_delivery_rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-plan-rows.ts --dry-run
 *   npx tsx scripts/backfill-plan-rows.ts --dry-run --mba=PENFOLD016
 *   npx tsx scripts/backfill-plan-rows.ts --apply
 *   npx tsx scripts/backfill-plan-rows.ts --apply --force-mba=PENFOLD016
 *
 * --dry-run writes backfill-recon.csv and prints summary (NO Xano row writes).
 * --apply writes rows ONLY for clean versions and stamps billing_rows_migrated=true.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import axios from "axios"

import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import {
  getXanoBaseUrl,
  parseXanoListPayload,
  xanoAuthHeaderRecord,
  xanoPostHeaderRecord,
  xanoUrl,
} from "@/lib/api/xano"
import {
  flagIntegrityFindings,
  projectIntegrityRow,
} from "@/lib/billing/integrityTripwire"
import { computeCampaignFinancialsFromVersion } from "@/lib/finance/computeCampaignFinancialsFromVersion"
import { getBillingSchedule, getDeliverySchedule } from "@/lib/finance/normalizeFields"
import {
  compareBackfillRowsToBlob,
  type BackfillAnomalyClass,
  type BackfillVersionStatus,
} from "@/lib/finance/rows/backfillCompare"
import { checksumForPlanRows } from "@/lib/finance/rows/dualWrite"
import { CHANNEL_LINE_ITEM_ENDPOINTS } from "@/lib/api/fetchChannelLineItemsByMba"
import { MEDIA_PLAN_TABLES } from "@/lib/xano/mediaPlanTables"
import { buildMbaToLatestVersionMap } from "@/lib/finance/relevantPlanVersions"

const MEDIA_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const XANO_TIMEOUT_MS = 60_000
const CSV_PATH = resolve(process.cwd(), "backfill-recon.csv")

type CliArgs = {
  dryRun: boolean
  apply: boolean
  mbaFilter: string | null
  forceMba: string | null
}

type ReconRow = {
  mba: string
  version: string
  version_id: string
  status: BackfillVersionStatus
  anomaly_class: string
  deltas: string
  parse_errors: string
  billing_rows: string
  delivery_rows: string
}

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local")
  if (!existsSync(p)) return
  const raw = readFileSync(p, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue
    const i = line.indexOf("=")
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] == null) process.env[key] = val
  }
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false
  let apply = false
  let mbaFilter: string | null = null
  let forceMba: string | null = null
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true
    else if (arg === "--apply") apply = true
    else if (arg.startsWith("--mba=")) mbaFilter = arg.slice("--mba=".length).trim()
    else if (arg.startsWith("--force-mba="))
      forceMba = arg.slice("--force-mba=".length).trim()
  }
  if (!dryRun && !apply) dryRun = true // safest default
  if (dryRun && apply) {
    console.error("Pass only one of --dry-run or --apply")
    process.exit(1)
  }
  return { dryRun, apply, mbaFilter, forceMba }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function isMigrated(version: Record<string, unknown>): boolean {
  const v = version.billing_rows_migrated ?? version.billingRowsMigrated
  return v === true || v === "true" || v === 1 || v === "1"
}

async function loadKnownDupVersionIds(
  knownVersionIds: Set<number>,
  knownVersions: Map<number, { id: number; mba_number: string; version_number: number }>,
  currentVersionByMba: Map<string, number>
): Promise<Set<number>> {
  const dupIds = new Set<number>()
  const tables = MEDIA_PLAN_TABLES.filter((t) =>
    (CHANNEL_LINE_ITEM_ENDPOINTS as readonly string[]).includes(t.table_name)
  )

  for (const table of tables) {
    try {
      const raw = await fetchAllXanoPages(
        xanoUrl(table.table_name, [...MEDIA_KEYS]),
        {},
        `backfill-integrity:${table.table_name}`,
        200,
        100
      )
      const rows = raw
        .filter((r) => r && typeof r === "object")
        .map((r) => projectIntegrityRow(r as Record<string, unknown>))
      const findings = flagIntegrityFindings({
        table: table.table_name,
        rows,
        knownVersionIds,
        knownVersions,
        currentVersionByMba,
        checkVersionLess: table.table_name === "media_plan_production",
      })
      for (const f of findings) {
        if (f.kind === "duplicate" && f.version != null) dupIds.add(f.version)
      }
    } catch (error) {
      console.warn(
        `[backfill] integrity scan failed for ${table.table_name}:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }
  return dupIds
}

async function writeRowsForVersion(args: {
  baseUrl: string
  versionId: number
  billingRows: unknown[]
  deliveryRows: unknown[]
}): Promise<void> {
  const { baseUrl, versionId, billingRows, deliveryRows } = args
  const headers = xanoPostHeaderRecord()
  const auth = xanoAuthHeaderRecord()

  // Replace: list + delete existing, then bulk insert (same as S2-P2 dual-write).
  for (const [table, rows] of [
    ["plan_billing_rows", billingRows],
    ["plan_delivery_rows", deliveryRows],
  ] as const) {
    try {
      const list = await axios.get(`${baseUrl}/${table}`, {
        params: { media_plan_version: versionId, page: 1, per_page: 500 },
        headers: auth,
        timeout: XANO_TIMEOUT_MS,
        validateStatus: (s) => s >= 200 && s < 500,
      })
      const existing = parseXanoListPayload(list.data) as Array<{ id?: number | string }>
      for (const row of existing) {
        if (row.id == null) continue
        await axios.delete(`${baseUrl}/${table}/${encodeURIComponent(String(row.id))}`, {
          headers: auth,
          timeout: XANO_TIMEOUT_MS,
          validateStatus: (s) => s >= 200 && s < 500,
        })
      }
    } catch (error) {
      console.warn(`[backfill] list/delete ${table} failed`, error)
      throw error
    }

    if (rows.length === 0) continue
    const bulk = await axios.post(
      `${baseUrl}/${table}/bulk`,
      { rows },
      {
        headers,
        timeout: XANO_TIMEOUT_MS,
        validateStatus: (s) => s >= 200 && s < 500,
      }
    )
    if (bulk.status >= 400) {
      throw new Error(`bulk ${table} failed: ${bulk.status}`)
    }
  }

  const checksum = checksumForPlanRows({
    billingRows: billingRows as Parameters<typeof checksumForPlanRows>[0]["billingRows"],
    deliveryRows: deliveryRows as Parameters<typeof checksumForPlanRows>[0]["deliveryRows"],
  })
  await axios.patch(
    `${baseUrl}/media_plan_versions/${versionId}`,
    { snapshot_checksum: checksum, billing_rows_migrated: true },
    {
      headers,
      timeout: XANO_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 500,
    }
  )
}

async function main(): Promise<void> {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))
  const baseUrl = getXanoBaseUrl([...MEDIA_KEYS])

  console.error(
    `[backfill] mode=${args.dryRun ? "dry-run" : "apply"} mba=${args.mbaFilter ?? "*"} force=${args.forceMba ?? "-"}`
  )

  const masters = await fetchAllXanoPages(
    xanoUrl("media_plan_master", [...MEDIA_KEYS]),
    {},
    "backfill-masters",
    100,
    80
  )
  const mbaLatest = buildMbaToLatestVersionMap(masters)
  const currentVersionByMba = new Map<string, number>()
  for (const [mba, info] of mbaLatest) {
    currentVersionByMba.set(mba, info.versionNumber)
  }

  let versions = (await fetchAllXanoPages(
    xanoUrl("media_plan_versions", [...MEDIA_KEYS]),
    {},
    "backfill-versions",
    100,
    120
  )) as Record<string, unknown>[]

  versions = versions.filter((v) => {
    const mba = String(v.mba_number ?? "").trim()
    if (!mba) return false
    if (args.mbaFilter && mba.toUpperCase() !== args.mbaFilter.toUpperCase()) return false
    if (args.forceMba && mba.toUpperCase() !== args.forceMba.toUpperCase()) {
      // force-mba still processes that campaign only
    }
    return true
  })

  if (args.forceMba) {
    versions = versions.filter(
      (v) =>
        String(v.mba_number ?? "").trim().toUpperCase() === args.forceMba!.toUpperCase()
    )
  }

  // Oldest first: mba then version_number then id
  versions.sort((a, b) => {
    const mbaCmp = String(a.mba_number ?? "").localeCompare(String(b.mba_number ?? ""))
    if (mbaCmp !== 0) return mbaCmp
    const vn = Number(a.version_number) - Number(b.version_number)
    if (vn !== 0) return vn
    return Number(a.id) - Number(b.id)
  })

  const knownVersionIds = new Set<number>()
  const knownVersions = new Map<
    number,
    { id: number; mba_number: string; version_number: number }
  >()
  for (const v of versions) {
    const id = Number(v.id)
    if (!Number.isFinite(id)) continue
    knownVersionIds.add(id)
    knownVersions.set(id, {
      id,
      mba_number: String(v.mba_number ?? "").trim(),
      version_number: Number(v.version_number) || 0,
    })
  }

  console.error("[backfill] scanning channel tables for known duplicates…")
  const knownDupIds = await loadKnownDupVersionIds(
    knownVersionIds,
    knownVersions,
    currentVersionByMba
  )
  console.error(`[backfill] known-dup version ids: ${knownDupIds.size}`)

  const recon: ReconRow[] = []
  const summary = {
    processed: 0,
    clean: 0,
    anomaly: 0,
    knownDup: 0,
    skippedMigrated: 0,
    parseFailure: 0,
    amountMismatch: 0,
    rounding: 0,
    structural: 0,
    applied: 0,
    applyFailed: 0,
  }

  // Batch by mba for progress
  let lastMba = ""
  for (const version of versions) {
    const mba = String(version.mba_number ?? "").trim()
    const versionId = Number(version.id)
    const versionNumber = String(version.version_number ?? "")
    if (!Number.isFinite(versionId)) continue

    if (mba !== lastMba) {
      lastMba = mba
      console.error(`[backfill] mba=${mba}`)
    }

    const forceThis =
      args.forceMba != null &&
      mba.toUpperCase() === args.forceMba.toUpperCase()

    if (isMigrated(version) && !forceThis) {
      summary.skippedMigrated++
      recon.push({
        mba,
        version: versionNumber,
        version_id: String(versionId),
        status: "skipped-migrated",
        anomaly_class: "",
        deltas: "",
        parse_errors: "",
        billing_rows: "",
        delivery_rows: "",
      })
      continue
    }

    summary.processed++
    const isKnownDup = knownDupIds.has(versionId)
    let status: BackfillVersionStatus = "anomaly"
    let anomalyClass: BackfillAnomalyClass | "" = ""
    let deltasStr = ""
    let parseErrors = ""
    let billingRows = 0
    let deliveryRows = 0
    let builtBilling: unknown[] = []
    let builtDelivery: unknown[] = []

    try {
      const billingRaw = getBillingSchedule(version)
      const deliveryRaw = getDeliverySchedule(version)
      if (
        (billingRaw == null || billingRaw === "") &&
        (deliveryRaw == null || deliveryRaw === "")
      ) {
        status = "anomaly"
        anomalyClass = "parse-failure"
        parseErrors = "empty schedules"
        summary.parseFailure++
        summary.anomaly++
      } else {
        const financials = computeCampaignFinancialsFromVersion(version)
        if (!financials) {
          status = "anomaly"
          anomalyClass = "parse-failure"
          parseErrors = "computeCampaignFinancialsFromVersion returned null"
          summary.parseFailure++
          summary.anomaly++
        } else {
          const compared = compareBackfillRowsToBlob({
            financials,
            mba_number: mba,
            media_plan_version: versionId,
            isKnownDupVersion: isKnownDup,
          })
          billingRows = compared.billingRowCount
          deliveryRows = compared.deliveryRowCount
          builtBilling = compared.built.billingRows
          builtDelivery = compared.built.deliveryRows
          deltasStr = compared.deltas
            .slice(0, 20)
            .map(
              (d) =>
                `${d.lineItemId}|${d.month}|${d.field}:${d.delta.toFixed(2)}`
            )
            .join("; ")

          if (compared.anomalyClass === "known-dup" || isKnownDup) {
            status = "known-dup"
            anomalyClass = "known-dup"
            summary.knownDup++
          } else if (compared.status === "clean") {
            status = "clean"
            anomalyClass = ""
            summary.clean++
          } else {
            status = "anomaly"
            anomalyClass = compared.anomalyClass ?? "amount-mismatch"
            summary.anomaly++
            if (anomalyClass === "amount-mismatch") summary.amountMismatch++
            else if (anomalyClass === "rounding") summary.rounding++
            else if (anomalyClass === "structural") summary.structural++
            else if (anomalyClass === "parse-failure") summary.parseFailure++
          }
        }
      }
    } catch (error) {
      status = "anomaly"
      anomalyClass = "parse-failure"
      parseErrors = error instanceof Error ? error.message : String(error)
      summary.parseFailure++
      summary.anomaly++
    }

    recon.push({
      mba,
      version: versionNumber,
      version_id: String(versionId),
      status,
      anomaly_class: anomalyClass,
      deltas: deltasStr,
      parse_errors: parseErrors,
      billing_rows: String(billingRows),
      delivery_rows: String(deliveryRows),
    })

    if (args.apply && status === "clean") {
      try {
        await writeRowsForVersion({
          baseUrl,
          versionId,
          billingRows: builtBilling,
          deliveryRows: builtDelivery,
        })
        summary.applied++
      } catch (error) {
        summary.applyFailed++
        console.warn(
          `[backfill] apply failed version=${versionId}`,
          error instanceof Error ? error.message : String(error)
        )
      }
    } else if (args.apply && forceThis && status === "clean") {
      // already handled
    }
  }

  const header = [
    "mba",
    "version",
    "version_id",
    "status",
    "anomaly_class",
    "deltas",
    "parse_errors",
    "billing_rows",
    "delivery_rows",
  ]
  const csvLines = [
    header.join(","),
    ...recon.map((r) =>
      [
        r.mba,
        r.version,
        r.version_id,
        r.status,
        r.anomaly_class,
        csvEscape(r.deltas),
        csvEscape(r.parse_errors),
        r.billing_rows,
        r.delivery_rows,
      ].join(",")
    ),
  ]
  writeFileSync(CSV_PATH, csvLines.join("\n"), "utf8")
  console.error(`[backfill] wrote ${CSV_PATH} (${recon.length} rows)`)

  const summaryLine = {
    mode: args.dryRun ? "dry-run" : "apply",
    processed: summary.processed,
    clean: summary.clean,
    anomaly: summary.anomaly,
    knownDup: summary.knownDup,
    skippedMigrated: summary.skippedMigrated,
    parseFailure: summary.parseFailure,
    amountMismatch: summary.amountMismatch,
    rounding: summary.rounding,
    structural: summary.structural,
    applied: summary.applied,
    applyFailed: summary.applyFailed,
    knownDupVersionIds: knownDupIds.size,
  }
  console.error(`[backfill] SUMMARY ${JSON.stringify(summaryLine)}`)
  // Also print a human paste-friendly block
  console.log("")
  console.log("=== backfill dry-run summary ===")
  console.log(`clean:       ${summary.clean}`)
  console.log(`anomaly:     ${summary.anomaly}`)
  console.log(`known-dup:   ${summary.knownDup}`)
  console.log(`skipped:     ${summary.skippedMigrated} (already migrated)`)
  console.log(`  parse-failure:     ${summary.parseFailure}`)
  console.log(`  amount-mismatch:   ${summary.amountMismatch}`)
  console.log(`  rounding:          ${summary.rounding}`)
  console.log(`  structural:        ${summary.structural}`)
  console.log(`processed:   ${summary.processed}`)
  console.log(`csv:         ${CSV_PATH}`)
}

main().catch((error) => {
  console.error("[backfill] fatal", error)
  process.exit(1)
})
