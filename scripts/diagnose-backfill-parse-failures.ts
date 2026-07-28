/**
 * Plan C S2-P4b — classify backfill parse-failures (read-only; writes nothing).
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
 */

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { getXanoBaseUrl, xanoUrl } from "@/lib/api/xano"
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

const MEDIA_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

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

type DiagRow = {
  mba: string
  version_number: number
  version_id: number
  campaign_status: string
  is_mba_latest: boolean
  is_focus_latest: boolean
  billing_presence: RawPresence
  delivery_presence: RawPresence
  billing_preview: string
  delivery_preview: string
  billing_choke_shape: string
  delivery_choke_shape: string
  versionHasChannelLineItems: boolean
  hasChannelTableRows: boolean
  class: FailureClass
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
  // String that JSON-parses to [] → treat as empty_array for classification.
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
      // fall through to unparseable
    }
  }

  const normalized = normalizeBillingScheduleToArray(raw)
  const months = parsePersistedBillingScheduleToMonths(raw)
  if (normalized && months && months.length > 0) {
    return { presence: "non_empty_ok", choke: "" }
  }
  // Present but normalize/parse failed, OR normalize succeeded with months that
  // somehow didn't survive (shouldn't happen) — treat as unparseable when raw
  // clearly has content.
  if (normalized == null || months == null || months.length === 0) {
    // Empty after normalize — if raw was a wrapper with empty months, already
    // handled above. Remaining = live parser choke.
    return { presence: "non_empty_unparseable", choke: chokeShape(raw) }
  }
  return { presence: "non_empty_ok", choke: "" }
}

function focusKey(mba: string, version: number): string {
  return `${mba.toUpperCase()}::${version}`
}

const FOCUS_SET = new Set(FOCUS_LATEST.map((f) => focusKey(f.mba, f.version)))

async function loadVersionIdsWithChannelRows(
  knownVersionIds: Set<number>
): Promise<Set<number>> {
  const withRows = new Set<number>()
  for (const table of CHANNEL_LINE_ITEM_ENDPOINTS) {
    try {
      const rows = await fetchAllXanoPages(
        xanoUrl(table, [...MEDIA_KEYS]),
        {},
        `diagnose-parse:${table}`,
        100,
        40
      )
      for (const row of rows) {
        const vid = Number(
          (row as { media_plan_version?: unknown }).media_plan_version
        )
        if (Number.isFinite(vid) && knownVersionIds.has(vid)) withRows.add(vid)
      }
    } catch (e) {
      console.error(
        `[diagnose] channel scan skipped ${table}:`,
        e instanceof Error ? e.message : String(e)
      )
    }
  }
  return withRows
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

async function main(): Promise<void> {
  loadEnvLocal()
  const { mbaFilter } = parseArgs(process.argv.slice(2))
  getXanoBaseUrl([...MEDIA_KEYS]) // validate env early

  console.error(
    `[diagnose-parse] mba=${mbaFilter ?? "*"} (read-only; no writes)`
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

  console.error("[diagnose-parse] scanning channel tables for line-item presence…")
  const channelVersionIds = await loadVersionIdsWithChannelRows(knownVersionIds)
  console.error(
    `[diagnose-parse] versions with channel rows: ${channelVersionIds.size}`
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

    const hasEmbedded = versionHasChannelLineItems(version)
    const hasTableRows = channelVersionIds.has(versionId)
    const latestVn = latestByMba.get(mba.toUpperCase())
    const isLatest = latestVn != null && latestVn === versionNumber
    const isFocus = FOCUS_SET.has(focusKey(mba, versionNumber))

    rows.push({
      mba,
      version_number: versionNumber,
      version_id: versionId,
      campaign_status: String(version.campaign_status ?? "").trim() || "(blank)",
      is_mba_latest: isLatest,
      is_focus_latest: isFocus,
      billing_presence: billing.presence,
      delivery_presence: delivery.presence,
      billing_preview: previewRaw(billingRaw),
      delivery_preview: previewRaw(deliveryRaw),
      billing_choke_shape: billing.choke,
      delivery_choke_shape: delivery.choke,
      versionHasChannelLineItems: hasEmbedded,
      hasChannelTableRows: hasTableRows,
      class: classifyFailure({
        billing: billing.presence,
        delivery: delivery.presence,
        hasChannelEmbedded: hasEmbedded,
        hasChannelTableRows: hasTableRows,
      }),
    })
  }

  rows.sort((a, b) => {
    const mba = a.mba.localeCompare(b.mba)
    if (mba !== 0) return mba
    return a.version_number - b.version_number || a.version_id - b.version_id
  })

  const counts = {
    total: rows.length,
    a: rows.filter((r) => r.class === "a_benign_empty").length,
    b: rows.filter((r) => r.class === "b_parser_bug").length,
    c: rows.filter((r) => r.class === "c_channel_no_schedule").length,
    focusLatest: rows.filter((r) => r.is_focus_latest).length,
    mbaLatest: rows.filter((r) => r.is_mba_latest).length,
  }

  console.log("")
  console.log("=== parse-failure diagnostic ===")
  console.log(`total parse-failures: ${counts.total}`)
  console.log(`  (a) benign empty / never saved:     ${counts.a}`)
  console.log(`  (b) LIVE PARSER BUG (unparseable):  ${counts.b}`)
  console.log(`  (c) channel lines, no schedule:     ${counts.c}`)
  console.log(`  of which MBA latest version:        ${counts.mbaLatest}`)
  console.log(`  of which S2-P4b focus latest list:  ${counts.focusLatest}`)
  console.log("")

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
      `  billing:  ${r.billing_presence}${r.billing_choke_shape ? ` | choke: ${r.billing_choke_shape}` : ""}`
    )
    console.log(`  billing preview: ${r.billing_preview}`)
    console.log(
      `  delivery: ${r.delivery_presence}${r.delivery_choke_shape ? ` | choke: ${r.delivery_choke_shape}` : ""}`
    )
    console.log(`  delivery preview: ${r.delivery_preview}`)
    console.log(
      `  versionHasChannelLineItems=${r.versionHasChannelLineItems} hasChannelTableRows=${r.hasChannelTableRows}`
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

  // Related: deliverySchedule = {} (or billing) that chokes normalize while the
  // other side still hydrates — not a backfill parse-failure, but a live parser
  // footgun (empty object ≠ empty array).
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
          ` status=${r.campaign_status} isMbaLatest=${r.is_mba_latest}`
      )
    }
  }

}

main().catch((error) => {
  console.error("[diagnose-parse] fatal", error)
  process.exit(1)
})
