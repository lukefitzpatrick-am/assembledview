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

