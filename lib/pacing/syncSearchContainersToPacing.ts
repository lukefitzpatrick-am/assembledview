import "server-only"

import axios from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { coercePacingMapping, refreshFactLineItemPacingDaily, upsertMapping } from "@/lib/snowflake/pacing-mapping-sync"
import {
  PACING_MAPPINGS_PATH,
  xanoPacingGet,
  xanoPacingGetMappingById,
  xanoPacingPatch,
  xanoPacingPost,
} from "@/lib/xano/pacingXanoApi"

const MEDIA_PLANS_KEYS: string[] = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]

export type SyncSearchContainersResult = {
  created: number
  updated: number
  deactivated: number
  /** Present when `dry_run` was used (API / script). */
  dry_run?: boolean
}

function str(v: unknown): string {
  if (v === undefined || v === null) return ""
  return String(v).trim()
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Search line items derived from media_plan_search: search + google_ads + suffix_id only. */
export function isAutoDerivedSearchPacingRow(m: Record<string, unknown>): boolean {
  return (
    str(m.media_type).toLowerCase() === "search" &&
    str(m.platform).toLowerCase() === "google_ads" &&
    str(m.match_type).toLowerCase() === "suffix_id"
  )
}

function parseBurstsRecords(bursts_json: unknown): Array<Record<string, unknown>> {
  if (bursts_json === undefined || bursts_json === null) return []
  let v: unknown = bursts_json
  if (typeof v === "string") {
    try {
      v = JSON.parse(v) as unknown
    } catch {
      return []
    }
  }
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
}

function budgetAndDatesFromBursts(bursts_json: unknown): {
  budget: number | null
  start_date: string | null
  end_date: string | null
} {
  const rows = parseBurstsRecords(bursts_json)
  let total = 0
  const dates: string[] = []
  for (const b of rows) {
    const rawBudget =
      b.budget ?? b.Budget ?? b.media_amount ?? b.deliverablesAmount ?? b.deliverables_amount ?? b.buyAmount
    const n = num(rawBudget)
    if (n != null && n > 0) total += n
    const sd = str(b.start_date ?? b.startDate ?? b.start)
    const ed = str(b.end_date ?? b.endDate ?? b.end)
    if (sd) dates.push(sd.slice(0, 10))
    if (ed) dates.push(ed.slice(0, 10))
  }
  const sorted = [...dates].filter(Boolean).sort()
  const start = sorted.length ? sorted[0]!.slice(0, 10) : null
  const end = sorted.length ? sorted[sorted.length - 1]!.slice(0, 10) : null
  return {
    budget: total > 0 ? total : null,
    start_date: start,
    end_date: end,
  }
}

const versionClientsCache = new Map<number, number | null>()

async function clientsIdForMediaPlanVersion(versionId: number): Promise<number | null> {
  if (versionClientsCache.has(versionId)) return versionClientsCache.get(versionId) ?? null
  try {
    const url = xanoUrl(`media_plan_versions?id=${versionId}`, MEDIA_PLANS_KEYS)
    const res = await axios.get(url, { timeout: 15000 })
    const raw = res.data
    const row = Array.isArray(raw) ? raw[0] : raw
    if (!row || typeof row !== "object") {
      versionClientsCache.set(versionId, null)
      return null
    }
    const o = row as Record<string, unknown>
    const cid =
      num(o.clients_id) ??
      num(o.client_id) ??
      num(o.clientsId) ??
      (() => {
        const c = o.client
        if (c && typeof c === "object") return num((c as Record<string, unknown>).id)
        return null
      })()
    versionClientsCache.set(versionId, cid)
    return cid
  } catch {
    versionClientsCache.set(versionId, null)
    return null
  }
}

function labelFromSearchContainer(row: Record<string, unknown>): string {
  const platform = str(row.platform)
  const campaign = str(row.campaign ?? row.objective)
  const li = num(row.line_item)
  const parts = [platform, campaign].filter(Boolean)
  const head = parts.join(" · ") || "Search"
  return li != null ? `${head} · #${li}` : head
}

export function pacingPayloadFromSearchContainer(
  row: Record<string, unknown>,
  clientsId: number
): Record<string, unknown> | null {
  const versionId = num(row.media_plan_version)
  if (versionId == null) return null

  const lineItemId = str(row.line_item_id ?? row.lineItemId)
  if (!lineItemId) return null

  const { budget, start_date, end_date } = budgetAndDatesFromBursts(row.bursts_json)

  return {
    clients_id: clientsId,
    media_plan_id: versionId,
    av_line_item_id: lineItemId,
    av_line_item_label: labelFromSearchContainer(row),
    media_type: "search",
    platform: "google_ads",
    match_type: "suffix_id",
    campaign_name_pattern: null,
    group_name_pattern: null,
    av_line_item_code: lineItemId,
    budget_split_pct: 100,
    line_item_budget: budget,
    start_date,
    end_date,
    is_active: true,
    created_via: "search_sync",
  }
}

async function fetchAllSearchContainers(opts: {
  mediaPlanVersionId?: number | null
}): Promise<Record<string, unknown>[]> {
  const baseUrl = xanoUrl("media_plan_search", MEDIA_PLANS_KEYS)
  const baseParams: Record<string, string | number | boolean | null | undefined> = {}
  if (opts.mediaPlanVersionId != null && Number.isFinite(opts.mediaPlanVersionId)) {
    baseParams.media_plan_version = opts.mediaPlanVersionId
  }
  const raw = await fetchAllXanoPages(baseUrl, baseParams, "media_plan_search", 200, 250)
  return raw.filter((r): r is Record<string, unknown> => r && typeof r === "object") as Record<string, unknown>[]
}

async function listPacingMappings(): Promise<Record<string, unknown>[]> {
  const raw = await xanoPacingGet(PACING_MAPPINGS_PATH)
  return parseXanoListPayload(raw) as Record<string, unknown>[]
}

/**
 * Upsert pacing_mappings from media_plan_search rows and deactivate orphaned auto-derived search mappings.
 */
export async function syncSearchContainersToPacingMappings(options: {
  mediaPlanVersionId?: number | null
  clientsId?: number | null
  allowedClientIds?: number[] | null
  /** When false, skip Snowflake MERGE + dynamic table refresh (tests only). */
  snowflake?: boolean
  /** Count creates/updates/deactivations only — no Xano writes, no Snowflake MERGE/refresh. */
  dryRun?: boolean
  /**
   * Skip the single `FACT_LINE_ITEM_PACING_DAILY` refresh at end of sync (caller refreshes both facts).
   */
  skipDynamicTableRefresh?: boolean
}): Promise<SyncSearchContainersResult> {
  const dryRun = options.dryRun === true
  const doSf = options.snowflake !== false && !dryRun
  const skipDtRefresh = options.skipDynamicTableRefresh === true
  const rows = await fetchAllSearchContainers({
    mediaPlanVersionId: options.mediaPlanVersionId ?? null,
  })

  /** `${clients_id}::${av_line_item_id}` */
  const activeKeys = new Set<string>()
  const containersByKey = new Map<string, Record<string, unknown>>()

  for (const row of rows) {
    const vid = num(row.media_plan_version)
    if (vid == null) continue

    let cid =
      num(row.clients_id ?? row.client_id) ?? (await clientsIdForMediaPlanVersion(vid))

    if (cid == null) continue

    if (options.clientsId != null && cid !== options.clientsId) continue

    if (options.allowedClientIds != null && options.allowedClientIds.length > 0) {
      if (!options.allowedClientIds.includes(cid)) continue
    }

    const lineItemId = str(row.line_item_id ?? row.lineItemId)
    if (!lineItemId) continue

    const key = `${cid}::${lineItemId}`
    activeKeys.add(key)
    containersByKey.set(key, row)
  }

  let created = 0
  let updated = 0

  const allMappings = await listPacingMappings()

  const mappingByTriple = new Map<string, Record<string, unknown>>()
  for (const m of allMappings) {
    const cid = num(m.clients_id)
    const aid = str(m.av_line_item_id)
    const plat = str(m.platform).toLowerCase()
    if (cid == null || !aid) continue
    mappingByTriple.set(`${cid}::${aid}::${plat}`, m)
  }

  for (const key of activeKeys) {
    const row = containersByKey.get(key)
    if (!row) continue
    const [cidStr, lineId] = key.split("::", 2)
    const clientsId = Number.parseInt(cidStr!, 10)
    if (!Number.isFinite(clientsId)) continue

    const body = pacingPayloadFromSearchContainer(row, clientsId)
    if (!body) continue

    const triple = `${clientsId}::${lineId}::google_ads`
    const existing = mappingByTriple.get(triple)

    if (existing && num(existing.id) != null) {
      const id = Math.floor(num(existing.id)!)
      if (dryRun) {
        updated += 1
      } else {
        await xanoPacingPatch(`${PACING_MAPPINGS_PATH}/${id}`, body)
        updated += 1
        if (doSf) {
          const full = await xanoPacingGetMappingById(id)
          const mapped = coercePacingMapping(full)
          if (mapped) await upsertMapping(mapped)
        }
      }
    } else if (dryRun) {
      created += 1
    } else {
      const savedRaw = await xanoPacingPost(PACING_MAPPINGS_PATH, body)
      created += 1
      const newId = num((savedRaw as Record<string, unknown>)?.id)
      if (newId != null) {
        const nid = Math.floor(newId)
        if (doSf) {
          const full = await xanoPacingGetMappingById(nid)
          const mapped = coercePacingMapping(full)
          if (mapped) await upsertMapping(mapped)
        }
      }
    }
  }

  let deactivated = 0
  const candidates = allMappings.filter(isAutoDerivedSearchPacingRow)

  for (const m of candidates) {
    const mid = num(m.id)
    const cid = num(m.clients_id)
    const aid = str(m.av_line_item_id)
    if (mid == null || cid == null || !aid) continue

    if (options.clientsId != null && cid !== options.clientsId) continue
    if (options.allowedClientIds != null && options.allowedClientIds.length > 0) {
      if (!options.allowedClientIds.includes(cid)) continue
    }

    if (options.mediaPlanVersionId != null) {
      const mp = num(m.media_plan_id)
      if (mp !== options.mediaPlanVersionId) continue
    }

    const k = `${cid}::${aid}`
    if (activeKeys.has(k)) continue
    if (!isTruthyActive(m)) continue

    if (dryRun) {
      deactivated += 1
    } else {
      await xanoPacingPatch(`${PACING_MAPPINGS_PATH}/${Math.floor(mid)}`, { is_active: false })
      deactivated += 1
      if (doSf) {
        const full = await xanoPacingGetMappingById(Math.floor(mid))
        const fresh = coercePacingMapping(full)
        if (fresh) await upsertMapping(fresh)
      }
    }
  }

  if (!skipDtRefresh && doSf && (created > 0 || updated > 0 || deactivated > 0)) {
    await refreshFactLineItemPacingDaily()
  }

  return dryRun ? { created, updated, deactivated, dry_run: true } : { created, updated, deactivated }
}

function isTruthyActive(m: Record<string, unknown>): boolean {
  const v = m.is_active
  if (v === false || v === 0 || v === "false") return false
  return true
}

/**
 * Call **before** DELETE on media_plan_search. Loads the row by id, deactivates the derived pacing mapping,
 * MERGEs Snowflake, refreshes FACT_LINE_ITEM_PACING_DAILY.
 */
export async function prepareSearchContainerDeleteForPacing(
  searchContainerId: number,
  allowedClientIds: number[] | null = null
): Promise<boolean> {
  const url = xanoUrl(`media_plan_search/${searchContainerId}`, MEDIA_PLANS_KEYS)
  let row: Record<string, unknown> | null = null
  try {
    const res = await axios.get(url, { timeout: 10000 })
    const raw = res.data
    row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  } catch {
    return false
  }
  if (!row) return false

  const lineItemId = str(row.line_item_id ?? row.lineItemId)
  const vid = num(row.media_plan_version)
  if (!lineItemId || vid == null) return false

  const cid = num(row.clients_id ?? row.client_id) ?? (await clientsIdForMediaPlanVersion(vid))
  if (cid == null) return false
  if (allowedClientIds !== null && allowedClientIds.length > 0 && !allowedClientIds.includes(cid)) {
    return false
  }

  const all = await listPacingMappings()
  const match = all.find(
    (m) =>
      isAutoDerivedSearchPacingRow(m) &&
      num(m.clients_id) === cid &&
      str(m.av_line_item_id) === lineItemId &&
      isTruthyActive(m)
  )
  if (!match || num(match.id) == null) return false

  const id = Math.floor(num(match.id)!)
  await xanoPacingPatch(`${PACING_MAPPINGS_PATH}/${id}`, { is_active: false })
  const full = await xanoPacingGetMappingById(id)
  const mapped = coercePacingMapping(full)
  if (mapped) await upsertMapping(mapped)
  await refreshFactLineItemPacingDaily()
  return true
}
