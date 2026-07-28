/**
 * Plan C S2-P4b/P4d — classify backfill parse-failures (read-only; writes nothing to Xano).
 *
 * Usage:
 *   npx tsx scripts/diagnose-backfill-parse-failures.ts
 *   npx tsx scripts/diagnose-backfill-parse-failures.ts --mba=PENFOLD008
 *
 * For each version that `computeCampaignFinancialsFromVersion` returns null for
 * (or that has empty / unusable schedules), dumps schedule shape + classifies:
 *   (a) genuinely no schedule — benign history
 *   (b) schedule present but unparseable — LIVE PARSER BUG
 *   (c) channel line items exist but no schedule
 *
 * S2-P4d: also writes parse-failure-diagnosis.csv with budget quantification,
 * fee-snapshot presence, and a cross-ref against /api/cron/billing-integrity.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import axios from "axios"
import { GET as billingIntegrityGet } from "@/app/api/cron/billing-integrity/route"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import {
  getXanoBaseUrl,
  parseXanoListPayload,
  xanoAuthHeaderRecord,
  xanoUrl,
} from "@/lib/api/xano"
import { CHANNEL_LINE_ITEM_ENDPOINTS } from "@/lib/api/fetchChannelLineItemsByMba"
import {
  normalizeBillingScheduleToArray,
  parsePersistedBillingScheduleToMonths,
} from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import {
  computeCampaignFinancialsFromVersion,
  versionHasChannelLineItems,
} from "@/lib/finance/computeCampaignFinancialsFromVersion"
import { getBillingSchedule, getDeliverySchedule } from "@/lib/finance/normalizeFields"
import { buildMbaToLatestVersionMap } from "@/lib/finance/relevantPlanVersions"
import { classifyScheduleShape } from "@/lib/finance/rows/scheduleShape"
import { roundMoney2 } from "@/lib/format/money"

const MEDIA_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const CSV_PATH = resolve(process.cwd(), "parse-failure-diagnosis.csv")
const XANO_TIMEOUT_MS = 60_000
const PRODUCTION_TABLE = "media_plan_production"

/** Latest-version parse-failures called out in S2-P4b brief. */
const FOCUS_LATEST: ReadonlyArray<{ mba: string; version: number }> = [
  { mba: "PENFOLD008", version: 1 },
  { mba: "PENFOLD010", version: 1 },
  { mba: "PENFOLD011", version: 1 },
  { mba: "PENFOLD017", version: 2 },
  { mba: "PENFOLD019", version: 2 },
  { mba: "BICAU005", version: 2 },
  { mba: "PGAAUS009", version: 5 },
  { mba: "golf018", version: 1 },
  { mba: "golf020", version: 1 },
  { mba: "golf021", version: 1 },
  { mba: "hartm008", version: 1 },
  { mba: "hema006", version: 1 },
  { mba: "jayco016", version: 4 },
  { mba: "krusty005", version: 1 },
  { mba: "malay002", version: 3 },
]

type RawPresence =
  | "absent"
  | "empty_string"
  | "empty_array"
  | "non_empty_ok"
  | "non_empty_unparseable"

type FailureClass = "a_benign_empty" | "b_parser_bug" | "c_channel_no_schedule"
type CsvClass = "a" | "b" | "c"

type ChannelAgg = {
  channel_row_count: number
  channel_tables_hit: string[]
  sum_channel_budget: number
  /** Per-table field used for the sum (budget vs buy_amount). */
  budget_fields_by_table: Map<string, string>
  ambiguous_tables: string[]
  production_row_count: number
  sum_production_budget: number
  /** Full rows for jayco016 v4 dump. */
  rowsByTable: Map<string, Array<Record<string, unknown>>>
}

type DiagRow = {
  mba: string
  version_number: number
  version_id: number
  campaign_status: string
  is_mba_latest: boolean
  is_focus_latest: boolean
  billing_presence: RawPresence
  delivery_presence: RawPresence
  billing_shape: string
  delivery_shape: string
  billing_preview: string
  delivery_preview: string
  billing_choke_shape: string
  delivery_choke_shape: string
  versionHasChannelLineItems: boolean
  hasChannelTableRows: boolean
  class: FailureClass
  csv_class: CsvClass
  channel_row_count: number
  channel_tables_hit: string
  sum_channel_budget: number
  budget_field_note: string
  production_row_count: number
  sum_production_budget: number
  has_mba_fee_snapshot: boolean
  created_at: string
  updated_at: string
  in_integrity_findings: boolean
  integrity_kinds: string
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

function parseArgs(argv: string[]): { mbaFilter: string | null } {
  let mbaFilter: string | null = null
  for (const arg of argv) {
    if (arg.startsWith("--mba=")) mbaFilter = arg.slice("--mba=".length).trim()
  }
  return { mbaFilter }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function parseMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney2(value)
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""))
  return roundMoney2(Number.isFinite(n) ? n : 0)
}

/**
 * Channel money lives primarily in `bursts_json[].budget` (currency strings).
 * Fallbacks: top-level `budget`, then `buy_amount`/`buyAmount`.
 */
function sumBurstsJsonBudget(raw: unknown): number {
  let bursts: unknown = raw
  if (typeof bursts === "string") {
    const t = bursts.trim()
    if (!t) return 0
    try {
      bursts = JSON.parse(t) as unknown
    } catch {
      return 0
    }
  }
  if (!Array.isArray(bursts)) return 0
  let sum = 0
  for (const burst of bursts) {
    if (!burst || typeof burst !== "object") continue
    const b = burst as Record<string, unknown>
    // Prefer budget (line total); mediaAmount is net-of-fee and understates.
    sum += parseMoney(b.budget ?? b.mediaAmount ?? b.media_amount)
  }
  return roundMoney2(sum)
}

function rowBudgetAmount(
  row: Record<string, unknown>,
  table: string
): { amount: number; field: string; ambiguous: boolean } {
  const burstsSum = sumBurstsJsonBudget(row.bursts_json ?? row.burstsJson)
  if (burstsSum > 0) {
    const topBudget = parseMoney(row.budget)
    const ambiguous = topBudget > 0 && Math.abs(topBudget - burstsSum) > 0.01
    return {
      amount: burstsSum,
      field: "bursts_json[].budget",
      ambiguous,
    }
  }

  const budget = parseMoney(row.budget)
  const buy = parseMoney(row.buy_amount ?? row.buyAmount)
  if (budget > 0 && buy > 0 && Math.abs(budget - buy) > 0.01) {
    return {
      amount: budget,
      field: "budget",
      ambiguous: true,
    }
  }
  if (row.budget != null && String(row.budget).trim() !== "") {
    return { amount: budget, field: "budget", ambiguous: false }
  }
  if (buy !== 0 || row.buy_amount != null || row.buyAmount != null) {
    return { amount: buy, field: "buy_amount", ambiguous: false }
  }
  // Production sometimes stores unit cost × qty without a budget field.
  if (table === PRODUCTION_TABLE) {
    const amount = parseMoney(row.amount)
    const rate = parseMoney(row.rate ?? row.unit_cost ?? row.unitCost)
    if (amount > 0 && rate > 0) {
      return {
        amount: roundMoney2(amount * rate),
        field: "amount*rate(ambiguous)",
        ambiguous: true,
      }
    }
  }
  return { amount: 0, field: "none", ambiguous: false }
}

function previewRaw(raw: unknown, max = 200): string {
  if (raw == null) return "(null)"
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return "(empty string)"
    return t.length <= max ? t : `${t.slice(0, max)}…`
  }
  try {
    const s = JSON.stringify(raw)
    if (s == null) return `(unstringifiable ${typeof raw})`
    return s.length <= max ? s : `${s.slice(0, max)}…`
  } catch {
    return `(${typeof raw}, JSON.stringify failed)`
  }
}

/** Describe the shape that made normalize/parse return null while raw was non-empty. */
function chokeShape(raw: unknown): string {
  if (raw == null || raw === "") return ""
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return ""
    try {
      const parsed = JSON.parse(t) as unknown
      return `string→JSON:${chokeShape(parsed)}`
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return `string(len=${t.length}) JSON.parse FAIL: ${msg}; head=${JSON.stringify(t.slice(0, 80))}`
    }
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return "array(len=0)"
    const first = raw[0]
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const keys = Object.keys(first as object).slice(0, 12).join(",")
      return `array(len=${raw.length})[0].keys=[${keys}]`
    }
    return `array(len=${raw.length})[0].typeof=${typeof first}`
  }
  if (typeof raw === "object") {
    const keys = Object.keys(raw as object)
    const months = (raw as { months?: unknown }).months
    if (Array.isArray(months)) {
      return `object.keys=[${keys.slice(0, 12).join(",")}] months.array(len=${months.length})`
    }
    return `object.keys=[${keys.slice(0, 16).join(",")}] (no months[] — normalize returns null)`
  }
  return `typeof=${typeof raw}`
}

function classifyPresence(raw: unknown): {
  presence: RawPresence
  choke: string
} {
  if (raw == null) return { presence: "absent", choke: "" }
  if (typeof raw === "string" && raw.trim() === "") {
    return { presence: "empty_string", choke: "" }
  }
  if (Array.isArray(raw) && raw.length === 0) {
    return { presence: "empty_array", choke: "" }
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw.trim()) as unknown
      if (Array.isArray(parsed) && parsed.length === 0) {
        return { presence: "empty_array", choke: "" }
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { months?: unknown }).months) &&
        (parsed as { months: unknown[] }).months.length === 0
      ) {
        return { presence: "empty_array", choke: "" }
      }
    } catch {
      // fall through
    }
  }

  const normalized = normalizeBillingScheduleToArray(raw)
  const months = parsePersistedBillingScheduleToMonths(raw)
  if (normalized && months && months.length > 0) {
    return { presence: "non_empty_ok", choke: "" }
  }
  if (normalized == null || months == null || months.length === 0) {
    return { presence: "non_empty_unparseable", choke: chokeShape(raw) }
  }
  return { presence: "non_empty_ok", choke: "" }
}

function focusKey(mba: string, version: number): string {
  return `${mba.toUpperCase()}::${version}`
}

const FOCUS_SET = new Set(FOCUS_LATEST.map((f) => focusKey(f.mba, f.version)))

function toCsvClass(c: FailureClass): CsvClass {
  if (c === "b_parser_bug") return "b"
  if (c === "c_channel_no_schedule") return "c"
  return "a"
}

function classifyFailure(args: {
  billing: RawPresence
  delivery: RawPresence
  hasChannelEmbedded: boolean
  hasChannelTableRows: boolean
}): FailureClass {
  if (
    args.billing === "non_empty_unparseable" ||
    args.delivery === "non_empty_unparseable"
  ) {
    return "b_parser_bug"
  }
  if (args.hasChannelEmbedded || args.hasChannelTableRows) {
    return "c_channel_no_schedule"
  }
  return "a_benign_empty"
}

function emptyAgg(): ChannelAgg {
  return {
    channel_row_count: 0,
    channel_tables_hit: [],
    sum_channel_budget: 0,
    budget_fields_by_table: new Map(),
    ambiguous_tables: [],
    production_row_count: 0,
    sum_production_budget: 0,
    rowsByTable: new Map(),
  }
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
        `diagnose-parse:${table}`,
        100,
        40
      )
      for (const item of rows) {
        if (!item || typeof item !== "object") continue
        const row = item as Record<string, unknown>
        const vid = Number(row.media_plan_version)
        if (!Number.isFinite(vid) || !knownVersionIds.has(vid)) continue

        let agg = byVersion.get(vid)
        if (!agg) {
          agg = emptyAgg()
          byVersion.set(vid, agg)
        }

        const { amount, field, ambiguous } = rowBudgetAmount(row, table)
        const isProduction = table === PRODUCTION_TABLE

        if (isProduction) {
          agg.production_row_count++
          agg.sum_production_budget = roundMoney2(agg.sum_production_budget + amount)
        } else {
          agg.channel_row_count++
          agg.sum_channel_budget = roundMoney2(agg.sum_channel_budget + amount)
          if (!agg.channel_tables_hit.includes(table)) {
            agg.channel_tables_hit.push(table)
          }
        }

        const prevField = agg.budget_fields_by_table.get(table)
        if (!prevField) agg.budget_fields_by_table.set(table, field)
        else if (prevField !== field && !prevField.includes(field)) {
          agg.budget_fields_by_table.set(table, `${prevField}|${field}`)
        }
        if (ambiguous && !agg.ambiguous_tables.includes(table)) {
          agg.ambiguous_tables.push(table)
        }

        const list = agg.rowsByTable.get(table) ?? []
        list.push(row)
        agg.rowsByTable.set(table, list)
      }
    } catch (e) {
      console.error(
        `[diagnose] channel scan skipped ${table}:`,
        e instanceof Error ? e.message : String(e)
      )
    }
  }
  return byVersion
}

async function versionsWithFeeSnapshots(
  versionIds: number[]
): Promise<Set<number>> {
  const out = new Set<number>()
  if (versionIds.length === 0) return out
  let baseUrl: string
  try {
    baseUrl = getXanoBaseUrl([...MEDIA_KEYS])
  } catch {
    return out
  }
  const auth = xanoAuthHeaderRecord()
  // Batch by querying each version — fee snapshot volume is small for the 68.
  for (const versionId of versionIds) {
    try {
      const response = await axios.get(`${baseUrl}/mba_fee_snapshots`, {
        params: { media_plan_version: versionId, page: 1, per_page: 50 },
        headers: auth,
        timeout: XANO_TIMEOUT_MS,
        validateStatus: (s) => s >= 200 && s < 500,
      })
      if (response.status >= 400) continue
      const rows = parseXanoListPayload(response.data) as Array<{
        media_plan_version?: unknown
      }>
      if (
        rows.some((r) => Number(r.media_plan_version) === versionId) ||
        rows.length > 0
      ) {
        out.add(versionId)
      }
    } catch {
      // soft-fail
    }
  }
  return out
}

async function runIntegrityCron(): Promise<{
  findings: Array<{ version: number | null; kind: string; mba_number?: string }>
  kindCounts: Record<string, number>
  detectClassC: boolean
}> {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    console.error("[diagnose] CRON_SECRET missing — skipping integrity route call")
    return { findings: [], kindCounts: {}, detectClassC: false }
  }
  const req = new Request("http://localhost/api/cron/billing-integrity", {
    headers: { "x-cron-secret": secret },
  })
  const res = await billingIntegrityGet(req)
  const body = (await res.json()) as {
    ok?: boolean
    findings?: Array<{ version?: number | null; kind?: string; mba_number?: string }>
    kindCounts?: Record<string, number>
    error?: string
  }
  if (!res.ok || !body.ok) {
    console.error(
      `[diagnose] billing-integrity failed status=${res.status}`,
      body.error ?? body
    )
    return { findings: [], kindCounts: {}, detectClassC: false }
  }
  const findings = (body.findings ?? []).map((f) => ({
    version: f.version ?? null,
    kind: String(f.kind ?? ""),
    mba_number: f.mba_number,
  }))
  // Tripwire kinds: duplicate | version_less | orphan | checksum_* | writer_bypass | migrated_empty_side
  // None encode "channel rows exist but schedule empty".
  const detectClassC = false
  return {
    findings,
    kindCounts: body.kindCounts ?? {},
    detectClassC,
  }
}

async function main(): Promise<void> {
  loadEnvLocal()
  const { mbaFilter } = parseArgs(process.argv.slice(2))
  getXanoBaseUrl([...MEDIA_KEYS]) // validate env early

  console.error(
    `[diagnose-parse] mba=${mbaFilter ?? "*"} (read-only; no Xano writes)`
  )

  const masters = await fetchAllXanoPages(
    xanoUrl("media_plan_master", [...MEDIA_KEYS]),
    {},
    "diagnose-parse-masters",
    100,
    80
  )
  const mbaLatest = buildMbaToLatestVersionMap(masters)
  const latestByMba = new Map<string, number>()
  for (const [mba, info] of mbaLatest) {
    latestByMba.set(mba.toUpperCase(), info.versionNumber)
  }

  let versions = (await fetchAllXanoPages(
    xanoUrl("media_plan_versions", [...MEDIA_KEYS]),
    {},
    "diagnose-parse-versions",
    100,
    120
  )) as Record<string, unknown>[]

  versions = versions.filter((v) => {
    const mba = String(v.mba_number ?? "").trim()
    if (!mba) return false
    if (mbaFilter && mba.toUpperCase() !== mbaFilter.toUpperCase()) return false
    return true
  })

  const knownVersionIds = new Set<number>()
  for (const v of versions) {
    const id = Number(v.id)
    if (Number.isFinite(id)) knownVersionIds.add(id)
  }

  console.error("[diagnose-parse] scanning channel tables (counts + budgets)…")
  const channelByVersion = await loadChannelAggregates(knownVersionIds)
  console.error(
    `[diagnose-parse] versions with channel/production rows: ${channelByVersion.size}`
  )

  console.error("[diagnose-parse] running billing-integrity cron against same env…")
  const integrity = await runIntegrityCron()
  const integrityByVersion = new Map<number, Set<string>>()
  for (const f of integrity.findings) {
    if (f.version == null) continue
    let set = integrityByVersion.get(f.version)
    if (!set) {
      set = new Set()
      integrityByVersion.set(f.version, set)
    }
    set.add(f.kind)
  }
  console.error(
    `[diagnose-parse] integrity findings=${integrity.findings.length} kinds=${JSON.stringify(integrity.kindCounts)}`
  )

  const rows: DiagRow[] = []

  for (const version of versions) {
    const mba = String(version.mba_number ?? "").trim()
    const versionId = Number(version.id)
    const versionNumber = Number(version.version_number) || 0
    if (!Number.isFinite(versionId)) continue

    const billingRaw = getBillingSchedule(version)
    const deliveryRaw = getDeliverySchedule(version)
    const bothEmptyRaw =
      (billingRaw == null || billingRaw === "") &&
      (deliveryRaw == null || deliveryRaw === "")

    const financials = computeCampaignFinancialsFromVersion(version)
    const billing = classifyPresence(billingRaw)
    const delivery = classifyPresence(deliveryRaw)

    // Same gate as scripts/backfill-plan-rows.ts parse-failure:
    // empty raw schedules OR hydrate returns null (neither schedule usable).
    if (!bothEmptyRaw && financials != null) continue

    const agg = channelByVersion.get(versionId)
    const hasEmbedded = versionHasChannelLineItems(version)
    const hasTableRows = (agg?.channel_row_count ?? 0) + (agg?.production_row_count ?? 0) > 0
    const latestVn = latestByMba.get(mba.toUpperCase())
    const isLatest = latestVn != null && latestVn === versionNumber
    const isFocus = FOCUS_SET.has(focusKey(mba, versionNumber))
    const failureClass = classifyFailure({
      billing: billing.presence,
      delivery: delivery.presence,
      hasChannelEmbedded: hasEmbedded,
      hasChannelTableRows: hasTableRows,
    })

    const fieldNotes: string[] = []
    if (agg) {
      for (const [table, field] of agg.budget_fields_by_table) {
        fieldNotes.push(`${table}:${field}`)
      }
      if (agg.ambiguous_tables.length > 0) {
        fieldNotes.push(`AMBIGUOUS:${agg.ambiguous_tables.join("|")}`)
      }
    }

    const kinds = integrityByVersion.get(versionId)

    rows.push({
      mba,
      version_number: versionNumber,
      version_id: versionId,
      campaign_status: String(version.campaign_status ?? "").trim() || "(blank)",
      is_mba_latest: isLatest,
      is_focus_latest: isFocus,
      billing_presence: billing.presence,
      delivery_presence: delivery.presence,
      billing_shape: classifyScheduleShape(billingRaw),
      delivery_shape: classifyScheduleShape(deliveryRaw),
      billing_preview: previewRaw(billingRaw),
      delivery_preview: previewRaw(deliveryRaw),
      billing_choke_shape: billing.choke,
      delivery_choke_shape: delivery.choke,
      versionHasChannelLineItems: hasEmbedded,
      hasChannelTableRows: hasTableRows,
      class: failureClass,
      csv_class: toCsvClass(failureClass),
      channel_row_count: agg?.channel_row_count ?? 0,
      channel_tables_hit: (agg?.channel_tables_hit ?? []).join(";"),
      sum_channel_budget: agg?.sum_channel_budget ?? 0,
      budget_field_note: fieldNotes.join(";"),
      production_row_count: agg?.production_row_count ?? 0,
      sum_production_budget: agg?.sum_production_budget ?? 0,
      has_mba_fee_snapshot: false, // filled below
      created_at: String(version.created_at ?? ""),
      updated_at: String(version.updated_at ?? ""),
      in_integrity_findings: kinds != null && kinds.size > 0,
      integrity_kinds: kinds ? [...kinds].sort().join(";") : "",
    })
  }

  rows.sort((a, b) => {
    const mba = a.mba.localeCompare(b.mba)
    if (mba !== 0) return mba
    return a.version_number - b.version_number || a.version_id - b.version_id
  })

  console.error("[diagnose-parse] checking mba_fee_snapshots for parse-failure versions…")
  const feeSet = await versionsWithFeeSnapshots(rows.map((r) => r.version_id))
  for (const r of rows) {
    r.has_mba_fee_snapshot = feeSet.has(r.version_id)
  }

  const counts = {
    total: rows.length,
    a: rows.filter((r) => r.class === "a_benign_empty").length,
    b: rows.filter((r) => r.class === "b_parser_bug").length,
    c: rows.filter((r) => r.class === "c_channel_no_schedule").length,
    focusLatest: rows.filter((r) => r.is_focus_latest).length,
    mbaLatest: rows.filter((r) => r.is_mba_latest).length,
  }

  const classC = rows.filter((r) => r.class === "c_channel_no_schedule")
  const classCMoney = roundMoney2(
    classC.reduce((s, r) => s + r.sum_channel_budget + r.sum_production_budget, 0)
  )
  const moneyByStatus = new Map<string, { n: number; money: number }>()
  for (const r of classC) {
    const st = r.campaign_status
    const cur = moneyByStatus.get(st) ?? { n: 0, money: 0 }
    cur.n++
    cur.money = roundMoney2(cur.money + r.sum_channel_budget + r.sum_production_budget)
    moneyByStatus.set(st, cur)
  }

  const header = [
    "mba",
    "version",
    "version_id",
    "campaign_status",
    "class",
    "billing_shape",
    "delivery_shape",
    "channel_row_count",
    "channel_tables_hit",
    "sum_channel_budget",
    "budget_field_note",
    "production_row_count",
    "sum_production_budget",
    "has_mba_fee_snapshot",
    "created_at",
    "updated_at",
    "in_integrity_findings",
    "integrity_kinds",
  ]
  const csvLines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.mba,
        String(r.version_number),
        String(r.version_id),
        csvEscape(r.campaign_status),
        r.csv_class,
        r.billing_shape,
        r.delivery_shape,
        String(r.channel_row_count),
        csvEscape(r.channel_tables_hit),
        String(r.sum_channel_budget),
        csvEscape(r.budget_field_note),
        String(r.production_row_count),
        String(r.sum_production_budget),
        r.has_mba_fee_snapshot ? "true" : "false",
        csvEscape(r.created_at),
        csvEscape(r.updated_at),
        r.in_integrity_findings ? "true" : "false",
        csvEscape(r.integrity_kinds),
      ].join(",")
    ),
  ]
  writeFileSync(CSV_PATH, csvLines.join("\n"), "utf8")
  console.error(`[diagnose-parse] wrote ${CSV_PATH} (${rows.length} rows)`)

  console.log("")
  console.log("=== parse-failure diagnostic ===")
  console.log(`total parse-failures: ${counts.total}`)
  console.log(`  (a) benign empty / never saved:     ${counts.a}`)
  console.log(`  (b) LIVE PARSER BUG (unparseable):  ${counts.b}`)
  console.log(`  (c) channel lines, no schedule:     ${counts.c}`)
  console.log(`  of which MBA latest version:        ${counts.mbaLatest}`)
  console.log(`  of which S2-P4b focus latest list:  ${counts.focusLatest}`)
  console.log("")
  console.log("=== S2-P4d class-(c) money ===")
  console.log(`class-(c) versions: ${classC.length}`)
  console.log(
    `total money in channel+production rows: ${classCMoney.toFixed(2)}`
  )
  console.log("by campaign_status:")
  for (const [st, v] of [...moneyByStatus.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    console.log(`  ${st}: n=${v.n} money=${v.money.toFixed(2)}`)
  }
  console.log("")
  console.log("=== budget field convention ===")
  console.log(
    "Primary: sum of bursts_json[].budget (channel line money). Fallback: top-level budget, then buy_amount. Production may use amount*rate (flagged ambiguous)."
  )
  console.log(
    "See budget_field_note column for per-table field + AMBIGUOUS:… tags."
  )
  console.log("")
  console.log("=== integrity tripwire cross-ref ===")
  console.log(`integrity kindCounts: ${JSON.stringify(integrity.kindCounts)}`)
  const classCInIntegrity = classC.filter((r) => r.in_integrity_findings)
  console.log(
    `class-(c) also in integrity findings: ${classCInIntegrity.length}/${classC.length}`
  )
  if (classCInIntegrity.length > 0) {
    for (const r of classCInIntegrity.slice(0, 20)) {
      console.log(
        `  ${r.mba} v${r.version_number} id=${r.version_id} kinds=${r.integrity_kinds}`
      )
    }
  }
  console.log("")
  console.log(
    "Does the tripwire detect class-(c) (channel rows, empty schedule)? NO."
  )
  console.log(
    "Current finding classes are duplicate / version_less / orphan (+ rows checksum kinds)."
  )
  console.log(
    "None encode 'version has channel rows but no usable schedule' — that is a gap."
  )
  console.log(`detectClassC=${integrity.detectClassC}`)

  // Per-row dump
  for (const r of rows) {
    const tags = [
      r.class,
      r.is_mba_latest ? "MBA_LATEST" : null,
      r.is_focus_latest ? "FOCUS" : null,
    ]
      .filter(Boolean)
      .join(" ")
    console.log(
      `--- ${r.mba} v${r.version_number} id=${r.version_id} status=${r.campaign_status} [${tags}]`
    )
    console.log(
      `  billing:  ${r.billing_presence} shape=${r.billing_shape}${r.billing_choke_shape ? ` | choke: ${r.billing_choke_shape}` : ""}`
    )
    console.log(`  billing preview: ${r.billing_preview}`)
    console.log(
      `  delivery: ${r.delivery_presence} shape=${r.delivery_shape}${r.delivery_choke_shape ? ` | choke: ${r.delivery_choke_shape}` : ""}`
    )
    console.log(`  delivery preview: ${r.delivery_preview}`)
    console.log(
      `  versionHasChannelLineItems=${r.versionHasChannelLineItems} hasChannelTableRows=${r.hasChannelTableRows}` +
        ` channelRows=${r.channel_row_count} channelBudget=${r.sum_channel_budget}` +
        ` prodRows=${r.production_row_count} prodBudget=${r.sum_production_budget}` +
        ` feeSnap=${r.has_mba_fee_snapshot}`
    )
  }

  console.log("")
  console.log("=== class (b) LIVE PARSER BUG — every version ===")
  const classB = rows.filter((r) => r.class === "b_parser_bug")
  if (classB.length === 0) {
    console.log("(none among backfill parse-failures)")
  } else {
    for (const r of classB) {
      console.log(
        `${r.mba} v${r.version_number} id=${r.version_id} status=${r.campaign_status}` +
          ` billing=${r.billing_presence} delivery=${r.delivery_presence}` +
          (r.billing_choke_shape ? ` billingChoke=${r.billing_choke_shape}` : "") +
          (r.delivery_choke_shape ? ` deliveryChoke=${r.delivery_choke_shape}` : "")
      )
    }
  }

  console.log("")
  console.log(
    "=== related: non-empty-unparseable on a version that still hydrates (not in the 68) ==="
  )
  let relatedBugs = 0
  for (const version of versions) {
    const mba = String(version.mba_number ?? "").trim()
    const versionId = Number(version.id)
    const versionNumber = Number(version.version_number) || 0
    if (!Number.isFinite(versionId)) continue
    const financials = computeCampaignFinancialsFromVersion(version)
    if (financials == null) continue
    const billing = classifyPresence(getBillingSchedule(version))
    const delivery = classifyPresence(getDeliverySchedule(version))
    if (
      billing.presence !== "non_empty_unparseable" &&
      delivery.presence !== "non_empty_unparseable"
    ) {
      continue
    }
    relatedBugs++
    console.log(
      `${mba} v${versionNumber} id=${versionId}` +
        ` billing=${billing.presence}${billing.choke ? ` (${billing.choke})` : ""}` +
        ` delivery=${delivery.presence}${delivery.choke ? ` (${delivery.choke})` : ""}`
    )
  }
  if (relatedBugs === 0) console.log("(none)")

  console.log("")
  console.log("=== S2-P4b focus latest versions (15) ===")
  for (const f of FOCUS_LATEST) {
    const match = rows.filter(
      (r) =>
        r.mba.toUpperCase() === f.mba.toUpperCase() &&
        r.version_number === f.version
    )
    if (match.length === 0) {
      console.log(
        `${f.mba} v${f.version}: NOT in parse-failure set (clean or missing)`
      )
      continue
    }
    for (const r of match) {
      console.log(
        `${r.mba} v${r.version_number} id=${r.version_id} → ${r.class}` +
          ` billing=${r.billing_presence} delivery=${r.delivery_presence}` +
          ` embeddedLines=${r.versionHasChannelLineItems} tableLines=${r.hasChannelTableRows}` +
          ` status=${r.campaign_status} isMbaLatest=${r.is_mba_latest}` +
          ` channelBudget=${r.sum_channel_budget} prodBudget=${r.sum_production_budget}`
      )
    }
  }

  // jayco016 v4 full detail
  console.log("")
  console.log("=== jayco016 v4 full detail ===")
  const jaycoVersion = versions.find(
    (v) =>
      String(v.mba_number ?? "").trim().toUpperCase() === "JAYCO016" &&
      Number(v.version_number) === 4
  )
  if (!jaycoVersion) {
    console.log("(jayco016 v4 not found among versions)")
  } else {
    const vid = Number(jaycoVersion.id)
    const diag = rows.find((r) => r.version_id === vid)
    const financials = computeCampaignFinancialsFromVersion(jaycoVersion)
    console.log(
      `version_id=${vid} campaign_status=${String(jaycoVersion.campaign_status ?? "")}` +
        ` billing_shape=${classifyScheduleShape(getBillingSchedule(jaycoVersion))}` +
        ` delivery_shape=${classifyScheduleShape(getDeliverySchedule(jaycoVersion))}`
    )
    console.log(
      `computeCampaignFinancialsFromVersion: ${financials == null ? "null (finance shows nothing)" : "hydrated"}`
    )
    if (diag) {
      console.log(
        `parse-failure class=${diag.class} channelRows=${diag.channel_row_count}` +
          ` channelBudget=${diag.sum_channel_budget} prodRows=${diag.production_row_count}` +
          ` prodBudget=${diag.sum_production_budget} feeSnap=${diag.has_mba_fee_snapshot}` +
          ` integrity=${diag.integrity_kinds || "(none)"}`
      )
    }
    const agg = channelByVersion.get(vid)
    if (!agg || (agg.channel_row_count === 0 && agg.production_row_count === 0)) {
      console.log("(no channel/production rows for this version id)")
    } else {
      for (const [table, tableRows] of [...agg.rowsByTable.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
      )) {
        console.log(`  table=${table} rows=${tableRows.length}`)
        for (const row of tableRows) {
          const { amount, field, ambiguous } = rowBudgetAmount(row, table)
          console.log(
            `    id=${row.id} line_item_id=${row.line_item_id ?? ""}` +
              ` amount=${amount} via=${field}${ambiguous ? " AMBIGUOUS" : ""}` +
              ` budget=${JSON.stringify(row.budget)} buy_amount=${JSON.stringify(row.buy_amount ?? row.buyAmount)}` +
              ` bursts_json=${previewRaw(row.bursts_json ?? row.burstsJson, 160)}`
          )
        }
      }
    }
  }

  console.log("")
  console.log(`csv: ${CSV_PATH}`)
}

main().catch((error) => {
  console.error("[diagnose-parse] fatal", error)
  process.exit(1)
})
