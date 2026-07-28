/**
 * LIVE-P2 repair probe — inspect + optionally re-publish one no-line-detail campaign.
 *
 * Usage:
 *   npx tsx scripts/live-repair-probe.ts --mba=BOSS007 --inspect
 *   npx tsx scripts/live-repair-probe.ts --mba=BOSS007 --dry-recompute
 *   npx tsx scripts/live-repair-probe.ts --mba=BOSS007 --republish
 *
 * --dry-recompute: run C1 server-generate in memory (no write).
 * --republish: PATCH version billing/delivery schedules on Xano (dev). Does NOT touch master status.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import axios from "axios"

import { CHANNEL_LINE_ITEM_ENDPOINTS } from "@/lib/api/fetchChannelLineItemsByMba"
import {
  getXanoBaseUrl,
  parseXanoListPayload,
  xanoAuthHeaderRecord,
  xanoPostHeaderRecord,
  xanoUrl,
} from "@/lib/api/xano"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import type { FeeLoading, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { computeCampaignFinancialsFromVersion } from "@/lib/finance/computeCampaignFinancialsFromVersion"
import { getBillingSchedule, getDeliverySchedule } from "@/lib/finance/normalizeFields"
import { recomputeAndValidateBillingScheduleOnSave } from "@/lib/finance/recomputeBillingScheduleOnSave"
import { compareBackfillRowsToBlob } from "@/lib/finance/rows/backfillCompare"
import { classifyScheduleShape } from "@/lib/finance/rows/scheduleShape"
import { billingMonthsHaveDetailedLineItems } from "@/lib/mediaplan/partialMba"
import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"
import { parseMoneyInput } from "@/lib/format/money"

const MEDIA_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const CLIENT_KEYS = ["XANO_CLIENTS_BASE_URL"] as const
const XANO_TIMEOUT_MS = 60_000

const TABLE_TO_MEDIA: Record<string, string> = {
  media_plan_television: "television",
  media_plan_radio: "radio",
  media_plan_newspaper: "newspapers",
  media_plan_magazines: "magazines",
  media_plan_ooh: "ooh",
  media_plan_cinema: "cinema",
  media_plan_digi_display: "digidisplay",
  media_plan_digi_audio: "digiaudio",
  media_plan_digi_video: "digivideo",
  media_plan_digi_bvod: "bvod",
  media_plan_integrations: "integration",
  media_plan_search: "search",
  media_plan_social: "social",
  media_plan_prog_display: "progdisplay",
  media_plan_prog_video: "progvideo",
  media_plan_prog_bvod: "progbvod",
  media_plan_prog_audio: "progaudio",
  media_plan_prog_ooh: "progooh",
  media_plan_influencers: "influencers",
  media_plan_production: "production",
}

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local")
  if (!existsSync(p)) return
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
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

function parseArgs(argv: string[]): {
  mba: string
  inspect: boolean
  republish: boolean
  dryRecompute: boolean
} {
  let mba = "BOSS007"
  let inspect = true
  let republish = false
  let dryRecompute = false
  for (const arg of argv) {
    if (arg.startsWith("--mba=")) mba = arg.slice("--mba=".length).trim()
    if (arg === "--republish") {
      republish = true
      inspect = true
    }
    if (arg === "--dry-recompute") {
      dryRecompute = true
      inspect = true
    }
    if (arg === "--inspect") inspect = true
  }
  return { mba, inspect, republish, dryRecompute }
}

function snapshotVersion(version: Record<string, unknown>, label: string) {
  const billingRaw = getBillingSchedule(version)
  const deliveryRaw = getDeliverySchedule(version)
  const billingMonths = parsePersistedBillingScheduleToMonths(billingRaw) ?? []
  const deliveryMonths = parsePersistedBillingScheduleToMonths(deliveryRaw) ?? []
  const hasLineDetail =
    billingMonthsHaveDetailedLineItems(billingMonths) ||
    billingMonthsHaveDetailedLineItems(deliveryMonths)
  const financials = computeCampaignFinancialsFromVersion(version)
  const compared = financials
    ? compareBackfillRowsToBlob({
        financials,
        mba_number: String(version.mba_number ?? ""),
        media_plan_version: Number(version.id),
        isKnownDupVersion: false,
      })
    : null

  const monthSample = billingMonths.slice(0, 2).map((m) => ({
    month: m.monthYear ?? (m as { month?: string }).month,
    hasLineItems: Boolean(
      m.lineItems &&
        typeof m.lineItems === "object" &&
        Object.values(m.lineItems as Record<string, unknown[]>).some(
          (arr) => Array.isArray(arr) && arr.length > 0
        )
    ),
    mediaTotal: m.mediaTotal,
    lineItemKeys: m.lineItems ? Object.keys(m.lineItems as object) : [],
  }))

  console.log(`\n=== ${label} ===`)
  console.log({
    id: version.id,
    version_number: version.version_number,
    mba: version.mba_number,
    billing_shape: classifyScheduleShape(billingRaw),
    delivery_shape: classifyScheduleShape(deliveryRaw),
    billing_months: billingMonths.length,
    delivery_months: deliveryMonths.length,
    has_line_detail: hasLineDetail,
    backfill_compare_status: compared?.status ?? "n/a",
    billing_row_count: compared?.billingRowCount ?? 0,
    delivery_row_count: compared?.deliveryRowCount ?? 0,
    migratable_clean: compared?.status === "clean" && hasLineDetail,
    month_sample: monthSample,
  })
  return { hasLineDetail, compared, financials }
}

function parseBursts(row: Record<string, unknown>): Array<{
  startDate: string
  endDate: string
  budget: number
}> {
  const raw = row.bursts_json ?? row.bursts ?? row.burst
  let bursts: unknown[] = []
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      bursts = Array.isArray(parsed) ? parsed : []
    } catch {
      bursts = []
    }
  } else if (Array.isArray(raw)) {
    bursts = raw
  }
  return bursts
    .map((b) => {
      const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>
      const budget =
        parseMoneyInput(
          (o.budget ??
            o.mediaAmount ??
            o.media_amount ??
            o.buy_amount ??
            o.buyAmount ??
            o.calculatedValue ??
            o.net) as string | number | null | undefined
        ) ?? 0
      return {
        startDate: String(o.start_date ?? o.startDate ?? o.start ?? ""),
        endDate: String(o.end_date ?? o.endDate ?? o.end ?? ""),
        budget,
      }
    })
    .filter((b) => b.startDate && b.endDate)
}

function channelRowToLineItem(
  table: string,
  row: Record<string, unknown>,
  index: number
): LineItemInput | null {
  const mediaType = TABLE_TO_MEDIA[table]
  if (!mediaType) return null
  const lineItemId = String(
    row.line_item_id ?? row.lineItemId ?? row.id ?? `${mediaType}-${index}`
  )
  const bursts = parseBursts(row)
  if (bursts.length === 0) {
    const start = String(row.start_date ?? row.campaign_start_date ?? "")
    const end = String(row.end_date ?? row.campaign_end_date ?? "")
    const budget =
      parseMoneyInput(
        (row.budget ?? row.total_budget ?? row.media_budget) as string | number | null | undefined
      ) ?? 0
    if (!start || !end) return null
    bursts.push({ startDate: start, endDate: end, budget })
  }
  const enteredAmount = bursts.reduce((s, b) => s + (Number(b.budget) || 0), 0)
  return {
    lineItemId,
    line_uid: String(row.line_uid ?? "").trim() || undefined,
    mediaType,
    bursts,
    buyType: String(row.buy_type ?? row.buyType ?? "Fixed"),
    rate: 0,
    enteredAmount,
    budgetIncludesFees: Boolean(row.budget_includes_fees ?? row.budgetIncludesFees),
    clientPaysForMedia: Boolean(
      row.client_pays_for_media ?? row.clientPaysForMedia ?? false
    ),
    noAdserving: Boolean(row.no_adserving ?? row.noAdserving ?? false),
    approval: "approved",
  }
}

async function loadChannelLineItems(
  mba: string,
  versionId: number
): Promise<{ lines: LineItemInput[]; byTable: Record<string, number> }> {
  const { fetchAllXanoPages } = await import("@/lib/api/xanoPagination")
  const lines: LineItemInput[] = []
  const byTable: Record<string, number> = {}
  const mbaNorm = mba.trim().toLowerCase()
  for (const table of CHANNEL_LINE_ITEM_ENDPOINTS) {
    try {
      const raw = await fetchAllXanoPages(
        xanoUrl(table, [...MEDIA_KEYS]),
        {},
        `repair-probe:${table}`,
        100,
        40
      )
      let n = 0
      for (const item of raw) {
        if (!item || typeof item !== "object") continue
        const row = item as Record<string, unknown>
        if (row.superseded === true || row.superseded === "true" || row.superseded === 1) {
          continue
        }
        if (Number(row.media_plan_version) !== Number(versionId)) continue
        if (String(row.mba_number ?? "").trim().toLowerCase() !== mbaNorm) continue
        const li = channelRowToLineItem(table, row, n)
        if (li) {
          lines.push(li)
          n++
        }
      }
      if (n > 0) byTable[table] = n
    } catch (e) {
      console.error(
        `[probe] channel ${table}:`,
        e instanceof Error ? e.message : String(e)
      )
    }
  }
  return { lines, byTable }
}

function feeLoadingFromClient(client: Record<string, unknown>): FeeLoading {
  const out: FeeLoading = {}
  const keys: Array<keyof FeeLoading> = [
    "feetelevision",
    "feeradio",
    "feenewspapers",
    "feemagazines",
    "feeooh",
    "feecinema",
    "feedigidisplay",
    "feedigiaudio",
    "feedigivideo",
    "feebvod",
    "feeintegration",
    "feesearch",
    "feesocial",
    "feeprogdisplay",
    "feeprogvideo",
    "feeprogbvod",
    "feeprogaudio",
    "feeprogooh",
    "feecontentcreator",
    "feeinfluencers",
  ]
  for (const k of keys) {
    const n = Number(client[k])
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

async function main() {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))
  const mba = args.mba.toUpperCase() === args.mba ? args.mba : args.mba

  console.log(
    `[probe] mba=${args.mba} inspect=${args.inspect} dryRecompute=${args.dryRecompute} republish=${args.republish}`
  )

  const mastersRaw = await axios.get(xanoUrl("media_plan_master", [...MEDIA_KEYS]), {
    headers: xanoAuthHeaderRecord(),
    timeout: XANO_TIMEOUT_MS,
  })
  const masters = Array.isArray(mastersRaw.data) ? mastersRaw.data : []
  const master = masters.find(
    (m: { mba_number?: string }) =>
      String(m.mba_number ?? "").trim().toLowerCase() === args.mba.toLowerCase()
  )
  if (!master) {
    console.error("[probe] master not found")
    process.exit(1)
  }
  console.log("[probe] master", {
    id: master.id,
    mba: master.mba_number,
    status: master.campaign_status,
    version_number: master.version_number,
    client: master.mp_client_name,
  })

  const versions = parseXanoListPayload(
    (
      await axios.get(xanoUrl("media_plan_versions", [...MEDIA_KEYS]), {
        params: { mba_number: master.mba_number, page: 1, per_page: 50 },
        headers: xanoAuthHeaderRecord(),
        timeout: XANO_TIMEOUT_MS,
      })
    ).data
  )
  const version = versions.find(
    (v) =>
      v &&
      typeof v === "object" &&
      Number((v as Record<string, unknown>).version_number) ===
        Number(master.version_number)
  ) as Record<string, unknown> | undefined
  if (!version) {
    console.error("[probe] current version not found")
    process.exit(1)
  }

  const before = snapshotVersion(version, "BEFORE")

  const versionId = Number(version.id)
  const { lines, byTable } = await loadChannelLineItems(
    String(master.mba_number),
    versionId
  )
  console.log("\n[probe] channel line items assembled:", lines.length, byTable)
  console.log(
    "[probe] sample lines:",
    lines.slice(0, 3).map((l) => ({
      id: l.lineItemId,
      mediaType: l.mediaType,
      bursts: l.bursts.length,
      budget: l.bursts.reduce((s, b) => s + (Number(b.budget) || 0), 0),
      label: MEDIA_TYPE_LABELS[l.mediaType] ?? l.mediaType,
    }))
  )

  // Client fees
  let feeLoading: FeeLoading = {}
  try {
    const clientName = String(master.mp_client_name ?? "").trim()
    const clientsBase = getXanoBaseUrl([...CLIENT_KEYS])
    const clientsRes = await axios.get(`${clientsBase}/clients`, {
      headers: xanoAuthHeaderRecord(),
      timeout: XANO_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const clients = parseXanoListPayload(clientsRes.data)
    const needle = clientName.toLowerCase()
    const client = clients.find((c) => {
      if (!c || typeof c !== "object") return false
      const r = c as Record<string, unknown>
      const name = String(r.client_name ?? r.name ?? "")
        .trim()
        .toLowerCase()
      return name === needle || name.includes(needle) || needle.includes(name)
    }) as Record<string, unknown> | undefined
    if (client) {
      feeLoading = feeLoadingFromClient(client)
      console.log(
        "[probe] feeLoading keys",
        Object.keys(feeLoading).length,
        "from client",
        client.client_name ?? client.name
      )
    } else {
      console.warn(
        "[probe] client not found for fees:",
        clientName,
        "— using empty feeLoading (media line detail still regenerates)"
      )
    }
  } catch (e) {
    console.warn(
      "[probe] fee load failed:",
      e instanceof Error ? e.message : String(e)
    )
  }

  if (!args.republish && !args.dryRecompute) {
    console.log(
      "\n[probe] inspect-only. Pass --dry-recompute (no write) or --republish (PATCH)."
    )
    return
  }

  if (lines.length === 0) {
    console.error("[probe] no channel lines — cannot recompute")
    process.exit(1)
  }
  if (Object.keys(feeLoading).length === 0) {
    console.warn("[probe] empty feeLoading — recompute may still produce media line detail")
  }

  const recompute = recomputeAndValidateBillingScheduleOnSave({
    lineItems: lines,
    feeLoading,
    clientBillingSchedule: undefined, // generate from server
    overrideRows: [],
    opts: {
      ...(master.campaign_start_date
        ? { campaignStart: new Date(String(master.campaign_start_date)) }
        : {}),
      ...(master.campaign_end_date
        ? { campaignEnd: new Date(String(master.campaign_end_date)) }
        : {}),
    },
    meta: { mba_number: master.mba_number, version: master.version_number },
    version: { mba_number: master.mba_number, ...version },
  })

  if (!recompute.ok) {
    console.error("[probe] recompute failed", recompute.body)
    process.exit(1)
  }

  console.log("\n[probe] recompute ok", {
    billingMonths: recompute.billingSchedule.length,
    deliveryMonths: recompute.deliverySchedule.length,
    hasLineDetailBilling: billingMonthsHaveDetailedLineItems(recompute.billingSchedule),
    hasLineDetailDelivery: billingMonthsHaveDetailedLineItems(recompute.deliverySchedule),
    generatedFromServer: recompute.generatedFromServer,
  })

  const projectedVersion: Record<string, unknown> = {
    ...version,
    billingSchedule: recompute.billingSchedule,
    deliverySchedule: recompute.deliverySchedule,
    delivery_schedule: recompute.deliverySchedule,
  }
  const projected = snapshotVersion(
    projectedVersion,
    args.republish ? "PROJECTED (pre-PATCH)" : "PROJECTED (dry-recompute, not written)"
  )

  if (!args.republish) {
    const report = {
      mba: master.mba_number,
      version_id: versionId,
      mode: "dry-recompute",
      before: {
        has_line_detail: before.hasLineDetail,
        backfill: before.compared?.status,
        billingRows: before.compared?.billingRowCount,
        deliveryRows: before.compared?.deliveryRowCount,
        migratable_clean: false,
      },
      projected: {
        has_line_detail: projected.hasLineDetail,
        backfill: projected.compared?.status,
        billingRows: projected.compared?.billingRowCount,
        deliveryRows: projected.compared?.deliveryRowCount,
        migratable_clean:
          projected.compared?.status === "clean" && projected.hasLineDetail,
      },
      channel_lines_used: lines.length,
      byTable,
      note: "No Xano write. A planner re-save with lineItems+feeLoading hits the same C1 path.",
    }
    const outPath = resolve(
      process.cwd(),
      `repair-probe-${String(master.mba_number)}.json`
    )
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8")
    console.log("\n[probe] wrote", outPath)
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const baseUrl = getXanoBaseUrl([...MEDIA_KEYS])
  const patchBody = {
    billingSchedule: recompute.billingSchedule,
    deliverySchedule: recompute.deliverySchedule,
    delivery_schedule: recompute.deliverySchedule,
    inputs_hash: recompute.inputs_hash,
    rebill_needed: false,
  }
  const patchRes = await axios.patch(
    `${baseUrl}/media_plan_versions/${versionId}`,
    patchBody,
    {
      headers: xanoPostHeaderRecord(),
      timeout: XANO_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 500,
    }
  )
  console.log("[probe] PATCH status", patchRes.status)
  if (patchRes.status >= 400) {
    console.error("[probe] PATCH failed", patchRes.data)
    process.exit(1)
  }

  const afterRes = await axios.get(`${baseUrl}/media_plan_versions/${versionId}`, {
    headers: xanoAuthHeaderRecord(),
    timeout: XANO_TIMEOUT_MS,
  })
  const afterVersion = afterRes.data as Record<string, unknown>
  const after = snapshotVersion(afterVersion, "AFTER")

  const report = {
    mba: master.mba_number,
    version_id: versionId,
    mode: "republish",
    before: {
      has_line_detail: before.hasLineDetail,
      backfill: before.compared?.status,
      billingRows: before.compared?.billingRowCount,
      deliveryRows: before.compared?.deliveryRowCount,
    },
    after: {
      has_line_detail: after.hasLineDetail,
      backfill: after.compared?.status,
      billingRows: after.compared?.billingRowCount,
      deliveryRows: after.compared?.deliveryRowCount,
      migratable_clean:
        after.compared?.status === "clean" && after.hasLineDetail,
    },
    channel_lines_used: lines.length,
    byTable,
  }
  const outPath = resolve(process.cwd(), `repair-probe-${String(master.mba_number)}.json`)
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8")
  console.log("\n[probe] wrote", outPath)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error("[probe] fatal", e)
  process.exit(1)
})
