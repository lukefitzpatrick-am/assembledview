import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { xanoUrl } from "@/lib/api/xano"
import { computeAccrualRows, normalizeMonthKey, type AccrualApiResponse } from "@/lib/finance/accrual"

export const dynamic = "force-dynamic"
export const revalidate = 0

type XanoMaster = {
  id?: number
  mba_number?: string
  version_number?: number | string
}

type XanoVersion = {
  id?: number
  mba_number?: string
  media_plan_master_id?: number
  version_number?: number | string
  versionNumber?: number | string
  version?: number | string
  updated_at?: string
  created_at?: string

  mp_client_name?: string
  client_name?: string
  campaign_name?: string
  mp_campaignname?: string
  client_slug?: string
  slug?: string

  deliverySchedule?: unknown
  delivery_schedule?: unknown
  billingSchedule?: unknown
  billing_schedule?: unknown
}

type XanoLineItemRow = {
  mba_number?: unknown
  mp_plannumber?: unknown
  version_number?: unknown
  media_plan_version?: unknown
  media_plan_version_id?: unknown

  // Deterministic line item identifier (matches deliverySchedule.lineItemId)
  line_item_id?: unknown
  lineItemId?: unknown
  id?: unknown

  // Flag
  client_pays_for_media?: unknown
  clientPaysForMedia?: unknown
}

function safeString(v: unknown): string {
  return String(v ?? "").trim()
}

function normalizeKey(v: unknown): string {
  return safeString(v).toLowerCase()
}

function parseVersionNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === "string" ? Number.parseInt(v, 10) : Number(v)
  return Number.isFinite(n) ? n : null
}

function parseTime(value: unknown): number | null {
  const s = safeString(value)
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function extractVersionNumber(v: XanoVersion): number | null {
  return (
    parseVersionNumber(v.version_number) ??
    parseVersionNumber(v.versionNumber) ??
    parseVersionNumber(v.version) ??
    null
  )
}

function compareMostUpToDate(a: XanoVersion, b: XanoVersion): number {
  const aV = extractVersionNumber(a)
  const bV = extractVersionNumber(b)

  // Prefer highest version number if present on either record.
  if (aV !== null || bV !== null) {
    if (aV === null && bV !== null) return -1
    if (aV !== null && bV === null) return 1
    if (aV !== null && bV !== null) {
      if (aV !== bV) return aV > bV ? 1 : -1
    }
  }

  // Fallback: most recently updated, then created.
  const aUpdated = parseTime(a.updated_at)
  const bUpdated = parseTime(b.updated_at)
  if (aUpdated !== null || bUpdated !== null) {
    if (aUpdated === null && bUpdated !== null) return -1
    if (aUpdated !== null && bUpdated === null) return 1
    if (aUpdated !== null && bUpdated !== null && aUpdated !== bUpdated) {
      return aUpdated > bUpdated ? 1 : -1
    }
  }

  const aCreated = parseTime(a.created_at)
  const bCreated = parseTime(b.created_at)
  if (aCreated !== null || bCreated !== null) {
    if (aCreated === null && bCreated !== null) return -1
    if (aCreated !== null && bCreated === null) return 1
    if (aCreated !== null && bCreated !== null && aCreated !== bCreated) {
      return aCreated > bCreated ? 1 : -1
    }
  }

  // Final deterministic fallback by id.
  const aId = Number(a.id ?? -Infinity)
  const bId = Number(b.id ?? -Infinity)
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId > bId ? 1 : -1
  return 0
}

function pickLatestVersions(versions: XanoVersion[], masters: XanoMaster[]) {
  const masterMap = new Map<string, { masterId?: number; versionNumber: number }>()

  for (const m of masters) {
    const mba = normalizeKey(m.mba_number)
    if (!mba) continue
    const vnum = parseVersionNumber(m.version_number)
    if (vnum === null) continue
    const existing = masterMap.get(mba)
    if (!existing || vnum > existing.versionNumber) {
      masterMap.set(mba, { masterId: m.id, versionNumber: vnum })
    }
  }

  // If master map is incomplete, ensure we still pick a best version per mba_number.
  const bestByMba = new Map<string, XanoVersion>()

  for (const v of versions) {
    const mba = normalizeKey(v.mba_number) || (v.media_plan_master_id ? `master:${v.media_plan_master_id}` : "")
    if (!mba) continue

    const masterHint = masterMap.get(mba)
    if (masterHint) {
      const vnum = extractVersionNumber(v)
      const isLatestNumber = vnum !== null && vnum === masterHint.versionNumber
      const masterIdMatches =
        !v.media_plan_master_id || !masterHint.masterId || v.media_plan_master_id === masterHint.masterId
      if (isLatestNumber && masterIdMatches) {
        // Still compare in case duplicates exist for same (mba, version_number)
        const existing = bestByMba.get(mba)
        if (!existing || compareMostUpToDate(existing, v) < 0) bestByMba.set(mba, v)
        continue
      }
      // If it doesn't match master's latest version_number, skip.
      continue
    }

    const existing = bestByMba.get(mba)
    if (!existing) {
      bestByMba.set(mba, v)
      continue
    }
    if (compareMostUpToDate(existing, v) < 0) bestByMba.set(mba, v)
  }

  return Array.from(bestByMba.values())
}

async function fetchXanoJson<T>(request: NextRequest, url: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  }

  const apiKey = process.env.XANO_API_KEY
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
    // keep cookies out of upstream call; auth is via XANO_API_KEY
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Xano request failed (${res.status}) for ${url}${text ? `: ${text}` : ""}`)
  }

  return (await res.json()) as T
}

const XANO_LINE_ITEM_ENDPOINTS = [
  "television_line_items",
  "radio_line_items",
  "search_line_items",
  "social_media_line_items",
  "newspaper_line_items",
  "magazines_line_items",
  "ooh_line_items",
  "cinema_line_items",
  "digital_display_line_items",
  "digital_audio_line_items",
  "digital_video_line_items",
  "bvod_line_items",
  "integration_line_items",
  "prog_display_line_items",
  "prog_video_line_items",
  "prog_bvod_line_items",
  "prog_audio_line_items",
  "prog_ooh_line_items",
  "influencers_line_items",
] as const

function buildXanoUrlWithParams(
  endpoint: string,
  params: Record<string, string | number | boolean | null | undefined>,
  baseKeys: string[]
) {
  const url = new URL(xanoUrl(endpoint, baseKeys))
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue
    url.searchParams.set(k, String(v))
  }
  return url.toString()
}

function parseNumericId(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number(value)
  return Number.isFinite(n) ? n : null
}

function matchesMbaAndVersion(args: {
  item: XanoLineItemRow
  mbaNumber: string
  versionNumber: number
  mediaPlanVersionId: number | null
}): boolean {
  const mbaMatch = normalizeKey(args.item?.mba_number) === normalizeKey(args.mbaNumber)
  if (!mbaMatch) return false

  const versionStr = String(args.versionNumber)
  const versionIdStr = args.mediaPlanVersionId !== null ? String(args.mediaPlanVersionId) : null

  const mediaPlanVersion = safeString(args.item?.media_plan_version)
  const mediaPlanVersionId = safeString(args.item?.media_plan_version_id)
  const mpPlanNumber = safeString(args.item?.mp_plannumber)
  const versionNumberField = safeString(args.item?.version_number)

  const hasVersionIdCandidate = Boolean(mediaPlanVersion || mediaPlanVersionId)

  // Prefer matching by media_plan_versions.id when present on the row
  if (versionIdStr && hasVersionIdCandidate) {
    return [mediaPlanVersion, mediaPlanVersionId].some((v) => v && v === versionIdStr)
  }

  // Fallback to human version number fields
  return [mpPlanNumber, versionNumberField, mediaPlanVersion].some((v) => v && v === versionStr)
}

async function fetchVersionScopedLineItems(args: {
  request: NextRequest
  endpoint: (typeof XANO_LINE_ITEM_ENDPOINTS)[number]
  mbaNumber: string
  versionNumber: number
  mediaPlanVersionId: number | null
}): Promise<XanoLineItemRow[]> {
  const baseKeys = ["XANO_MEDIA_CONTAINERS_BASE_URL", "XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]

  const attempts: Array<Record<string, string | number>> = [
    ...(args.mediaPlanVersionId !== null
      ? [
          { mba_number: args.mbaNumber, media_plan_version: args.mediaPlanVersionId },
          { mba_number: args.mbaNumber, media_plan_version_id: args.mediaPlanVersionId },
        ]
      : []),
    { mba_number: args.mbaNumber, mp_plannumber: args.versionNumber },
    { mba_number: args.mbaNumber, version_number: args.versionNumber },
    // Some tables store the version number in media_plan_version
    { mba_number: args.mbaNumber, media_plan_version: args.versionNumber },
  ]

  let bestFiltered: XanoLineItemRow[] = []
  let bestRawCount = Number.POSITIVE_INFINITY

  for (const params of attempts) {
    const url = buildXanoUrlWithParams(args.endpoint, params, baseKeys)
    const raw = await fetchXanoJson<any[]>(args.request, url).catch(() => [])
    const rawArray = Array.isArray(raw) ? (raw as XanoLineItemRow[]) : []

    const filtered = rawArray.filter((item) =>
      matchesMbaAndVersion({
        item,
        mbaNumber: args.mbaNumber,
        versionNumber: args.versionNumber,
        mediaPlanVersionId: args.mediaPlanVersionId,
      })
    )

    if (filtered.length > bestFiltered.length || (filtered.length === bestFiltered.length && rawArray.length < bestRawCount)) {
      bestFiltered = filtered
      bestRawCount = rawArray.length
    }

    // Stop early when server-side filtering already returned only matches
    if (rawArray.length > 0 && rawArray.length === filtered.length) break
  }

  return bestFiltered
}

function responseNoStore(payload: AccrualApiResponse, init?: ResponseInit) {
  const res = NextResponse.json(payload, init)
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

export async function GET(request: NextRequest) {
  // Enforce: not accessible by client users (middleware already redirects clients away from non-dashboard pages,
  // but API routes must enforce this explicitly).
  const session = await auth0.getSession(request)
  const roles = getUserRoles(session?.user)
  if (roles.includes("client")) {
    return responseNoStore(
      { months: [], rows: [], meta: { error: "forbidden", reason: "client-role" } },
      { status: 403 }
    )
  }

  const monthsParam = request.nextUrl.searchParams.get("months") ?? ""
  const monthsRaw = monthsParam
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)

  const monthsNormalized = Array.from(
    new Set(
      monthsRaw
        .map((m) => {
          // Query param is expected to already be YYYY-MM, but normalize defensively anyway.
          const normalized = normalizeMonthKey(m)
          return normalized
        })
        .filter((m): m is string => typeof m === "string" && /^\d{4}-\d{2}$/.test(m))
    )
  )

  if (!monthsNormalized.length) {
    return responseNoStore(
      { months: [], rows: [], meta: { error: "bad_request", message: "months is required (YYYY-MM,YYYY-MM)" } },
      { status: 400 }
    )
  }

  try {
    const baseKeys = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
    const mastersUrl = xanoUrl("media_plan_master", baseKeys as unknown as string[])
    const versionsUrl = xanoUrl("media_plan_versions", baseKeys as unknown as string[])

    const [masters, versions] = await Promise.all([
      fetchXanoJson<any[]>(request, mastersUrl).catch(() => []),
      fetchXanoJson<any[]>(request, versionsUrl).catch(() => []),
    ])

    const mastersArray = Array.isArray(masters) ? (masters as XanoMaster[]) : []
    const versionsArray = Array.isArray(versions) ? (versions as XanoVersion[]) : []

    const chosen = pickLatestVersions(versionsArray, mastersArray)

    // Build a lookup of client_pays_for_media flags by deterministic line item id (matches deliverySchedule.lineItemId).
    // Non-fatal: failures here should not prevent accrual from loading.
    const clientPaysForMediaByLineItemId: Record<string, boolean> = {}
    try {
      for (const v of chosen) {
        const mbaNumber = safeString(v.mba_number)
        if (!mbaNumber) continue
        const versionNumber = extractVersionNumber(v) ?? 0
        const mediaPlanVersionId = parseNumericId(v.id)

        const results = await Promise.allSettled(
          XANO_LINE_ITEM_ENDPOINTS.map((endpoint) =>
            fetchVersionScopedLineItems({
              request,
              endpoint,
              mbaNumber,
              versionNumber,
              mediaPlanVersionId,
            })
          )
        )

        for (const r of results) {
          if (r.status !== "fulfilled") continue
          for (const item of r.value) {
            const lineItemId = normalizeKey(item?.line_item_id ?? item?.lineItemId ?? item?.id)
            if (!lineItemId) continue
            const flag = Boolean(item?.client_pays_for_media ?? item?.clientPaysForMedia)
            if (flag) clientPaysForMediaByLineItemId[lineItemId] = true
            else if (!(lineItemId in clientPaysForMediaByLineItemId)) clientPaysForMediaByLineItemId[lineItemId] = false
          }
        }
      }
    } catch {
      // ignore (non-fatal)
    }

    const clientPaysForMediaFlagsLoadedCount = Object.keys(clientPaysForMediaByLineItemId).length
    const clientPaysForMediaTrueCount = Object.values(clientPaysForMediaByLineItemId).filter(Boolean).length

    const rows = computeAccrualRows({
      months: monthsNormalized,
      versions: chosen.map((v) => ({
        clientName: v.mp_client_name || v.client_name || "Unknown",
        clientSlug: v.client_slug || v.slug || undefined,
        campaignName: v.campaign_name || v.mp_campaignname || "Unknown campaign",
        mbaNumber: v.mba_number || "unknown",
        versionNumber: extractVersionNumber(v) ?? 0,
        deliverySchedule: v.deliverySchedule ?? v.delivery_schedule ?? null,
        billingSchedule: v.billingSchedule ?? v.billing_schedule ?? null,
      })),
      clientPaysForMediaByLineItemId,
    })

    return responseNoStore({
      months: monthsNormalized,
      rows,
      meta: {
        monthsRequested: monthsRaw,
        monthsNormalized,
        mastersCount: mastersArray.length,
        versionsCount: versionsArray.length,
        chosenVersionsCount: chosen.length,
        clientPaysForMediaFlagsLoadedCount,
        clientPaysForMediaTrueCount,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return responseNoStore(
      { months: monthsNormalized, rows: [], meta: { error: "internal_error", message } },
      { status: 500 }
    )
  }
}

