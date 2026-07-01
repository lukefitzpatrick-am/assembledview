/**
 * Backfill zero/null campaign_kpi metrics from publisher_kpi benchmarks.
 *
 * Scope: active/live media plans only (`isLiveCampaignStatus` on media_plan_master).
 * Overwrites only when campaign metric is 0/null and benchmark is non-zero. Idempotent.
 * Excludes cpv (derived-by-design on non-CPV buys).
 *
 * Usage:
 *   npx tsx scripts/backfill-campaign-kpi-from-publisher.ts
 *   npx tsx scripts/backfill-campaign-kpi-from-publisher.ts --apply
 *   npx tsx scripts/backfill-campaign-kpi-from-publisher.ts --only=MBA123
 *   npx tsx scripts/backfill-campaign-kpi-from-publisher.ts --client=Acme
 *   npx tsx scripts/backfill-campaign-kpi-from-publisher.ts --ids=12,34
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import axios from "axios"
import { fetchPublishersFromXano } from "@/lib/api/publishers"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import { updateCampaignKpi } from "@/lib/kpi/campaignKpi"
import {
  buildPublisherIdToNormNameMap,
  linePublisherMatchesKpiPublisherField,
  mediaTypeMatchesKpiRow,
} from "@/lib/kpi/matching"
import type { CampaignKPI, PublisherKPI } from "@/lib/kpi/types"
import { isLiveCampaignStatus, type MediaPlanMaster } from "@/lib/types/mediaPlanMaster"

const REPO_ROOT = process.cwd()
const DATA_DIR = path.join(REPO_ROOT, "scripts", "data", "kpi-best-practice")
const NOMATCH_CSV_PATH = path.join(DATA_DIR, "campaign_kpi_backfill_nomatch.csv")
const REPORT_PATH = path.join(DATA_DIR, "campaign-backfill-report.json")

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

const METRICS = ["ctr", "conversion_rate", "vtr", "frequency"] as const
type MetricKey = (typeof METRICS)[number]

const PERCENT_METRICS = new Set<MetricKey>(["ctr", "conversion_rate", "vtr"])

type PlanScopeKey = `${string}|${number}`

type InScopePlan = {
  mba_number: string
  version_number: number
  mp_client_name: string
  campaign_status: string
}

type StagedPatch = {
  id: number
  mba_number: string
  version_number: number
  mp_client_name: string
  publisher: string
  media_type: string
  bid_strategy: string
  patch: Partial<Record<MetricKey, number>>
}

type SkipLog = {
  id: number
  mba_number: string
  version_number: number
  reason: string
  publisher?: string
  media_type?: string
  bid_strategy?: string
}

type BackfillReport = {
  mode: "dry-run" | "apply"
  scopeSource: string
  generatedAt: string
  filters: {
    onlyMba: string | null
    client: string | null
    ids: number[] | null
  }
  inScopePlans: Array<{
    mp_client_name: string
    mba_number: string
    version_number: number
    campaign_status: string
    rowCount: number
  }>
  totals: {
    campaignRowsFetched: number
    campaignRowsInScope: number
    rowsMatched: number
    rowsPatched: number
    metricPatches: Record<MetricKey, number>
    noMatch: number
    ambiguous: number
    percentScaleSkips: number
    benchmarkEmptySkips: number
    campaignNonZeroSkips: number
    errors: number
  }
  stagedPatches: StagedPatch[]
  skips: SkipLog[]
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

function parseArgs(): {
  dryRun: boolean
  onlyMba: string | null
  client: string | null
  ids: number[] | null
} {
  const argv = process.argv.slice(2)
  const dryRun = !argv.includes("--apply")
  let onlyMba: string | null = null
  let client: string | null = null
  let ids: number[] | null = null

  for (const arg of argv) {
    if (arg.startsWith("--only=")) {
      onlyMba = arg.slice("--only=".length).trim()
    }
    if (arg.startsWith("--client=")) {
      client = arg.slice("--client=".length).trim()
    }
    if (arg.startsWith("--ids=")) {
      ids = arg
        .slice("--ids=".length)
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n))
    }
  }

  return { dryRun, onlyMba, client, ids }
}

function normStr(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
}

function normMetric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isCampaignMetricUnset(value: unknown): boolean {
  const n = normMetric(value)
  return n === null || n === 0
}

function isBenchmarkCopyable(value: unknown): boolean {
  const n = normMetric(value)
  return n !== null && n !== 0
}

function passesScaleGuard(metric: MetricKey, benchmarkValue: number): boolean {
  if (!PERCENT_METRICS.has(metric)) return benchmarkValue > 0
  return benchmarkValue > 0 && benchmarkValue < 1
}

function planKey(mba: string, version: number): PlanScopeKey {
  return `${mba.trim()}|${version}` as PlanScopeKey
}

function toMaster(raw: Record<string, unknown>): MediaPlanMaster | null {
  const id = Number(raw.id)
  const mba = String(raw.mba_number ?? "").trim()
  const version = Number(raw.version_number)
  if (!Number.isFinite(id) || !mba || !Number.isFinite(version)) return null
  return {
    id,
    mba_number: mba,
    mp_client_name: String(raw.mp_client_name ?? raw.mp_clientname ?? "").trim(),
    mp_campaignname: String(raw.mp_campaignname ?? raw.mp_campaign_name ?? "").trim(),
    version_number: version,
    campaign_status: String(raw.campaign_status ?? raw.mp_campaignstatus ?? "").trim(),
    campaign_start_date: String(raw.campaign_start_date ?? "").trim(),
    campaign_end_date: String(raw.campaign_end_date ?? "").trim(),
    mp_campaignbudget: Number(raw.mp_campaignbudget ?? 0),
    created_at: raw.created_at !== undefined ? Number(raw.created_at) : undefined,
  }
}

async function fetchAllMasters(): Promise<MediaPlanMaster[]> {
  const endpoints = ["media_plan_master", "media_plans_master"]
  for (const endpoint of endpoints) {
    try {
      const url = xanoUrl(endpoint, [...MEDIA_PLANS_KEYS])
      const { items } = await fetchAllXanoPagesWithCompleteness(url, {}, `masters_${endpoint}`, 200, 50)
      return items
        .map((r) => toMaster(r as Record<string, unknown>))
        .filter((m): m is MediaPlanMaster => m !== null)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) continue
      throw err
    }
  }
  return []
}

/**
 * Active/live scope: media_plan_master rows where campaign_status is booked or approved.
 * @see lib/types/mediaPlanMaster.ts:22-28 (isLiveCampaignStatus)
 * @see lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts:42-43 (pacing uses same gate)
 */
function buildInScopePlans(masters: MediaPlanMaster[]): InScopePlan[] {
  const out: InScopePlan[] = []
  for (const m of masters) {
    if (!isLiveCampaignStatus(m.campaign_status)) continue
    out.push({
      mba_number: m.mba_number,
      version_number: m.version_number,
      mp_client_name: m.mp_client_name,
      campaign_status: m.campaign_status,
    })
  }
  return out
}

async function fetchAllCampaignKpiRows(): Promise<CampaignKPI[]> {
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")
  const { items, complete } = await fetchAllXanoPagesWithCompleteness(
    url,
    {},
    "campaign_kpi",
    200,
    50,
  )
  if (!complete) {
    console.warn("[backfill] campaign_kpi pagination may be incomplete")
  }
  return items as CampaignKPI[]
}

async function fetchAllPublisherKpiRows(): Promise<PublisherKPI[]> {
  const url = xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL")
  const response = await axios.get(url, {
    headers: {
      Accept: "application/json",
      ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
    },
    timeout: 30000,
  })
  const data = response.data
  if (Array.isArray(data)) return data as PublisherKPI[]

  const list = parseXanoListPayload(data) as PublisherKPI[]
  const meta = data && typeof data === "object" ? (data as Record<string, unknown>) : null
  const nextPage = meta?.nextPage
  if (nextPage !== null && nextPage !== undefined && Number(nextPage) > 1) {
    const { items, complete } = await fetchAllXanoPagesWithCompleteness(
      url,
      {},
      "publisher_kpi",
      200,
      50,
    )
    if (!complete) console.warn("[backfill] publisher_kpi pagination may be incomplete")
    return items as PublisherKPI[]
  }
  return list
}

function findPublisherMatches(
  row: CampaignKPI,
  publisherKpis: PublisherKPI[],
  idToNormName: Map<string, string>,
): PublisherKPI[] {
  const publisher = normStr(row.publisher)
  const bidStrategy = normStr(row.bid_strategy)
  const mediaType = row.media_type

  return publisherKpis.filter(
    (k) =>
      mediaTypeMatchesKpiRow(mediaType, k.media_type) &&
      linePublisherMatchesKpiPublisherField(publisher, k.publisher, idToNormName) &&
      normStr(k.bid_strategy) === bidStrategy,
  )
}

function isAmbiguousMatch(matches: PublisherKPI[]): boolean {
  if (matches.length <= 1) return false
  for (const metric of METRICS) {
    const distinct = new Set<number>()
    for (const m of matches) {
      const v = normMetric(m[metric])
      if (v !== null && v !== 0) distinct.add(v)
    }
    if (distinct.size > 1) return true
  }
  return false
}

function clientMatchesFilter(clientName: string, filter: string): boolean {
  return normStr(clientName).includes(normStr(filter))
}

function writeNomatchCsv(rows: SkipLog[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const header = "id,mba,version,publisher,media_type,bid_strategy,reason"
  const lines = rows
    .filter((r) => r.reason === "no_publisher_match")
    .map((r) =>
      [
        r.id,
        csvEscape(r.mba_number),
        r.version_number,
        csvEscape(r.publisher ?? ""),
        csvEscape(r.media_type ?? ""),
        csvEscape(r.bid_strategy ?? ""),
        csvEscape(r.reason),
      ].join(","),
    )
  fs.writeFileSync(NOMATCH_CSV_PATH, [header, ...lines].join("\n") + (lines.length ? "\n" : ""), "utf8")
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

async function main(): Promise<void> {
  loadEnvLocal()
  const { dryRun, onlyMba, client, ids } = parseArgs()

  console.info("[backfill] campaign_kpi zero-metric backfill from publisher_kpi")
  console.info(
    `[backfill] mode=${dryRun ? "dry-run" : "apply"} only=${onlyMba ?? "(all)"} client=${client ?? "(all)"} ids=${ids?.join(",") ?? "(all)"}`,
  )
  console.info(
    "[backfill] live scope: isLiveCampaignStatus(campaign_status) on media_plan_master — lib/types/mediaPlanMaster.ts:22-28",
  )
  console.info(
    "[backfill] pacing reference: lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts:42-43",
  )

  const masters = await fetchAllMasters()
  let inScopePlans = buildInScopePlans(masters)

  if (onlyMba) {
    inScopePlans = inScopePlans.filter((p) => p.mba_number === onlyMba)
  }
  if (client) {
    inScopePlans = inScopePlans.filter((p) => clientMatchesFilter(p.mp_client_name, client))
  }

  const scopeSet = new Set<PlanScopeKey>(
    inScopePlans.map((p) => planKey(p.mba_number, p.version_number)),
  )

  console.info(`[backfill] in-scope live plans: ${inScopePlans.length}`)
  for (const p of inScopePlans.sort((a, b) =>
    a.mp_client_name.localeCompare(b.mp_client_name) || a.mba_number.localeCompare(b.mba_number),
  )) {
    console.info(
      `  · ${p.mp_client_name} · ${p.mba_number} · v${p.version_number} · ${p.campaign_status}`,
    )
  }

  const [allCampaignRows, publisherKpis, publishers] = await Promise.all([
    fetchAllCampaignKpiRows(),
    fetchAllPublisherKpiRows(),
    fetchPublishersFromXano(),
  ])

  const idToNormName = buildPublisherIdToNormNameMap(publishers)

  let campaignRows = allCampaignRows.filter((row) => {
    const mba = String(row.mba_number ?? "").trim()
    const ver = Number(row.version_number)
    if (!mba || !Number.isFinite(ver)) return false
    return scopeSet.has(planKey(mba, ver))
  })

  if (ids && ids.length > 0) {
    const idSet = new Set(ids)
    campaignRows = campaignRows.filter((r) => typeof r.id === "number" && idSet.has(r.id))
  }

  const planRowCounts = new Map<PlanScopeKey, number>()
  for (const row of campaignRows) {
    const key = planKey(String(row.mba_number), Number(row.version_number))
    planRowCounts.set(key, (planRowCounts.get(key) ?? 0) + 1)
  }

  console.info("[backfill] in-scope campaign_kpi rows by plan (client · mba · version · rows):")
  for (const p of inScopePlans) {
    const key = planKey(p.mba_number, p.version_number)
    const count = planRowCounts.get(key) ?? 0
    console.info(`  · ${p.mp_client_name} · ${p.mba_number} · v${p.version_number} · ${count} rows`)
  }

  const totals = {
    campaignRowsFetched: allCampaignRows.length,
    campaignRowsInScope: campaignRows.length,
    rowsMatched: 0,
    rowsPatched: 0,
    metricPatches: {
      ctr: 0,
      conversion_rate: 0,
      vtr: 0,
      frequency: 0,
    } as Record<MetricKey, number>,
    noMatch: 0,
    ambiguous: 0,
    percentScaleSkips: 0,
    benchmarkEmptySkips: 0,
    campaignNonZeroSkips: 0,
    errors: 0,
  }

  const stagedPatches: StagedPatch[] = []
  const skips: SkipLog[] = []

  for (const row of campaignRows) {
    if (typeof row.id !== "number") continue

    const matches = findPublisherMatches(row, publisherKpis, idToNormName)
    if (matches.length === 0) {
      totals.noMatch++
      skips.push({
        id: row.id,
        mba_number: row.mba_number,
        version_number: row.version_number,
        reason: "no_publisher_match",
        publisher: row.publisher,
        media_type: row.media_type,
        bid_strategy: row.bid_strategy,
      })
      continue
    }

    if (isAmbiguousMatch(matches)) {
      totals.ambiguous++
      skips.push({
        id: row.id,
        mba_number: row.mba_number,
        version_number: row.version_number,
        reason: "ambiguous_publisher_match",
        publisher: row.publisher,
        media_type: row.media_type,
        bid_strategy: row.bid_strategy,
      })
      continue
    }

    totals.rowsMatched++
    const benchmark = matches[0]!
    const patch: Partial<Record<MetricKey, number>> = {}

    for (const metric of METRICS) {
      const campaignVal = normMetric(row[metric])
      const benchmarkVal = normMetric(benchmark[metric])

      if (!isCampaignMetricUnset(campaignVal)) {
        totals.campaignNonZeroSkips++
        continue
      }
      if (!isBenchmarkCopyable(benchmarkVal)) {
        totals.benchmarkEmptySkips++
        continue
      }
      if (!passesScaleGuard(metric, benchmarkVal!)) {
        totals.percentScaleSkips++
        skips.push({
          id: row.id,
          mba_number: row.mba_number,
          version_number: row.version_number,
          reason: `percent_scale_skip:${metric}=${benchmarkVal}`,
          publisher: row.publisher,
          media_type: row.media_type,
          bid_strategy: row.bid_strategy,
        })
        continue
      }

      patch[metric] = benchmarkVal!
      totals.metricPatches[metric]++
    }

    if (Object.keys(patch).length === 0) continue

    stagedPatches.push({
      id: row.id,
      mba_number: row.mba_number,
      version_number: row.version_number,
      mp_client_name: row.mp_client_name,
      publisher: row.publisher,
      media_type: row.media_type,
      bid_strategy: row.bid_strategy,
      patch,
    })
  }

  writeNomatchCsv(skips)

  console.info("[backfill] totals:")
  console.info(`  campaign rows fetched: ${totals.campaignRowsFetched}`)
  console.info(`  campaign rows in scope: ${totals.campaignRowsInScope}`)
  console.info(`  rows matched to publisher_kpi: ${totals.rowsMatched}`)
  console.info(`  rows with staged patches: ${stagedPatches.length}`)
  console.info(
    `  metric patches staged: ctr=${totals.metricPatches.ctr} conversion_rate=${totals.metricPatches.conversion_rate} vtr=${totals.metricPatches.vtr} frequency=${totals.metricPatches.frequency}`,
  )
  console.info(`  no publisher match: ${totals.noMatch}`)
  console.info(`  ambiguous match: ${totals.ambiguous}`)
  console.info(`  percent-scale skips: ${totals.percentScaleSkips}`)
  console.info(`  nomatch CSV: ${NOMATCH_CSV_PATH}`)

  const sampleCount = Math.min(5, stagedPatches.length)
  if (sampleCount > 0) {
    console.info("[backfill] sample staged patches:")
    for (const s of stagedPatches.slice(0, sampleCount)) {
      console.info(
        `  id=${s.id} ${s.media_type}/${s.publisher}/${s.bid_strategy} → ${JSON.stringify(s.patch)}`,
      )
    }
  }

  const report: BackfillReport = {
    mode: dryRun ? "dry-run" : "apply",
    scopeSource:
      "media_plan_master.campaign_status via isLiveCampaignStatus (booked|approved) — lib/types/mediaPlanMaster.ts:22-28",
    generatedAt: new Date().toISOString(),
    filters: { onlyMba, client, ids },
    inScopePlans: inScopePlans.map((p) => ({
      mp_client_name: p.mp_client_name,
      mba_number: p.mba_number,
      version_number: p.version_number,
      campaign_status: p.campaign_status,
      rowCount: planRowCounts.get(planKey(p.mba_number, p.version_number)) ?? 0,
    })),
    totals,
    stagedPatches,
    skips,
  }

  if (dryRun) {
    console.info("[backfill] dry-run complete — no writes. Review in-scope list above, then --apply.")
    return
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })

  for (const staged of stagedPatches) {
    try {
      const result = await updateCampaignKpi(staged.id, staged.patch)
      if (result === null) {
        totals.errors++
        skips.push({
          id: staged.id,
          mba_number: staged.mba_number,
          version_number: staged.version_number,
          reason: "patch_failed",
        })
        continue
      }
      totals.rowsPatched++
    } catch (e) {
      totals.errors++
      skips.push({
        id: staged.id,
        mba_number: staged.mba_number,
        version_number: staged.version_number,
        reason: `patch_error:${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  report.totals = totals
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8")
  console.info(`[backfill] apply complete — patched ${totals.rowsPatched} rows, errors=${totals.errors}`)
  console.info(`[backfill] report: ${REPORT_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
