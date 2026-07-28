/**
 * LIVE-P1 — live campaign conformance report (read-only; --dry-run only).
 *
 * Scope: the CURRENT (highest / master.version_number) version of every campaign
 * whose master campaign_status normalises to booked / approved / planned.
 * Superseded versions are ignored entirely.
 *
 * Usage:
 *   npx tsx scripts/live-campaign-conformance.ts --dry-run
 *
 * Writes live-conformance.csv and prints a human summary to stdout.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import axios from "axios"

import { GET as billingIntegrityGet } from "@/app/api/cron/billing-integrity/route"
import { CHANNEL_LINE_ITEM_ENDPOINTS } from "@/lib/api/fetchChannelLineItemsByMba"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import {
  getXanoBaseUrl,
  parseXanoListPayload,
  xanoAuthHeaderRecord,
  xanoUrl,
} from "@/lib/api/xano"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import {
  collectFullScopeDeltas,
  type FullScopeDelta,
} from "@/lib/finance/c1FullScopeGate"
import { computeCampaignFinancialsFromVersion } from "@/lib/finance/computeCampaignFinancialsFromVersion"
import { getBillingSchedule, getDeliverySchedule } from "@/lib/finance/normalizeFields"
import { buildMbaToLatestVersionMap } from "@/lib/finance/relevantPlanVersions"
import {
  compareBackfillRowsToBlob,
  type BackfillAnomalyClass,
} from "@/lib/finance/rows/backfillCompare"
import {
  classifyScheduleShape,
  isEmptyScheduleShape,
  isScheduleFallbackPair,
  type ScheduleShape,
} from "@/lib/finance/rows/scheduleShape"
import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import { billingMonthsHaveDetailedLineItems } from "@/lib/mediaplan/partialMba"
import { MEDIA_PLAN_TABLES } from "@/lib/xano/mediaPlanTables"
import {
  flagIntegrityFindings,
  projectIntegrityRow,
} from "@/lib/billing/integrityTripwire"

const MEDIA_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const CSV_PATH = resolve(process.cwd(), "live-conformance.csv")
const XANO_TIMEOUT_MS = 60_000

/** Statuses in scope (normalised lowercase). Report exact strings found separately. */
const SCOPE_STATUSES = new Set(["booked", "approved", "planned"])

type ConformanceBackfillStatus =
  | "clean"
  | "schedule-fallback"
  | "no-line-detail"
  | "asymmetric"
  | "parse-failure"
  | "known-dup"
  | "empty"
  | "amount-mismatch"
  | "rounding"
  | "structural"
  | "anomaly"

type CsvRow = {
  mba: string
  current_version: string
  version_id: string
  campaign_status: string
  billing_shape: string
  delivery_shape: string
  has_line_detail: string
  channel_row_count: string
  line_uid_coverage: string
  has_fee_snapshot: string
  backfill_status: string
  c1_fullscope_drift: string
  in_integrity_findings: string
  integrity_kinds: string
  conformant: string
}

type ChannelAgg = {
  channel_row_count: number
  line_uid_present: number
  tables_hit: string[]
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

function parseArgs(argv: string[]): { dryRun: boolean; mbaFilter: string | null } {
  let dryRun = false
  let mbaFilter: string | null = null
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true
    else if (arg.startsWith("--mba=")) mbaFilter = arg.slice("--mba=".length).trim()
  }
  if (!dryRun) {
    console.error("LIVE-P1 is read-only. Pass --dry-run (no other modes).")
    process.exit(1)
  }
  return { dryRun, mbaFilter }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function normaliseStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
}

function isLegitimateZeroBilling(financials: CampaignFinancials): boolean {
  if (financials.perLine.length === 0) return false
  if (Math.abs(financials.mbaScopeTotals.adServing) > 1e-9) return false
  return financials.perLine.every(
    (p) => p.flags.clientPaysForMedia && Math.abs(p.fee) < 1e-9
  )
}

function classifyBackfillStatus(args: {
  mba: string
  versionId: number | string
  billingShape: ScheduleShape
  deliveryShape: ScheduleShape
  financials: CampaignFinancials | null
  isKnownDup: boolean
  parseError: string | null
}): { status: ConformanceBackfillStatus; anomalyClass: string } {
  if (args.parseError || !args.financials) {
    return { status: "parse-failure", anomalyClass: "parse-failure" }
  }
  if (args.isKnownDup) {
    return { status: "known-dup", anomalyClass: "known-dup" }
  }

  const compared = compareBackfillRowsToBlob({
    financials: args.financials,
    mba_number: args.mba,
    media_plan_version: args.versionId,
    isKnownDupVersion: false,
  })

  const billingRows = compared.billingRowCount
  const deliveryRows = compared.deliveryRowCount
  const hasLineDetail =
    billingMonthsHaveDetailedLineItems(args.financials.billingSchedule) ||
    billingMonthsHaveDetailedLineItems(args.financials.deliverySchedule)

  if (compared.anomalyClass === "known-dup") {
    return { status: "known-dup", anomalyClass: "known-dup" }
  }

  if (compared.status !== "clean") {
    const cls = (compared.anomalyClass ?? "amount-mismatch") as BackfillAnomalyClass
    if (cls === "parse-failure") return { status: "parse-failure", anomalyClass: cls }
    if (cls === "amount-mismatch") return { status: "amount-mismatch", anomalyClass: cls }
    if (cls === "rounding") return { status: "rounding", anomalyClass: cls }
    if (cls === "structural") return { status: "structural", anomalyClass: cls }
    return { status: "anomaly", anomalyClass: cls }
  }

  if (isScheduleFallbackPair(args.billingShape, args.deliveryShape)) {
    return { status: "schedule-fallback", anomalyClass: "" }
  }
  if (
    isEmptyScheduleShape(args.billingShape) &&
    isEmptyScheduleShape(args.deliveryShape)
  ) {
    return { status: "empty", anomalyClass: "" }
  }
  if (billingRows === 0 && deliveryRows === 0 && !hasLineDetail) {
    return { status: "no-line-detail", anomalyClass: "" }
  }
  if (billingRows === 0 && deliveryRows === 0) {
    return { status: "empty", anomalyClass: "" }
  }
  if (billingRows === 0 && deliveryRows > 0) {
    if (isLegitimateZeroBilling(args.financials)) {
      return { status: "clean", anomalyClass: "" }
    }
    return { status: "asymmetric", anomalyClass: "" }
  }
  if (deliveryRows === 0 && billingRows > 0) {
    return { status: "asymmetric", anomalyClass: "" }
  }
  return { status: "clean", anomalyClass: "" }
}

async function loadChannelAggregates(
  knownVersionIds: Set<number>
): Promise<Map<number, ChannelAgg>> {
  const byVersion = new Map<number, ChannelAgg>()
  for (const table of CHANNEL_LINE_ITEM_ENDPOINTS) {
    try {
      const rows = await fetchAllXanoPages(
        xanoUrl(table, [...MEDIA_KEYS]),
        {},
        `live-conformance:${table}`,
        100,
        40
      )
      for (const item of rows) {
        if (!item || typeof item !== "object") continue
        const row = item as Record<string, unknown>
        const vid = Number(row.media_plan_version)
        if (!Number.isFinite(vid) || !knownVersionIds.has(vid)) continue
        if (row.superseded === true || row.superseded === "true" || row.superseded === 1) {
          continue
        }
        let agg = byVersion.get(vid)
        if (!agg) {
          agg = { channel_row_count: 0, line_uid_present: 0, tables_hit: [] }
          byVersion.set(vid, agg)
        }
        agg.channel_row_count++
        const uid = String(row.line_uid ?? "").trim()
        if (uid) agg.line_uid_present++
        if (!agg.tables_hit.includes(table)) agg.tables_hit.push(table)
      }
    } catch (e) {
      console.error(
        `[live-conformance] channel scan skipped ${table}:`,
        e instanceof Error ? e.message : String(e)
      )
    }
  }
  return byVersion
}

async function versionsWithFeeSnapshots(versionIds: number[]): Promise<Set<number>> {
  const out = new Set<number>()
  if (versionIds.length === 0) return out
  let baseUrl: string
  try {
    baseUrl = getXanoBaseUrl([...MEDIA_KEYS])
  } catch {
    return out
  }
  const auth = xanoAuthHeaderRecord()
  for (const versionId of versionIds) {
    try {
      const response = await axios.get(`${baseUrl}/mba_fee_snapshots`, {
        params: { media_plan_version: versionId, page: 1, per_page: 50 },
        headers: auth,
        timeout: XANO_TIMEOUT_MS,
        validateStatus: (s) => s >= 200 && s < 500,
      })
      if (response.status >= 400) continue
      const rows = parseXanoListPayload(response.data)
      if (rows.length > 0) out.add(versionId)
    } catch {
      // treat as no snapshot
    }
  }
  return out
}

async function runIntegrityCron(): Promise<{
  findings: Array<{ version: number | null; kind: string }>
}> {
  try {
    const secret = process.env.CRON_SECRET?.trim()
    if (!secret) {
      console.error("[live-conformance] CRON_SECRET missing — skipping integrity route")
      return { findings: [] }
    }
    const req = new Request("http://localhost/api/cron/billing-integrity", {
      headers: { "x-cron-secret": secret },
    })
    const res = await billingIntegrityGet(req)
    const body = (await res.json()) as {
      ok?: boolean
      findings?: Array<{ version?: number | null; kind?: string }>
      error?: string
    }
    if (!res.ok || body.ok === false) {
      console.error(
        `[live-conformance] billing-integrity failed status=${res.status}`,
        body.error ?? body
      )
      return { findings: [] }
    }
    return {
      findings: (body.findings ?? []).map((f) => ({
        version: f.version ?? null,
        kind: String(f.kind ?? ""),
      })),
    }
  } catch (e) {
    console.error(
      "[live-conformance] integrity cron failed:",
      e instanceof Error ? e.message : String(e)
    )
    return { findings: [] }
  }
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
        `live-conformance-dup:${table.table_name}`,
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
    } catch {
      // non-fatal
    }
  }
  return dupIds
}

/**
 * C1 full-scope drift — same collectFullScopeDeltas path as
 * scripts/c1-fullscope-drift-report.ts. Join: master.mba_number →
 * buildMbaToLatestVersionMap → version row where version_number matches
 * master.version_number (and media_plan_master_id when present).
 */
function hasC1FullScopeDrift(version: Record<string, unknown>): boolean {
  const billingRaw = getBillingSchedule(version)
  const deliveryRaw = getDeliverySchedule(version)
  const billingMonths = parsePersistedBillingScheduleToMonths(billingRaw) ?? []
  const deliveryMonths = parsePersistedBillingScheduleToMonths(deliveryRaw) ?? []
  if (billingMonths.length === 0 && deliveryMonths.length === 0) return false

  const financials = computeCampaignFinancialsFromVersion(version)
  if (!financials) return false

  const deltas: FullScopeDelta[] = collectFullScopeDeltas({
    clientSchedule: billingMonths.length ? billingMonths : financials.billingSchedule,
    lineItems: [],
    financials,
    version,
  })
  return deltas.length > 0
}

function isConformant(row: {
  backfill_status: string
  has_line_detail: boolean
  c1_drift: boolean
  in_integrity: boolean
  line_uid_coverage_ok: boolean
  has_fee_snapshot: boolean
}): boolean {
  return (
    row.backfill_status === "clean" &&
    row.has_line_detail &&
    !row.c1_drift &&
    !row.in_integrity &&
    row.line_uid_coverage_ok &&
    row.has_fee_snapshot
  )
}

async function main() {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))

  console.error("[live-conformance] loading masters…")
  const mastersRaw = await axios.get(
    xanoUrl("media_plan_master", [...MEDIA_KEYS]),
    { headers: xanoAuthHeaderRecord(), timeout: XANO_TIMEOUT_MS }
  )
  const masters = Array.isArray(mastersRaw.data) ? mastersRaw.data : []

  const statusVocabulary = new Map<string, number>()
  for (const m of masters) {
    const s = String(m?.campaign_status ?? "").trim() || "(empty)"
    statusVocabulary.set(s, (statusVocabulary.get(s) ?? 0) + 1)
  }

  const scopedMasters = masters.filter((m: { campaign_status?: string; mba_number?: string }) => {
    const mba = String(m.mba_number ?? "").trim()
    if (!mba) return false
    if (args.mbaFilter && mba.toUpperCase() !== args.mbaFilter.toUpperCase()) return false
    return SCOPE_STATUSES.has(normaliseStatus(m.campaign_status))
  })

  const mbaToVersion = buildMbaToLatestVersionMap(scopedMasters)
  console.error(
    `[live-conformance] scoped live masters=${scopedMasters.length} (booked|approved|planned)`
  )

  console.error("[live-conformance] loading versions…")
  const allVersions = await fetchAllXanoPages(
    xanoUrl("media_plan_versions", [...MEDIA_KEYS]),
    {},
    "live-conformance-versions",
    100,
    120
  )

  const currentVersions: Record<string, unknown>[] = []
  for (const v of allVersions) {
    if (!v || typeof v !== "object") continue
    const row = v as Record<string, unknown>
    const mba = String(row.mba_number ?? "").trim()
    if (!mba) continue
    const info = mbaToVersion.get(mba)
    if (!info) continue
    if (Number(row.version_number) !== Number(info.versionNumber)) continue
    if (
      info.masterId &&
      row.media_plan_master_id != null &&
      Number(row.media_plan_master_id) !== Number(info.masterId)
    ) {
      continue
    }
    currentVersions.push(row)
  }

  console.error(
    `[live-conformance] current versions matched=${currentVersions.length} (superseded ignored)`
  )

  const knownVersionIds = new Set<number>()
  const knownVersions = new Map<
    number,
    { id: number; mba_number: string; version_number: number }
  >()
  const currentVersionByMba = new Map<string, number>()
  for (const v of currentVersions) {
    const id = Number(v.id)
    if (!Number.isFinite(id)) continue
    knownVersionIds.add(id)
    knownVersions.set(id, {
      id,
      mba_number: String(v.mba_number ?? ""),
      version_number: Number(v.version_number) || 0,
    })
    currentVersionByMba.set(String(v.mba_number ?? ""), Number(v.version_number) || 0)
  }

  console.error("[live-conformance] scanning channel tables…")
  const channelByVersion = await loadChannelAggregates(knownVersionIds)

  console.error("[live-conformance] fee snapshots…")
  const feeSet = await versionsWithFeeSnapshots([...knownVersionIds])

  console.error("[live-conformance] integrity findings…")
  const integrity = await runIntegrityCron()
  const integrityByVersion = new Map<number, Set<string>>()
  for (const f of integrity.findings) {
    if (f.version == null) continue
    if (!knownVersionIds.has(f.version)) continue
    let set = integrityByVersion.get(f.version)
    if (!set) {
      set = new Set()
      integrityByVersion.set(f.version, set)
    }
    set.add(f.kind)
  }

  console.error("[live-conformance] known-dup scan…")
  const knownDupIds = await loadKnownDupVersionIds(
    knownVersionIds,
    knownVersions,
    currentVersionByMba
  )

  const statusByMba = new Map(
    scopedMasters.map((m: { mba_number?: string; campaign_status?: string }) => [
      String(m.mba_number ?? ""),
      String(m.campaign_status ?? ""),
    ])
  )

  const csvRows: CsvRow[] = []
  const failDims = {
    no_line_detail: 0,
    schedule_fallback: 0,
    asymmetric: 0,
    parse_failure: 0,
    known_dup: 0,
    empty: 0,
    amount_mismatch: 0,
    rounding: 0,
    structural: 0,
    c1_fullscope_drift: 0,
    integrity_findings: 0,
    missing_fee_snapshot: 0,
    incomplete_line_uid: 0,
    not_clean_backfill: 0,
  }
  let conformantCount = 0

  for (const version of currentVersions) {
    const mba = String(version.mba_number ?? "").trim()
    const versionId = Number(version.id)
    const versionNumber = Number(version.version_number) || 0
    const campaignStatus = statusByMba.get(mba) ?? String(version.campaign_status ?? "")

    const billingRaw = getBillingSchedule(version)
    const deliveryRaw = getDeliverySchedule(version)
    const billingShape = classifyScheduleShape(billingRaw)
    const deliveryShape = classifyScheduleShape(deliveryRaw)

    let financials: CampaignFinancials | null = null
    let parseError: string | null = null
    try {
      financials = computeCampaignFinancialsFromVersion(version)
      if (!financials) parseError = "computeCampaignFinancialsFromVersion returned null"
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e)
    }

    const { status: backfillStatus } = classifyBackfillStatus({
      mba,
      versionId,
      billingShape,
      deliveryShape,
      financials,
      isKnownDup: knownDupIds.has(versionId),
      parseError,
    })

    const hasLineDetail = financials
      ? billingMonthsHaveDetailedLineItems(financials.billingSchedule) ||
        billingMonthsHaveDetailedLineItems(financials.deliverySchedule)
      : false

    const agg = channelByVersion.get(versionId)
    const channelRowCount = agg?.channel_row_count ?? 0
    const lineUidPresent = agg?.line_uid_present ?? 0
    const lineUidCoverage =
      channelRowCount === 0 ? "0/0" : `${lineUidPresent}/${channelRowCount}`
    const lineUidOk = channelRowCount === 0 || lineUidPresent === channelRowCount

    const hasFee = feeSet.has(versionId)
    const c1Drift = hasC1FullScopeDrift(version)
    const kinds = integrityByVersion.get(versionId)
    const inIntegrity = kinds != null && kinds.size > 0

    const conformant = isConformant({
      backfill_status: backfillStatus,
      has_line_detail: hasLineDetail,
      c1_drift: c1Drift,
      in_integrity: inIntegrity,
      line_uid_coverage_ok: lineUidOk,
      has_fee_snapshot: hasFee,
    })

    if (conformant) conformantCount++
    else {
      if (!hasLineDetail) failDims.no_line_detail++
      if (backfillStatus === "schedule-fallback") failDims.schedule_fallback++
      if (backfillStatus === "asymmetric") failDims.asymmetric++
      if (backfillStatus === "parse-failure") failDims.parse_failure++
      if (backfillStatus === "known-dup") failDims.known_dup++
      if (backfillStatus === "empty") failDims.empty++
      if (backfillStatus === "amount-mismatch") failDims.amount_mismatch++
      if (backfillStatus === "rounding") failDims.rounding++
      if (backfillStatus === "structural") failDims.structural++
      if (backfillStatus !== "clean") failDims.not_clean_backfill++
      if (c1Drift) failDims.c1_fullscope_drift++
      if (inIntegrity) failDims.integrity_findings++
      if (!hasFee) failDims.missing_fee_snapshot++
      if (!lineUidOk) failDims.incomplete_line_uid++
    }

    csvRows.push({
      mba,
      current_version: String(versionNumber),
      version_id: String(versionId),
      campaign_status: campaignStatus,
      billing_shape: billingShape,
      delivery_shape: deliveryShape,
      has_line_detail: hasLineDetail ? "yes" : "no",
      channel_row_count: String(channelRowCount),
      line_uid_coverage: lineUidCoverage,
      has_fee_snapshot: hasFee ? "yes" : "no",
      backfill_status: backfillStatus,
      c1_fullscope_drift: c1Drift ? "yes" : "no",
      in_integrity_findings: inIntegrity ? "yes" : "no",
      integrity_kinds: kinds ? [...kinds].sort().join("|") : "",
      conformant: conformant ? "yes" : "no",
    })
  }

  const header = [
    "mba",
    "current_version",
    "version_id",
    "campaign_status",
    "billing_shape",
    "delivery_shape",
    "has_line_detail",
    "channel_row_count",
    "line_uid_coverage",
    "has_fee_snapshot",
    "backfill_status",
    "c1_fullscope_drift",
    "in_integrity_findings",
    "integrity_kinds",
    "conformant",
  ]
  const csvLines = [
    header.join(","),
    ...csvRows.map((r) =>
      [
        r.mba,
        r.current_version,
        r.version_id,
        csvEscape(r.campaign_status),
        r.billing_shape,
        r.delivery_shape,
        r.has_line_detail,
        r.channel_row_count,
        r.line_uid_coverage,
        r.has_fee_snapshot,
        r.backfill_status,
        r.c1_fullscope_drift,
        r.in_integrity_findings,
        csvEscape(r.integrity_kinds),
        r.conformant,
      ].join(",")
    ),
  ]
  writeFileSync(CSV_PATH, csvLines.join("\n"), "utf8")
  console.error(`[live-conformance] wrote ${CSV_PATH} (${csvRows.length} rows)`)

  // Human summary for someone who hasn't followed Plan C
  console.log("")
  console.log("=== Live campaign conformance (LIVE-P1) ===")
  console.log(
    "Question: do live campaigns match the new Plan C process (typed rows, fee"
  )
  console.log(
    "snapshots, line_uid identity, full-scope billable=MBA, schedule line detail)?"
  )
  console.log("")
  console.log(
    `Scope: CURRENT version only of campaigns whose master status is booked,`
  )
  console.log(
    `approved, or planned. Superseded versions are ignored (their campaign_status`
  )
  console.log(`is stale and would inflate failure counts).`)
  console.log("")
  console.log("Master campaign_status vocabulary found (all masters, exact strings):")
  for (const [s, n] of [...statusVocabulary.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${JSON.stringify(s)}: ${n}`)
  }
  console.log("")
  console.log(`Live campaigns in scope:     ${csvRows.length}`)
  console.log(`Fully conformant (all-green): ${conformantCount}`)
  console.log(`Not conformant:              ${csvRows.length - conformantCount}`)
  console.log("")
  console.log("Failing dimensions (count of non-conformant campaigns with each issue;")
  console.log("a campaign can appear in multiple dimensions):")
  console.log(`  no line detail on billing schedule:  ${failDims.no_line_detail}`)
  console.log(`  backfill schedule-fallback:          ${failDims.schedule_fallback}`)
  console.log(`  backfill asymmetric:                 ${failDims.asymmetric}`)
  console.log(`  backfill parse-failure:              ${failDims.parse_failure}`)
  console.log(`  backfill known-dup:                  ${failDims.known_dup}`)
  console.log(`  backfill empty:                      ${failDims.empty}`)
  console.log(`  backfill amount-mismatch:            ${failDims.amount_mismatch}`)
  console.log(`  backfill rounding:                   ${failDims.rounding}`)
  console.log(`  backfill structural:                 ${failDims.structural}`)
  console.log(`  backfill not clean (any):            ${failDims.not_clean_backfill}`)
  console.log(`  C1 full-scope drift:                 ${failDims.c1_fullscope_drift}`)
  console.log(`  in integrity findings:               ${failDims.integrity_findings}`)
  console.log(`  missing fee snapshot:                ${failDims.missing_fee_snapshot}`)
  console.log(`  incomplete line_uid coverage:        ${failDims.incomplete_line_uid}`)
  console.log("")
  console.log(
    "C1 drift join: mba → buildMbaToLatestVersionMap(scoped masters) → version_number"
  )
  console.log(
    "match (same as scripts/c1-fullscope-drift-report.ts); deltas via collectFullScopeDeltas."
  )
  console.log(`csv: ${CSV_PATH}`)
  console.log(`mode: dry-run (no writes)`)
}

main().catch((error) => {
  console.error("[live-conformance] fatal", error)
  process.exit(1)
})
