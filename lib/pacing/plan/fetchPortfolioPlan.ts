import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"
import { normalisePlan, type NormalisePlanInputs, type PlannedLineItem } from "@/lib/pacing/plan/normalisePlan"

/**
 * Xano `media_plan_*` tables loaded for portfolio SSR plan data.
 * Add an entry here to include another channel in the fetch + normalise path.
 */
export const PORTFOLIO_PLAN_LINE_ITEM_FETCH_SPECS = [
  { endpoint: "media_plan_social", normaliseKey: "mediaPlanSocial" },
  { endpoint: "media_plan_prog_display", normaliseKey: "mediaPlanProgrammaticDisplay" },
  { endpoint: "media_plan_prog_video", normaliseKey: "mediaPlanProgrammaticVideo" },
  { endpoint: "media_plan_search", normaliseKey: "mediaPlanSearch" },
] as const satisfies ReadonlyArray<{
  endpoint: string
  normaliseKey: keyof Omit<NormalisePlanInputs, "mediaPlanVersions">
}>

export type PortfolioPlanLineItemFetchSpec = (typeof PORTFOLIO_PLAN_LINE_ITEM_FETCH_SPECS)[number]
export type PortfolioPlanLineItemNormaliseKey = PortfolioPlanLineItemFetchSpec["normaliseKey"]

export type PortfolioPlanInput = {
  /** Client slugs from the saved pacing view; used to filter `media_plan_versions` before latest-per-MBA resolution. */
  clientSlugs: string[]
}

export type PortfolioPlanResult = {
  plannedLineItems: PlannedLineItem[]
}

function parseVersion(value: unknown): number {
  const n = typeof value === "string" ? parseInt(value, 10) : Number(value)
  return Number.isFinite(n) ? n : 0
}

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase()
}

function slugify(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase()
  if (!s) return ""
  return s
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

function filterByMbaAndVersion(
  items: unknown[],
  mbaNumber: string,
  versionNumber: number,
  mediaPlanVersionId?: number | null
) {
  if (!Array.isArray(items)) return []
  const normalizedMba = norm(mbaNumber)
  const versionStr = String(versionNumber)
  const versionIdStr =
    mediaPlanVersionId !== null && mediaPlanVersionId !== undefined ? String(mediaPlanVersionId) : null

  return items.filter((item: any) => {
    if (norm(item?.mba_number) !== normalizedMba) return false

    const mpPlanNumber = item?.mp_plannumber ?? item?.mp_plan_number ?? item?.mpPlanNumber
    const mediaPlanVersion = item?.media_plan_version
    const mediaPlanVersionIdField = item?.media_plan_version_id ?? item?.media_plan_versionID
    const versionNumberField = item?.version_number

    const hasVersionIdCandidate =
      (mediaPlanVersion !== null && mediaPlanVersion !== undefined && String(mediaPlanVersion).trim() !== "") ||
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

async function fetchLineItemsForCampaign(
  endpoint: string,
  mbaNumber: string,
  versionNumber: number,
  versionId?: number | null
) {
  const url = xanoUrl(endpoint, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  const attempts: Array<Record<string, string | number | boolean | null | undefined>> = [
    ...(versionId !== null && versionId !== undefined
      ? [{ mba_number: mbaNumber, media_plan_version: versionId }, { mba_number: mbaNumber, media_plan_version_id: versionId }]
      : []),
    { mba_number: mbaNumber, mp_plannumber: versionNumber },
    { mba_number: mbaNumber, version_number: versionNumber },
    { mba_number: mbaNumber, media_plan_version: versionNumber },
  ]

  let best: any[] = []
  let bestRawCount = Number.POSITIVE_INFINITY

  for (const params of attempts) {
    const raw = await fetchAllXanoPages(url, params, `PACING_${endpoint}`, 200, 20)
    const filtered = filterByMbaAndVersion(raw, mbaNumber, versionNumber, versionId)
    if (filtered.length > best.length || (filtered.length === best.length && raw.length < bestRawCount)) {
      best = filtered
      bestRawCount = raw.length
    }
    if (raw.length > 0 && raw.length === filtered.length) {
      break
    }
  }

  return best
}

/**
 * Loads latest `media_plan_versions` for the given client slugs, fetches line items from each
 * configured `media_plan_*` endpoint per campaign, and returns {@link PlannedLineItem}s.
 */
export async function fetchPortfolioPlan(
  input: PortfolioPlanInput,
  _opts?: { signal?: AbortSignal; requestId?: string }
): Promise<PortfolioPlanResult> {
  const clientSlugSet = new Set(input.clientSlugs.map((s) => String(s).trim()).filter(Boolean))
  if (!clientSlugSet.size) {
    return { plannedLineItems: [] }
  }

  const versionsUrl = xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  const allVersions = await fetchAllXanoPages(versionsUrl, {}, "PACING_VERSIONS", 200, 50)

  const latestByMba = new Map<string, any>()
  ;(allVersions ?? []).forEach((v: any) => {
    const mba = String(v?.mba_number ?? "").trim()
    if (!mba) return
    const clientName = v?.client_name ?? v?.mp_client_name ?? v?.mp_clientname
    const clientSlug = slugify(clientName)
    if (!clientSlug || !clientSlugSet.has(clientSlug)) return

    const current = latestByMba.get(mba)
    const nextVer = parseVersion(v?.version_number)
    const curVer = parseVersion(current?.version_number)
    if (!current || nextVer > curVer) {
      latestByMba.set(mba, v)
    }
  })

  const latestVersions = Array.from(latestByMba.values())

  const merged = Object.fromEntries(
    PORTFOLIO_PLAN_LINE_ITEM_FETCH_SPECS.map((s) => [s.normaliseKey, [] as any[]])
  ) as Record<PortfolioPlanLineItemNormaliseKey, any[]>

  const perCampaign = await Promise.all(
    latestVersions.map(async (v) => {
      const mbaNumber = String(v?.mba_number ?? "").trim()
      const versionNumber = parseVersion(v?.version_number)
      const versionId = v?.id !== undefined && v?.id !== null ? Number(v.id) : null
      if (!mbaNumber) {
        return Object.fromEntries(
          PORTFOLIO_PLAN_LINE_ITEM_FETCH_SPECS.map((s) => [s.normaliseKey, [] as any[]])
        ) as Record<PortfolioPlanLineItemNormaliseKey, any[]>
      }

      const vid = Number.isFinite(versionId as any) ? versionId : null
      const fetches = await Promise.all(
        PORTFOLIO_PLAN_LINE_ITEM_FETCH_SPECS.map((spec) =>
          fetchLineItemsForCampaign(spec.endpoint, mbaNumber, versionNumber, vid)
        )
      )

      return Object.fromEntries(
        PORTFOLIO_PLAN_LINE_ITEM_FETCH_SPECS.map((spec, i) => [spec.normaliseKey, fetches[i] ?? []])
      ) as Record<PortfolioPlanLineItemNormaliseKey, any[]>
    })
  )

  perCampaign.forEach((bucket) => {
    PORTFOLIO_PLAN_LINE_ITEM_FETCH_SPECS.forEach((spec) => {
      const rows = bucket[spec.normaliseKey]
      merged[spec.normaliseKey].push(...(Array.isArray(rows) ? rows : []))
    })
  })

  const planInputs: NormalisePlanInputs = {
    mediaPlanVersions: latestVersions,
    ...merged,
  }

  const plannedLineItems = normalisePlan(planInputs)

  return { plannedLineItems }
}
