import "server-only"

import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"
import { getDataBackendFor } from "@/lib/data/backend"
import {
  fetchAllMasters,
  fetchCurrentVersionRowsForMasters,
  type VersionRow,
} from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows"
import { publishedVersionFromMaster } from "@/lib/mediaplan/publishedVersionGuard"
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs"
import { isLiveCampaignStatus, type MediaPlanMaster } from "@/lib/types/mediaPlanMaster"
import { boundedMap } from "@/lib/utils/boundedMap"

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
/** Parallel per-master fetches; well under Launch-plan 100 req/s ceiling. */
export const LIVE_PLAN_LINE_ITEM_CONCURRENCY = 8

export type ResolveLivePlanLineItemsArgs = {
  endpoints: string[]
  asOfDate: string
  allowedClientSlugs: Set<string> | null
  /** Label for the empty-result warn (e.g. "programmatic"). */
  channelLabel?: string
}

export type LivePlanLineItemRow = {
  master: MediaPlanMaster
  versionRow: VersionRow
  lineItem: Record<string, unknown>
  endpoint: string
}

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

function parseVersion(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number(value)
  return Number.isFinite(n) ? n : 0
}

function toMaster(row: Record<string, unknown>): MediaPlanMaster | null {
  const mba = String(row.mba_number ?? "").trim()
  if (!mba) return null
  const id = Number(row.id)
  if (!Number.isFinite(id)) return null
  return {
    id,
    mba_number: mba,
    mp_client_name: String(row.mp_client_name ?? "").trim(),
    mp_campaignname: String(row.mp_campaignname ?? row.campaign_name ?? "").trim(),
    version_number: parseVersion(row.version_number),
    campaign_status: String(row.campaign_status ?? ""),
    campaign_start_date: String(row.campaign_start_date ?? "").trim().slice(0, 10),
    campaign_end_date: String(row.campaign_end_date ?? "").trim().slice(0, 10),
    mp_campaignbudget: Number(row.mp_campaignbudget ?? row.campaign_budget ?? 0) || 0,
    created_at: typeof row.created_at === "number" ? row.created_at : undefined,
  }
}

export function filterLiveMasters(
  masters: MediaPlanMaster[],
  asOfDate: string,
  allowedClientSlugs: Set<string> | null
): MediaPlanMaster[] {
  return masters.filter((m) => {
    if (!isLiveCampaignStatus(m.campaign_status, m.campaign_start_date, m.campaign_end_date, asOfDate)) {
      return false
    }
    if (!m.campaign_start_date || !m.campaign_end_date) return false
    if (asOfDate < m.campaign_start_date || asOfDate > m.campaign_end_date) return false
    if (allowedClientSlugs !== null) {
      const slug = slugifyPlanClientName(m.mp_client_name)
      if (!slug || !allowedClientSlugs.has(slug)) return false
    }
    return true
  })
}

function filterByMbaAndVersion(
  items: unknown[],
  mbaNumber: string,
  versionNumber: number,
  mediaPlanVersionId?: number | null
): Record<string, unknown>[] {
  if (!Array.isArray(items)) return []
  const normalizedMba = norm(mbaNumber)
  const versionStr = String(versionNumber)
  const versionIdStr =
    mediaPlanVersionId !== null && mediaPlanVersionId !== undefined
      ? String(mediaPlanVersionId)
      : null

  return items.filter((item) => {
    const row = item as Record<string, unknown>
    if (norm(row.mba_number) !== normalizedMba) return false

    const mpPlanNumber = row.mp_plannumber ?? row.mp_plan_number ?? row.mpPlanNumber
    const mediaPlanVersion = row.media_plan_version
    const mediaPlanVersionIdField = row.media_plan_version_id ?? row.media_plan_versionID
    const versionNumberField = row.version_number

    const hasVersionIdCandidate =
      (mediaPlanVersion !== null &&
        mediaPlanVersion !== undefined &&
        String(mediaPlanVersion).trim() !== "") ||
      (mediaPlanVersionIdField !== null &&
        mediaPlanVersionIdField !== undefined &&
        String(mediaPlanVersionIdField).trim() !== "")

    if (versionIdStr && hasVersionIdCandidate) {
      const candidates = [mediaPlanVersion, mediaPlanVersionIdField]
      return candidates.some((value) => String(value ?? "").trim() === versionIdStr)
    }

    const versionCandidates = [mpPlanNumber, versionNumberField]
    return versionCandidates.some((value) => String(value ?? "").trim() === versionStr)
  }) as Record<string, unknown>[]
}

/** Existing Xano walk: five param shapes, pick the tightest MBA+version match. */
export async function fetchXanoLineItemsForMba(args: {
  mba_number: string
  versionRowId: number
  versionNumber: number
  tableName: string
}): Promise<Record<string, unknown>[]> {
  const url = xanoUrl(args.tableName, [...MEDIA_PLANS_KEYS])
  const attempts: Array<Record<string, string | number | boolean | null | undefined>> = [
    { mba_number: args.mba_number, media_plan_version: args.versionRowId },
    { mba_number: args.mba_number, media_plan_version_id: args.versionRowId },
    { mba_number: args.mba_number, mp_plannumber: args.versionNumber },
    { mba_number: args.mba_number, version_number: args.versionNumber },
    { mba_number: args.mba_number, media_plan_version: args.versionNumber },
  ]

  let best: Record<string, unknown>[] = []
  let bestRawCount = Number.POSITIVE_INFINITY

  for (const params of attempts) {
    const raw = await fetchAllXanoPages(
      url,
      params,
      `PACING_${args.tableName}`,
      200,
      20
    )
    const filtered = filterByMbaAndVersion(
      raw,
      args.mba_number,
      args.versionNumber,
      args.versionRowId
    )
    if (
      filtered.length > best.length ||
      (filtered.length === best.length && raw.length < bestRawCount)
    ) {
      best = filtered
      bestRawCount = raw.length
    }
    if (raw.length > 0 && raw.length === filtered.length) {
      break
    }
  }

  return best
}

function rowsFromFetchedLines(args: {
  master: MediaPlanMaster
  versionRow: VersionRow
  endpoint: string
  lines: Record<string, unknown>[]
  logTag: string
}): LivePlanLineItemRow[] {
  const out: LivePlanLineItemRow[] = []
  for (const lineItem of args.lines) {
    const lineItemId = String(lineItem.line_item_id ?? lineItem.lineItemId ?? "").trim()
    if (!lineItemId) {
      console.warn(
        `[pacing/${args.logTag}] row missing line_item_id`,
        args.master.mba_number,
        args.endpoint,
        lineItem.id
      )
      continue
    }
    out.push({
      master: args.master,
      versionRow: args.versionRow,
      lineItem,
      endpoint: args.endpoint,
    })
  }
  return out
}

function warnEmptyLiveChannel(args: {
  channelLabel: string
  backend: string
  liveMasterCount: number
  endpoints: string[]
}): void {
  console.warn("[pacing/plans] no line items for live masters", {
    channel: args.channelLabel,
    backend: args.backend,
    liveMasterCount: args.liveMasterCount,
    endpoints: args.endpoints,
  })
}

async function resolveFromPostgres(
  args: ResolveLivePlanLineItemsArgs,
  logTag: string
): Promise<LivePlanLineItemRow[]> {
  const { readPlanMasters, readPlanVersions, fetchLineItemsFromPostgresByEndpoint } =
    await import("@/lib/data/readMediaPlans")

  const masters = (await readPlanMasters())
    .map((r) => toMaster(r as Record<string, unknown>))
    .filter((m): m is MediaPlanMaster => m !== null)
  const liveMasters = filterLiveMasters(masters, args.asOfDate, args.allowedClientSlugs)
  if (liveMasters.length === 0) return []

  const versions = await readPlanVersions()
  const versionRowsByMba = new Map<string, VersionRow>()
  const wantMba = new Set(liveMasters.map((m) => norm(m.mba_number)))
  const wantVersion = new Map(
    liveMasters.map((m) => [norm(m.mba_number), publishedVersionFromMaster(m)] as const)
  )
  for (const raw of versions) {
    const row = raw as Record<string, unknown>
    const mba = norm(row.mba_number)
    if (!mba || !wantMba.has(mba)) continue
    const versionNumber = parseVersion(row.version_number)
    if (versionNumber !== wantVersion.get(mba)) continue
    const id = Number(row.id)
    if (!Number.isFinite(id)) continue
    const brand =
      row.brand !== undefined && row.brand !== null ? String(row.brand).trim() || null : null
    versionRowsByMba.set(mba, { id, version_number: versionNumber, brand })
  }

  const perMaster = await boundedMap(
    liveMasters,
    async (master) => {
      const published = publishedVersionFromMaster(master)
      const versionRow = versionRowsByMba.get(norm(master.mba_number))
      if (!versionRow || published <= 0) {
        console.warn(
          `[pacing/${logTag}] no published version row for master`,
          master.mba_number,
          master.version_number
        )
        return [] as LivePlanLineItemRow[]
      }

      const inputs: LivePlanLineItemRow[] = []
      for (const endpoint of args.endpoints) {
        const lines = await fetchLineItemsFromPostgresByEndpoint(
          endpoint,
          master.mba_number,
          published
        )
        inputs.push(
          ...rowsFromFetchedLines({
            master,
            versionRow,
            endpoint,
            lines,
            logTag,
          })
        )
      }
      return inputs
    },
    LIVE_PLAN_LINE_ITEM_CONCURRENCY
  )

  const out = perMaster.flat()
  if (out.length === 0) {
    warnEmptyLiveChannel({
      channelLabel: logTag,
      backend: "postgres",
      liveMasterCount: liveMasters.length,
      endpoints: args.endpoints,
    })
  }
  return out
}

async function resolveFromXano(
  args: ResolveLivePlanLineItemsArgs,
  logTag: string
): Promise<LivePlanLineItemRow[]> {
  const masters = await fetchAllMasters()
  const liveMasters = filterLiveMasters(masters, args.asOfDate, args.allowedClientSlugs)
  if (liveMasters.length === 0) return []

  const versionRowsByMba = await fetchCurrentVersionRowsForMasters(liveMasters)

  const perMaster = await boundedMap(
    liveMasters,
    async (master) => {
      const versionRow = versionRowsByMba.get(norm(master.mba_number))
      if (!versionRow) {
        console.warn(
          `[pacing/${logTag}] no version row for master`,
          master.mba_number,
          master.version_number
        )
        return [] as LivePlanLineItemRow[]
      }

      const inputs: LivePlanLineItemRow[] = []
      for (const endpoint of args.endpoints) {
        const lines = await fetchXanoLineItemsForMba({
          mba_number: master.mba_number,
          versionRowId: versionRow.id,
          versionNumber: master.version_number,
          tableName: endpoint,
        })
        inputs.push(
          ...rowsFromFetchedLines({
            master,
            versionRow,
            endpoint,
            lines,
            logTag,
          })
        )
      }
      return inputs
    },
    LIVE_PLAN_LINE_ITEM_CONCURRENCY
  )

  const out = perMaster.flat()
  if (out.length === 0) {
    warnEmptyLiveChannel({
      channelLabel: logTag,
      backend: "xano",
      liveMasterCount: liveMasters.length,
      endpoints: args.endpoints,
    })
  }
  return out
}

/**
 * Live plan lines for pacing channel resolvers.
 * Postgres when `getDataBackendFor("plans")` is postgres (published watermark);
 * otherwise the existing Xano per-table walk. Search has its own composer
 * and now follows the same plans-backend switch.
 */
export async function resolveLivePlanLineItems(
  args: ResolveLivePlanLineItemsArgs
): Promise<LivePlanLineItemRow[]> {
  const logTag = args.channelLabel ?? args.endpoints.join(",")
  if (getDataBackendFor("plans") === "postgres") {
    return resolveFromPostgres(args, logTag)
  }
  return resolveFromXano(args, logTag)
}
