/**
 * FK-first channel line-item reads (same strategy as MBA GET).
 *
 * Resolves the published media_plan_versions row for an MBA, then fetches
 * children preferring media_plan_version = version row id. This is robust when
 * version_number and mp_plannumber disagree (e.g. first published version = 2).
 *
 * Query params media_plan_version / mp_plannumber / version_number from the
 * editor are treated as version *numbers* (client convention), not FK ids.
 */

import axios from "axios"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { parseXanoListPayload, xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { sortLineItemsByLineItemNumber } from "@/lib/mediaplan/lineItemIds"
import {
  clampLatestToPublished,
  parseVersionNumber,
  pickPublishedVersionRow,
  publishedVersionFromMaster,
} from "@/lib/mediaplan/publishedVersionGuard"

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

/** All Xano line-item table endpoints used by channel GETs / catch-all proxy. */
export const CHANNEL_LINE_ITEM_ENDPOINTS = [
  "media_plan_television",
  "media_plan_radio",
  "media_plan_newspaper",
  "media_plan_magazines",
  "media_plan_ooh",
  "media_plan_cinema",
  "media_plan_digi_display",
  "media_plan_digi_audio",
  "media_plan_digi_video",
  "media_plan_digi_bvod",
  "media_plan_integrations",
  "media_plan_search",
  "media_plan_social",
  "media_plan_prog_display",
  "media_plan_prog_video",
  "media_plan_prog_bvod",
  "media_plan_prog_audio",
  "media_plan_prog_ooh",
  "media_plan_influencers",
  "media_plan_production",
] as const

export type ChannelLineItemEndpoint = (typeof CHANNEL_LINE_ITEM_ENDPOINTS)[number]

const CHANNEL_LINE_ITEM_ENDPOINT_SET = new Set<string>(CHANNEL_LINE_ITEM_ENDPOINTS)

export function isChannelLineItemEndpoint(path: string): path is ChannelLineItemEndpoint {
  return CHANNEL_LINE_ITEM_ENDPOINT_SET.has(path)
}

function normalise(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

export type VersionScope = {
  versionNumber: number
  mediaPlanVersionId: number | null
}

export type ChannelGetVersionHints = {
  mpPlanNumber?: string | null
  mediaPlanVersion?: string | null
  versionNumber?: string | null
}

/**
 * Prefer matching by media_plan_versions.id FK when present; fall back to
 * version_number / mp_plannumber for legacy rows without an FK.
 */
export function filterByMbaAndVersion(
  items: unknown[],
  mbaNumber: string,
  versionNumber: number,
  mediaPlanVersionId?: number | null
): any[] {
  if (!Array.isArray(items)) return []
  const normalizedMba = normalise(mbaNumber)
  const versionStr = String(versionNumber)
  const versionIdStr =
    mediaPlanVersionId !== null && mediaPlanVersionId !== undefined
      ? String(mediaPlanVersionId)
      : null

  return items.filter((item) => {
    const row = item as Record<string, unknown>
    if (normalise(row?.mba_number) !== normalizedMba) return false

    const mpPlanNumber = row?.mp_plannumber ?? row?.mp_plan_number ?? row?.mpPlanNumber
    const mediaPlanVersion = row?.media_plan_version
    const mediaPlanVersionIdField = row?.media_plan_version_id ?? row?.media_plan_versionID
    const versionNumberField = row?.version_number

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
  })
}

/**
 * Query Xano with FK-first attempt chain (identical to MBA GET).
 */
export async function fetchXanoTableForEndpoint(
  endpoint: string,
  mbaNumber: string,
  versionNumber: number,
  mediaPlanVersionId?: number | null,
  logTag: string = endpoint
): Promise<any[]> {
  const url = xanoUrl(endpoint, [...MEDIA_PLANS_KEYS])

  const attempts: Array<Record<string, string | number | boolean | null | undefined>> = [
    ...(mediaPlanVersionId !== null && mediaPlanVersionId !== undefined
      ? [
          { mba_number: mbaNumber, media_plan_version: mediaPlanVersionId },
          { mba_number: mbaNumber, media_plan_version_id: mediaPlanVersionId },
        ]
      : []),
    { mba_number: mbaNumber, mp_plannumber: versionNumber },
    { mba_number: mbaNumber, version_number: versionNumber },
    { mba_number: mbaNumber, media_plan_version: versionNumber },
  ]

  let bestFiltered: any[] = []
  let bestRawCount = Number.POSITIVE_INFINITY

  for (const params of attempts) {
    const raw = await fetchAllXanoPages(url, params, logTag)
    const filtered = filterByMbaAndVersion(raw, mbaNumber, versionNumber, mediaPlanVersionId)

    if (
      filtered.length > bestFiltered.length ||
      (filtered.length === bestFiltered.length && raw.length < bestRawCount)
    ) {
      bestFiltered = filtered
      bestRawCount = raw.length
    }

    if (raw.length > 0 && raw.length === filtered.length) {
      break
    }
  }

  return sortLineItemsByLineItemNumber(bestFiltered)
}

function parseRequestedVersionNumber(hints: ChannelGetVersionHints): number {
  for (const raw of [hints.mpPlanNumber, hints.mediaPlanVersion, hints.versionNumber]) {
    const n = parseVersionNumber(raw)
    if (n > 0) return n
  }
  return 0
}

async function fetchMasterForMba(mbaNumber: string): Promise<Record<string, unknown> | null> {
  const requestedNormalized = normalise(mbaNumber)
  const masterResponse = await axios.get(
    `${xanoUrl("media_plan_master", [...MEDIA_PLANS_KEYS])}?mba_number=${encodeURIComponent(mbaNumber)}`,
    { headers: xanoAuthHeaderRecord() }
  )

  if (Array.isArray(masterResponse.data)) {
    return (
      masterResponse.data.find((item: any) => normalise(item?.mba_number) === requestedNormalized) ||
      null
    )
  }
  if (masterResponse.data && typeof masterResponse.data === "object") {
    return normalise((masterResponse.data as any).mba_number) === requestedNormalized
      ? (masterResponse.data as Record<string, unknown>)
      : null
  }
  return null
}

async function fetchVersionRowForMba(
  mbaNumber: string,
  versionNumber: number
): Promise<Record<string, unknown> | null> {
  const requestedNormalized = normalise(mbaNumber)
  const versionResponse = await axios.get(
    `${xanoUrl("media_plan_versions", [...MEDIA_PLANS_KEYS])}?mba_number=${encodeURIComponent(mbaNumber)}&version_number=${versionNumber}&page=1&per_page=50`,
    { headers: xanoAuthHeaderRecord() }
  )
  const rows = parseXanoListPayload(versionResponse.data).filter(
    (v: any) => normalise(v?.mba_number) === requestedNormalized
  )
  return (rows[0] as Record<string, unknown>) || null
}

/**
 * Resolve published (or requested) version row id + version_number for channel GETs.
 */
export async function resolveVersionScopeForChannelGet(
  mbaNumber: string,
  hints: ChannelGetVersionHints = {}
): Promise<VersionScope> {
  const master = await fetchMasterForMba(mbaNumber)
  if (!master) {
    throw new Error(`Media plan master not found for MBA number ${mbaNumber}`)
  }

  const published = publishedVersionFromMaster(master)
  if (published <= 0) {
    throw new Error(`Media plan master for MBA ${mbaNumber} is missing published version_number`)
  }

  const requested = parseRequestedVersionNumber(hints)
  const targetVersionNumber =
    requested > 0 ? clampLatestToPublished(requested, published) : published

  let versionRow = await fetchVersionRowForMba(mbaNumber, targetVersionNumber)

  if (!versionRow && targetVersionNumber !== published) {
    versionRow = await fetchVersionRowForMba(mbaNumber, published)
  }

  if (!versionRow) {
    // Last resort: page versions for MBA and pick published watermark row.
    const history = await fetchAllXanoPages(
      xanoUrl("media_plan_versions", [...MEDIA_PLANS_KEYS]),
      { mba_number: mbaNumber },
      "CHANNEL_versions",
      100,
      20
    )
    const forMba = history.filter((v: any) => normalise(v?.mba_number) === normalise(mbaNumber))
    versionRow = pickPublishedVersionRow(forMba, published) as Record<string, unknown> | null
  }

  if (!versionRow) {
    throw new Error(`No media plan versions found for MBA number ${mbaNumber}`)
  }

  const versionNumber =
    parseVersionNumber(versionRow.version_number) || targetVersionNumber || published
  const rawId = versionRow.id
  const mediaPlanVersionId =
    rawId !== undefined && rawId !== null
      ? typeof rawId === "string"
        ? parseInt(rawId, 10)
        : Number(rawId)
      : null

  return {
    versionNumber,
    mediaPlanVersionId:
      mediaPlanVersionId !== null && Number.isFinite(mediaPlanVersionId) ? mediaPlanVersionId : null,
  }
}

/** Resolve version scope + FK-first fetch for one channel endpoint. */
export async function fetchChannelLineItemsForMbaGet(
  endpoint: string,
  mbaNumber: string,
  hints: ChannelGetVersionHints = {},
  logTag?: string
): Promise<any[]> {
  const scope = await resolveVersionScopeForChannelGet(mbaNumber, hints)
  return fetchXanoTableForEndpoint(
    endpoint,
    mbaNumber,
    scope.versionNumber,
    scope.mediaPlanVersionId,
    logTag ?? endpoint
  )
}
