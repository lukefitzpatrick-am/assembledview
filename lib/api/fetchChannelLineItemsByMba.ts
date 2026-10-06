/**
 * Channel line-item reads from Postgres `line_items`.
 *
 * Query params media_plan_version / mp_plannumber / version_number from the
 * editor are treated as version *numbers* (client convention), not FK ids.
 */

import { sortLineItemsByLineItemNumber } from "@/lib/mediaplan/lineItemIds"
import {
  clampLatestToPublished,
  parseVersionNumber,
  publishedVersionFromMaster,
} from "@/lib/mediaplan/publishedVersionGuard"

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

/**
 * Catch-all URL segment → table endpoint. Kebab is never itself an endpoint;
 * dedicated routes must pass the `media_plan_*` name into the GET handler.
 * Without this map, a LINE_ITEM_BROWSER_API_PATH kebab with no dedicated route
 * hits the catch-all and proxies Xano (`isChannelLineItemEndpoint(kebab)` is false).
 */
export const CHANNEL_LINE_ITEM_URL_SEGMENT_TO_ENDPOINT: Record<string, ChannelLineItemEndpoint> =
  {
    television: "media_plan_television",
    radio: "media_plan_radio",
    newspaper: "media_plan_newspaper",
    magazines: "media_plan_magazines",
    ooh: "media_plan_ooh",
    cinema: "media_plan_cinema",
    "digi-display": "media_plan_digi_display",
    "digi-audio": "media_plan_digi_audio",
    "digi-video": "media_plan_digi_video",
    "digi-bvod": "media_plan_digi_bvod",
    integration: "media_plan_integrations",
    search: "media_plan_search",
    social: "media_plan_social",
    "prog-display": "media_plan_prog_display",
    "prog-video": "media_plan_prog_video",
    "prog-bvod": "media_plan_prog_bvod",
    "prog-audio": "media_plan_prog_audio",
    "prog-ooh": "media_plan_prog_ooh",
    influencers: "media_plan_influencers",
    production: "media_plan_production",
  }

export function resolveChannelLineItemEndpoint(path: string): ChannelLineItemEndpoint | null {
  if (isChannelLineItemEndpoint(path)) return path
  return CHANNEL_LINE_ITEM_URL_SEGMENT_TO_ENDPOINT[path] ?? null
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

/** Channel lines for one endpoint from Postgres `line_items`. */
export async function fetchXanoTableForEndpoint(
  endpoint: string,
  mbaNumber: string,
  versionNumber: number,
  _mediaPlanVersionId?: number | null,
  _logTag: string = endpoint
): Promise<any[]> {
  const { fetchLineItemsFromPostgresByEndpoint } = await import("@/lib/data/readMediaPlans")
  const rows = await fetchLineItemsFromPostgresByEndpoint(
    endpoint,
    mbaNumber,
    versionNumber
  )
  return sortLineItemsByLineItemNumber(rows)
}

function parseRequestedVersionNumber(hints: ChannelGetVersionHints): number {
  for (const raw of [hints.mpPlanNumber, hints.mediaPlanVersion, hints.versionNumber]) {
    const n = parseVersionNumber(raw)
    if (n > 0) return n
  }
  return 0
}

async function fetchMasterForMba(mbaNumber: string): Promise<Record<string, unknown> | null> {
  const { readPlanMasterByMba } = await import("@/lib/data/readMediaPlans")
  return readPlanMasterByMba(mbaNumber)
}

async function fetchVersionRowForMba(
  mbaNumber: string,
  versionNumber: number
): Promise<Record<string, unknown> | null> {
  const { readPlanVersionsByMba } = await import("@/lib/data/readMediaPlans")
  const rows = await readPlanVersionsByMba(mbaNumber)
  return (
    rows.find((row) => Number(row.version_number) === versionNumber) ?? null
  )
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

/** Resolve version scope and fetch one channel endpoint from Postgres. */
export async function fetchChannelLineItemsForMbaGet(
  endpoint: string,
  mbaNumber: string,
  hints: ChannelGetVersionHints = {},
  _logTag?: string
): Promise<any[]> {
  const { fetchLineItemsFromPostgresByEndpoint, readPlanMasterByMba } = await import(
    "@/lib/data/readMediaPlans"
  )
  const master = await readPlanMasterByMba(mbaNumber)
  if (!master) {
    throw new Error(`Media plan master not found for MBA number ${mbaNumber}`)
  }
  const published = publishedVersionFromMaster(master)
  if (published <= 0) {
    throw new Error(
      `Media plan master for MBA ${mbaNumber} is missing published version_number`
    )
  }
  const requested = parseRequestedVersionNumber(hints)
  const targetVersionNumber =
    requested > 0 ? clampLatestToPublished(requested, published) : published
  return fetchLineItemsFromPostgresByEndpoint(
    endpoint,
    mbaNumber,
    targetVersionNumber
  )
}
