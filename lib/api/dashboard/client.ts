import {
  ClientDashboardData,
  Campaign,
  Client,
  ClientHubSummary,
} from '@/lib/types/dashboard'
import { parseXanoListPayload } from '@/lib/api/xano'
import { resolveClientGroup, clientIdsFromGroup } from '@/lib/clients/clientGroup'
import { getClientDisplayName, slugifyClientNameForUrl } from '@/lib/clients/slug'
import { hasNonEmptyClientBrain, omitClientBrain } from '@/lib/clients/omitClientBrain'
import { findClientRawByDashboardSlug } from '@/lib/clients/xanoClientSlugMatch'
import { mbaJoinKey } from "@/lib/mediaplan/mbaNumber"
import { expectedSpendToDateFromDeliveryScheduleMonthly } from '@/lib/spend/monthlyPlanCalendar'
import { normalizeDateToMelbourneISO } from '@/lib/dates/normalizeCampaignDateISO'
import { parseDateNativeSafe } from '@/lib/dates/parseDateNativeSafe'
import { australianFyStartYearForDate } from '@/lib/finance/months'
import {
  campaignFlightOverlapsRange,
  currentAuFyRange,
  exactAuFyStartYear,
  fyMonthLabelFromDate,
  isoRangeToLocalDates,
  monthBucketsForRange,
  type ClientDashboardRange,
} from '@/lib/dashboard/clientDateRange'
import { auFyBoundsDateOnly } from '@/lib/dates/auFinancialYear'
import {
  isDashboardDebug,
  normalizeStatus,
  resolveDashboardLiveVersionRow,
  isBookedApprovedCompleted,
  hasBookedApprovedCompletedTag,
  slugifyClientName,
  getLast30DaysWindow,
  getAustralianFinancialYearWindow,
  parseMoney,
  parseMonthYear,
  getMonthYearValue,
  normalizeSchedule,
  computeSpendFromDelivery,
  normalizeDeliveryEntryMediaBreakdown,
} from './shared'

function scheduleEntryHasPositiveSpend(entry: any): boolean {
  if (Object.keys(normalizeDeliveryEntryMediaBreakdown(entry)).length > 0) return true
  const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
  if (mediaTypes.length > 0) return false
  return parseMoney(entry?.amount ?? entry?.total ?? entry?.budget) > 0
}

function collectAvailableFinancialYears(selectedVersions: any[]): number[] {
  const years = new Set<number>()
  years.add(australianFyStartYearForDate(new Date()))
  for (const version of selectedVersions) {
    const schedule =
      version?.deliverySchedule ||
      version?.delivery_schedule ||
      version?.billingSchedule ||
      version?.billing_schedule
    const normalized = normalizeSchedule(schedule)
    for (const entry of normalized) {
      if (!scheduleEntryHasPositiveSpend(entry)) continue
      const monthDate = parseMonthYear(getMonthYearValue(entry))
      if (!monthDate) continue
      years.add(australianFyStartYearForDate(monthDate))
    }
  }
  return Array.from(years).sort((a, b) => b - a)
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  try {
    const { readClientsList } = await import('@/lib/data/readClients')
    const result = await readClientsList()
    const clients = parseXanoListPayload(result.body)
    const raw = findClientRawByDashboardSlug(clients, slug) as Record<string, any> | null
    if (!raw) {
      if (isDashboardDebug()) {
        console.log('Client not found for slug:', slug)
      }
      return null
    }
    const client = rawClientToFallbackClient(raw)
    if (!client) return null
    return { ...client, slug }
  } catch (error: any) {
    const msg = error?.message != null ? String(error.message) : String(error)
    console.error('[dashboard] getClientBySlug catch:', { message: msg, slug, error })
    return null
  }
}

export type MediaPlanVersionListEntry = {
  versionNumber: number
  planDate?: string
  id?: number
  /** VC Stage 1 — threaded from MBA GET versions meta; unused by picker yet. */
  publishedAt?: string | null
  publishedBy?: string | null
}

/**
 * Maps the `versions` array from GET /api/mediaplans/mba/:mbaNumber (combined payload)
 * to the shape used by the campaign dashboard version switcher (newest first).
 * Avoids a second Xano request for unfiltered `media_plan_versions` on SSR.
 */
export function mapMbaCampaignResponseVersionsToListEntries(
  campaignPayload: Record<string, unknown> | null | undefined,
  fallback: { versionNumber: number; versionRecordId?: number | null },
): MediaPlanVersionListEntry[] {
  const raw = campaignPayload?.versions
  if (!Array.isArray(raw) || raw.length === 0) {
    const vn = fallback.versionNumber
    if (!Number.isFinite(vn) || vn <= 0) return []
    const entry: MediaPlanVersionListEntry = { versionNumber: vn }
    const rid = fallback.versionRecordId
    if (rid != null && Number.isFinite(rid)) {
      entry.id = Math.trunc(Number(rid))
    }
    return [entry]
  }

  const entries: MediaPlanVersionListEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const v = item as Record<string, unknown>
    const vn = Number(v.version_number ?? v.versionNumber)
    if (!Number.isFinite(vn) || vn <= 0) continue

    const planDate =
      typeof v.plan_date === "string" && v.plan_date.trim()
        ? v.plan_date.trim()
        : typeof v.created_at === "string" && v.created_at.trim()
          ? v.created_at.trim()
          : typeof v.updated_at === "string" && v.updated_at.trim()
            ? v.updated_at.trim()
            : typeof v.createdAt === "string" && v.createdAt.trim()
              ? v.createdAt.trim()
              : undefined

    const idRaw = v.id
    let id: number | undefined
    if (typeof idRaw === "number" && Number.isFinite(idRaw)) {
      id = idRaw
    } else if (typeof idRaw === "string" && idRaw.trim()) {
      const p = parseInt(idRaw, 10)
      if (Number.isFinite(p)) id = p
    }

    entries.push({
      versionNumber: vn,
      planDate,
      id,
      publishedAt:
        v.published_at != null
          ? String(v.published_at)
          : v.publishedAt != null
            ? String(v.publishedAt)
            : null,
      publishedBy:
        v.published_by != null
          ? String(v.published_by)
          : v.publishedBy != null
            ? String(v.publishedBy)
            : null,
    })
  }

  entries.sort((a, b) => b.versionNumber - a.versionNumber)
  return entries
}

/** All versions for one MBA from Postgres (newest first). */
export async function fetchVersionsForMba(mbaNumber: string): Promise<MediaPlanVersionListEntry[]> {
  const { loadDashboardVersionsForMba } = await import('@/lib/api/dashboard/planRows')
  const all = await loadDashboardVersionsForMba(String(mbaNumber).trim())
  const normalisedMba = String(mbaNumber).trim()
  const out: MediaPlanVersionListEntry[] = []
  for (const raw of all) {
    const v = raw as Record<string, unknown>
    const candidate = String(v.mba_number ?? "").trim()
    if (candidate !== normalisedMba) continue
    const versionNumber = Number(v.version_number ?? v.versionNumber)
    if (!Number.isFinite(versionNumber) || versionNumber <= 0) continue
    const createdAt =
      typeof v.created_at === "number" && Number.isFinite(v.created_at)
        ? new Date(v.created_at).toISOString()
        : typeof v.created_at === "string"
          ? v.created_at.trim()
          : ""
    const planDate =
      typeof v.plan_date === "string" && v.plan_date.trim()
        ? v.plan_date.trim()
        : createdAt ||
          (typeof v.updated_at === "string" && v.updated_at.trim()
            ? v.updated_at.trim()
            : undefined)
    const idRaw = v.id
    const id =
      typeof idRaw === "number"
        ? idRaw
        : typeof idRaw === "string" && Number.isFinite(Number(idRaw))
          ? Number(idRaw)
          : undefined
    out.push({
      versionNumber,
      planDate,
      id,
      publishedAt:
        v.published_at != null
          ? String(v.published_at)
          : v.publishedAt != null
            ? String(v.publishedAt)
            : null,
      publishedBy:
        v.published_by != null
          ? String(v.published_by)
          : v.publishedBy != null
            ? String(v.publishedBy)
            : null,
    })
  }
  return out.sort((a, b) => b.versionNumber - a.versionNumber)
}

function buildYtdCountBySlugFromMaster(
  masterPlans: any[],
  fyWindow: ReturnType<typeof getAustralianFinancialYearWindow>
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const plan of masterPlans) {
    const nameCandidates = [
      plan?.mp_client_name,
      plan?.client_name,
      plan?.mp_clientname,
      plan?.client,
    ].filter((n: any) => typeof n === 'string' && n.trim().length > 0)

    if (nameCandidates.length === 0) continue

    const statusFromFields = plan?.campaign_status ?? plan?.status ?? plan?.mp_campaignstatus
    const statusMatches =
      isBookedApprovedCompleted(statusFromFields) ||
      hasBookedApprovedCompletedTag(
        plan?.tags ??
          plan?.tag ??
          plan?.campaign_tags ??
          plan?.campaignTags ??
          plan?.campaign_status ??
          plan?.status ??
          plan?.mp_campaignstatus
      )
    if (!statusMatches) continue

    const startDate =
      parseDateNativeSafe(
        plan?.campaign_start_date ??
          plan?.mp_campaigndates_start ??
          plan?.campaign_start ??
          plan?.start_date ??
          plan?.startDate
      ) ?? null
    const endDate =
      parseDateNativeSafe(
        plan?.campaign_end_date ??
          plan?.mp_campaigndates_end ??
          plan?.campaign_end ??
          plan?.end_date ??
          plan?.endDate
      ) ?? null

    if (!startDate || !endDate) continue
    if (!(startDate <= fyWindow.end && endDate >= fyWindow.start)) continue

    const primarySlug = slugifyClientName(nameCandidates[0])
    if (!primarySlug) continue
    counts[primarySlug] = (counts[primarySlug] || 0) + 1
  }
  return counts
}

function rawClientToFallbackClient(raw: any): Client | null {
  const name = getClientDisplayName(raw)
  if (!name) return null
  const slug = String(raw.slug || slugifyClientNameForUrl(name)).trim()
  const brandColour =
    typeof raw.brand_colour === 'string' && raw.brand_colour.trim()
      ? raw.brand_colour.trim()
      : typeof raw.brandColour === 'string' && raw.brandColour.trim()
        ? raw.brandColour.trim()
        : undefined
  return {
    id: String(raw.id ?? ''),
    name,
    slug,
    createdAt: raw.created_at || new Date().toISOString(),
    updatedAt: raw.updated_at || new Date().toISOString(),
    brandColour,
  }
}

/** When `media_plan_versions` cannot be loaded but the client row is known — empty campaigns / zero spend. */
function emptyDashboardForKnownClient(
  fallbackClient: Client,
  totalCampaignsYTDFromMaster: number | null,
  range: ClientDashboardRange,
): ClientDashboardData {
  const fyYear = exactAuFyStartYear(range) ?? australianFyStartYearForDate(new Date())
  const buckets = monthBucketsForRange(range)
  return {
    clientName: fallbackClient.name,
    brandColour: fallbackClient.brandColour,
    liveCampaigns: 0,
    totalCampaignsYTD: totalCampaignsYTDFromMaster ?? 0,
    spendPast30Days: 0,
    totalSpend: 0,
    allCampaigns: [],
    liveCampaignsList: [],
    planningCampaignsList: [],
    completedCampaignsList: [],
    spendByMediaType: [],
    spendByCampaign: [],
    monthlySpend: buckets.map((b) => ({ month: b.label, data: [] })),
    monthlySpendByCampaign: buckets.map((b) => ({ month: b.label, data: [] })),
    availableFinancialYears: [fyYear],
    selectedFinancialYear: fyYear,
  }
}

function parseDashboardClientId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return Math.trunc(n)
  }
  return null
}

export function buildClientDashboardDataFromVersions(
  targetSlugs: Set<string>,
  allVersions: any[],
  ctx: {
    fallbackClient: Client | null
    totalCampaignsYTDFromMaster: number | null
    urlSlug: string
    /** Published watermark per MBA — staged-but-unpublished rows must not win. */
    publishedByMba?: Map<string, number>
    /** Master `published_version_id` when the field was on the master payload. */
    publishedVersionIdByMba?: Map<string, number | null>
    financialYearStartYear?: number
    rangeStartISO?: string
    rangeEndISO?: string
    /** When set, prefer versions whose `client_id` matches the requested row. */
    targetClientId?: number | null
  }
): ClientDashboardData | null {
  const { fallbackClient, totalCampaignsYTDFromMaster, urlSlug, publishedByMba, publishedVersionIdByMba, financialYearStartYear } = ctx

  const range: ClientDashboardRange =
    ctx.rangeStartISO && ctx.rangeEndISO
      ? { rangeStartISO: ctx.rangeStartISO, rangeEndISO: ctx.rangeEndISO }
      : financialYearStartYear != null
        ? {
            rangeStartISO: auFyBoundsDateOnly(financialYearStartYear).start,
            rangeEndISO: auFyBoundsDateOnly(financialYearStartYear).end,
          }
        : currentAuFyRange()
  const rangeDates = isoRangeToLocalDates(range)
  const fyStart = rangeDates.start
  const fyEnd = rangeDates.end
  const fyExactYear = exactAuFyStartYear(range)
  const fyStartYear = fyExactYear ?? financialYearStartYear ?? australianFyStartYearForDate(new Date())
  const monthBuckets = monthBucketsForRange(range)

  const clientVersions = allVersions.filter((version: any) => {
    const targetId = ctx.targetClientId
    if (targetId != null && targetId > 0) {
      const versionId = parseDashboardClientId(version?.client_id)
      if (versionId != null) return versionId === targetId
    }

    const nameCandidates = [
      version?.mp_client_name,
      version?.client_name,
      version?.mp_clientname,
      version?.client,
    ].filter((n: any) => typeof n === 'string' && n.trim().length > 0)

    if (nameCandidates.length === 0) return false

    return nameCandidates.some((name: string) => targetSlugs.has(slugifyClientName(name)))
  })

  if (clientVersions.length === 0) {
    console.warn('No media_plan_versions found for slug:', urlSlug)

    if (fallbackClient) {
      return emptyDashboardForKnownClient(fallbackClient, totalCampaignsYTDFromMaster, range)
    }

    return null
  }

  // Branding from the anchor-backed fallbackClient — do not take from an arbitrary version row.
  const clientName =
    fallbackClient?.name ||
    clientVersions[0].mp_client_name ||
    clientVersions[0].client_name ||
    clientVersions[0].mp_clientname ||
    urlSlug
  const brandColour =
    fallbackClient?.brandColour ||
    clientVersions[0].brand_colour ||
    clientVersions[0].brandColour

  console.log('Dashboard: using client from media_plan_versions', {
    clientName,
    slugs: [...targetSlugs],
    versions: clientVersions.length,
  })

    // VC1-5: tip = master tip / published_at (never campaign_status). Commercial filter is separate below.
    const versionsByMBA = clientVersions.reduce((acc: Record<string, any[]>, version: any) => {
      const key = mbaJoinKey(version.mba_number)
      if (!key) return acc
      acc[key] = acc[key] || []
      acc[key].push(version)
      return acc
    }, {} as Record<string, any[]>)

    const selectedVersionByMBA: Record<string, any> = {}

    Object.entries(versionsByMBA).forEach(([mbaKey, versions]: [string, any[]]) => {
      if (publishedVersionIdByMba?.has(mbaKey) && publishedVersionIdByMba.get(mbaKey) == null) {
        return
      }
      const published = publishedByMba?.get(mbaKey)
      const chosenVersion = resolveDashboardLiveVersionRow(versions, published)
      if (chosenVersion) {
        selectedVersionByMBA[mbaKey] = chosenVersion
      }
    })
    
    const selectedVersionPerMBA = Object.values(selectedVersionByMBA)
    const availableFinancialYears = collectAvailableFinancialYears(selectedVersionPerMBA)

    const clientCampaigns: Campaign[] = selectedVersionPerMBA.map((version: any) => {
      const mediaTypes: string[] = []
      
      // Extract media types from boolean flags
      if (version.mp_television) mediaTypes.push('Television')
      if (version.mp_radio) mediaTypes.push('Radio')
      if (version.mp_newspaper) mediaTypes.push('Newspaper')
      if (version.mp_magazines) mediaTypes.push('Magazines')
      if (version.mp_ooh) mediaTypes.push('OOH')
      if (version.mp_cinema) mediaTypes.push('Cinema')
      if (version.mp_digidisplay) mediaTypes.push('Digital Display')
      if (version.mp_digiaudio) mediaTypes.push('Digital Audio')
      if (version.mp_digivideo) mediaTypes.push('Digital Video')
      if (version.mp_bvod) mediaTypes.push('BVOD')
      if (version.mp_integration) mediaTypes.push('Integration')
      if (version.mp_search) mediaTypes.push('Search')
      if (version.mp_socialmedia) mediaTypes.push('Social Media')
      if (version.mp_progdisplay) mediaTypes.push('Programmatic Display')
      if (version.mp_progvideo) mediaTypes.push('Programmatic Video')
      if (version.mp_progbvod) mediaTypes.push('Programmatic BVOD')
      if (version.mp_progaudio) mediaTypes.push('Programmatic Audio')
      if (version.mp_progooh) mediaTypes.push('Programmatic OOH')
      if (version.mp_influencers) mediaTypes.push('Influencers')

      const vn = Number(version.version_number)
      const mbaKey = mbaJoinKey(version.mba_number)
      const hasPublishedVersion =
        mbaKey != null && publishedVersionIdByMba?.has(mbaKey)
          ? publishedVersionIdByMba.get(mbaKey) != null
          : undefined
      let billingSchedule: any[] = []
      try {
        const raw = version.billingSchedule ?? version.billing_schedule
        if (typeof raw === 'string') {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) billingSchedule = parsed
        } else if (Array.isArray(raw)) {
          billingSchedule = raw
        }
      } catch {
        billingSchedule = []
      }
      const startDate =
        version.campaign_start_date || version.mp_campaigndates_start || ''
      const endDate = version.campaign_end_date || version.mp_campaigndates_end || ''
      const rawDeliveryForExpected =
        version.deliverySchedule ?? version.delivery_schedule ?? null
      const campaignStartISO = normalizeDateToMelbourneISO(startDate)
      const campaignEndISO = normalizeDateToMelbourneISO(endDate)
      const expectedSpendToDate =
        campaignStartISO && campaignEndISO
          ? expectedSpendToDateFromDeliveryScheduleMonthly(rawDeliveryForExpected, {
              campaignStartISO,
              campaignEndISO,
              basis: "media",
            })
          : 0

      return {
        mbaNumber: String(version.mba_number ?? "").trim(),
        campaignName: version.campaign_name || '',
        versionNumber: `v${version.version_number || 1}`,
        version_number: Number.isFinite(vn) && vn > 0 ? vn : 1,
        budget: parseFloat(version.mp_campaignbudget) || 0,
        startDate,
        endDate,
        mediaTypes,
        planClientName:
          String(
            version.mp_client_name ?? version.client_name ?? version.mp_clientname ?? "",
          ).trim() || undefined,
        status: normalizeStatus(version.campaign_status) as Campaign['status'],
        expectedSpendToDate: expectedSpendToDate > 0 ? expectedSpendToDate : undefined,
        ...(hasPublishedVersion !== undefined ? { hasPublishedVersion } : {}),
      }
    })

    const currentDate = new Date()
    const last30dWindow = getLast30DaysWindow()

    const overlappingCampaigns = clientCampaigns.filter((campaign) =>
      campaignFlightOverlapsRange(
        campaign.startDate,
        campaign.endDate,
        range.rangeStartISO,
        range.rangeEndISO,
      ),
    )

    const liveCampaigns = overlappingCampaigns.filter(campaign => {
      const status = normalizeStatus(campaign.status)
      return (status === 'approved' || status === 'booked') &&
        new Date(campaign.startDate) <= currentDate && 
        new Date(campaign.endDate) >= currentDate
    })

    const totalCampaignsYTD = totalCampaignsYTDFromMaster ?? 0

    const liveCampaignsList = overlappingCampaigns.filter(campaign => {
      const status = normalizeStatus(campaign.status)
      return (status === 'approved' || status === 'booked') &&
        new Date(campaign.startDate) <= currentDate && 
        new Date(campaign.endDate) >= currentDate
    })

    const planningCampaignsList = overlappingCampaigns.filter((campaign) => {
      const end = new Date(campaign.endDate)
      if (!Number.isNaN(end.getTime()) && end < currentDate) return false
      const status = normalizeStatus(campaign.status)
      return status === 'planning' || status === 'draft' || new Date(campaign.startDate) > currentDate
    })

    const completedCampaignsList = overlappingCampaigns.filter((campaign) => new Date(campaign.endDate) < currentDate)

    // Filter to only booked/approved/completed campaigns for spend analytics
    const bookedApprovedCampaigns = clientCampaigns.filter(campaign =>
      isBookedApprovedCompleted(campaign.status)
    )

    // Delivery / billing schedules from the same highest-version row per MBA (aligned with campaign cards).
    // Same isBookedApprovedCompleted filter the charts use below, so a cancelled campaign can't
    // feed totalSpend/spendPast30Days while being excluded from spendByMediaType/spendByCampaign.
    const deliveryScheduleByMBA: Record<string, any[]> = {}
    Object.entries(selectedVersionByMBA).forEach(([mbaKey, version]: [string, any]) => {
      if (!isBookedApprovedCompleted(version?.campaign_status)) return
      const schedule =
        version?.deliverySchedule ||
        version?.delivery_schedule ||
        version?.billingSchedule ||
        version?.billing_schedule
      const normalized = normalizeSchedule(schedule)
      if (normalized.length > 0) {
        deliveryScheduleByMBA[mbaKey] = normalized
      }
    })

    // Build delivery spend breakdowns
    const deliveryMediaTypeSpend: Record<string, number> = {}
    const deliveryCampaignSpend: Record<string, number> = {}
    const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
    const deliveryMonthlyCampaignMap: Record<string, Record<string, number>> = {}
    monthBuckets.forEach((bucket) => {
      deliveryMonthlyMap[bucket.label] = {}
      deliveryMonthlyCampaignMap[bucket.label] = {}
    })
    const monthLabelFromDate = (date: Date): string | null => {
      if (fyExactYear != null) return fyMonthLabelFromDate(date)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      return monthBuckets.find((b) => b.key === key)?.label ?? null
    }
    const monthOverlapsRange = (monthDate: Date): boolean => {
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999)
      return monthEnd >= fyStart && monthStart <= fyEnd
    }

    bookedApprovedCampaigns.forEach((campaign) => {
      const mbaKey = mbaJoinKey(campaign.mbaNumber)
      const schedule = mbaKey ? deliveryScheduleByMBA[mbaKey] : undefined
      if (!schedule || !Array.isArray(schedule)) return

      schedule.forEach(entry => {
        const monthDate = parseMonthYear(getMonthYearValue(entry))
        if (!monthDate || !monthOverlapsRange(monthDate)) return
        const monthLabel = monthLabelFromDate(monthDate)
        if (!monthLabel) return
        const campaignKey = campaign.campaignName || campaign.mbaNumber || 'Campaign'

        // Handles BOTH deliverySchedule shapes: 'types' (mediaTypes[].lineItems) and
        // 'costs' (mediaCosts{channelKey}) — mapped onto the same media-type labels.
        const mediaBreakdown = normalizeDeliveryEntryMediaBreakdown(entry)

        // Legacy shape: no mediaTypes[] and no mediaCosts{} — record the whole entry as unspecified.
        if (Object.keys(mediaBreakdown).length === 0) {
          const amount = parseMoney(entry?.amount ?? entry?.total ?? entry?.budget)
          if (amount > 0) {
            deliveryMediaTypeSpend['Unspecified'] = (deliveryMediaTypeSpend['Unspecified'] || 0) + amount
            deliveryCampaignSpend[campaignKey] = (deliveryCampaignSpend[campaignKey] || 0) + amount
            deliveryMonthlyMap[monthLabel]['Unspecified'] = (deliveryMonthlyMap[monthLabel]['Unspecified'] || 0) + amount
            deliveryMonthlyCampaignMap[monthLabel][campaignKey] =
              (deliveryMonthlyCampaignMap[monthLabel][campaignKey] || 0) + amount
          }
          return
        }

        Object.entries(mediaBreakdown).forEach(([mediaTypeLabel, totalForType]) => {
          deliveryMediaTypeSpend[mediaTypeLabel] = (deliveryMediaTypeSpend[mediaTypeLabel] || 0) + totalForType
          deliveryCampaignSpend[campaignKey] = (deliveryCampaignSpend[campaignKey] || 0) + totalForType
          deliveryMonthlyMap[monthLabel][mediaTypeLabel] = (deliveryMonthlyMap[monthLabel][mediaTypeLabel] || 0) + totalForType
          deliveryMonthlyCampaignMap[monthLabel][campaignKey] =
            (deliveryMonthlyCampaignMap[monthLabel][campaignKey] || 0) + totalForType
        })
      })
    })

    // Calculate spend windows from delivery schedules (booked/approved/completed campaigns only)
    const windows = { last30d: last30dWindow, fy: { start: fyStart, end: fyEnd } }
    const spendTotals = Object.entries(deliveryScheduleByMBA).reduce(
      (acc, [_, schedule]) => {
        const totals = computeSpendFromDelivery(schedule, windows)
        acc.last30d += totals.last30d
        acc.fy += totals.fy
        return acc
      },
      { last30d: 0, fy: 0 },
    )

    const spendPast30Days = spendTotals.last30d
    const totalSpend = spendTotals.fy

    const deliveryTotal = Object.values(deliveryMediaTypeSpend).reduce((sum, n) => sum + n, 0)

    let spendByMediaType: Array<{
      mediaType: string
      amount: number
      percentage: number
    }> = Object.entries(deliveryMediaTypeSpend)
      .map(([mediaType, amount]) => ({
        mediaType,
        amount,
        percentage: deliveryTotal > 0 ? (amount / deliveryTotal) * 100 : 0
      }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount)

    let spendByCampaign: Array<{
      campaignName: string
      mbaNumber: string
      amount: number
      percentage: number
    }> = (() => {
      const totalSpend = Object.values(deliveryCampaignSpend).reduce((sum, n) => sum + n, 0)
      return Object.entries(deliveryCampaignSpend)
        .map(([campaignName, amount]) => ({
        campaignName,
          mbaNumber: bookedApprovedCampaigns.find(c => c.campaignName === campaignName || c.mbaNumber === campaignName)?.mbaNumber || '',
        amount,
        percentage: totalSpend > 0 ? (amount / totalSpend) * 100 : 0
      }))
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount)
    })()
    
    let monthlySpend: Array<{
      month: string
      data: Array<{
        mediaType: string
        amount: number
      }>
    }> = monthBuckets.map((bucket) => ({
      month: bucket.label,
      data: Object.entries(deliveryMonthlyMap[bucket.label] || {})
        .map(([mediaType, amount]) => ({ mediaType, amount }))
        .filter(item => item.amount > 0)
    }))

    let monthlySpendByCampaign: Array<{
      month: string
      data: Array<{
        campaignName: string
        amount: number
      }>
    }> = monthBuckets.map((bucket) => ({
      month: bucket.label,
      data: Object.entries(deliveryMonthlyCampaignMap[bucket.label] || {})
        .map(([campaignName, amount]) => ({ campaignName, amount }))
        .filter(item => item.amount > 0)
    }))

    // Ensure charts only show booked media types/campaigns with spend in the FY
    spendByMediaType = spendByMediaType.filter(item => item.amount > 0)
    spendByCampaign = spendByCampaign.filter(item => item.amount > 0)
    monthlySpend = monthlySpend.map(month => ({
      month: month.month,
      data: (month.data || []).filter(item => item.amount > 0)
    }))
    monthlySpendByCampaign = monthlySpendByCampaign.map(month => ({
      month: month.month,
      data: (month.data || []).filter(item => item.amount > 0)
    }))

    const result = {
      clientName,
      brandColour,
      liveCampaigns: liveCampaigns.length,
      totalCampaignsYTD,
      spendPast30Days,
      totalSpend,
      allCampaigns: overlappingCampaigns,
      liveCampaignsList,
      planningCampaignsList,
      completedCampaignsList,
      spendByMediaType,
      spendByCampaign,
      monthlySpend,
      monthlySpendByCampaign,
      availableFinancialYears,
      selectedFinancialYear: fyStartYear,
    }

    console.log('Dashboard data built for client:', clientName, {
      slugs: [...targetSlugs],
      campaigns: clientCampaigns.length,
      bookedApproved: bookedApprovedCampaigns.length,
      spendByMediaType: spendByMediaType.length,
      spendByCampaign: spendByCampaign.length,
      months: monthlySpend.length
    })

    return result
}

function sumYtdAcrossSlugs(
  ytdMap: Record<string, number>,
  targetSlugs: Set<string>,
): number | null {
  let sum = 0
  let any = false
  for (const s of targetSlugs) {
    if (Object.prototype.hasOwnProperty.call(ytdMap, s)) {
      sum += ytdMap[s]!
      any = true
    }
  }
  return any ? sum : null
}

export async function getClientDashboardData(
  slug: string,
  options?: {
    financialYearStartYear?: number
    rangeStartISO?: string
    rangeEndISO?: string
    /** Tenant dashboards are per-row. Admin hub (`/client/[slug]`) passes `"group"`. */
    campaignScope?: "row" | "group"
  },
): Promise<ClientDashboardData | null> {
  console.log('[dashboard] getClientDashboardData called with slug:', slug)
  if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
    console.error('Invalid slug provided for dashboard:', slug)
    return null
  }

  const sanitizedSlug = slug.trim()
  const fyWindow = getAustralianFinancialYearWindow(new Date())
  const campaignScope = options?.campaignScope ?? "row"

  try {
    let targetSlugs = new Set([slugifyClientName(sanitizedSlug)].filter(Boolean))
    let fallbackClient: Client | null = null
    let targetClientId: number | null = null
    let clientIds = new Set<number>()

    try {
      const { readClientsList } = await import('@/lib/data/readClients')
      const result = await readClientsList()
      const clientRows = parseXanoListPayload(result.body)
      const group = resolveClientGroup(clientRows, sanitizedSlug)
      if (group) {
        fallbackClient = rawClientToFallbackClient(group.anchor)
        if (campaignScope === "group") {
          targetSlugs = group.nameSlugs.size > 0 ? group.nameSlugs : targetSlugs
          targetClientId = null
          clientIds = clientIdsFromGroup(group)
        } else {
          const rowName = getClientDisplayName(group.anchor)
          const rowSlug = slugifyClientName(rowName)
          targetSlugs = rowSlug ? new Set([rowSlug]) : targetSlugs
          const id = Number(group.anchor.id)
          targetClientId =
            Number.isFinite(id) && id > 0 ? Math.trunc(id) : null
          if (targetClientId != null) clientIds = new Set([targetClientId])
        }
      } else {
        fallbackClient = await getClientBySlug(slugifyClientName(sanitizedSlug))
        const id = Number(fallbackClient?.id)
        if (Number.isFinite(id) && id > 0) {
          targetClientId = Math.trunc(id)
          clientIds = new Set([targetClientId])
        }
      }
    } catch (err) {
      console.warn('Dashboard: skipping client group/fallback lookup due to error', err)
      try {
        fallbackClient = await getClientBySlug(slugifyClientName(sanitizedSlug))
        const id = Number(fallbackClient?.id)
        if (Number.isFinite(id) && id > 0) {
          targetClientId = Math.trunc(id)
          clientIds = new Set([targetClientId])
        }
      } catch {
        fallbackClient = null
      }
    }

    let totalCampaignsYTDFromMaster: number | null = null
    let publishedByMba = new Map<string, number>()
    let publishedVersionIdByMba = new Map<string, number | null>()
    let allVersions: any[] = []

    try {
      const { loadClientDashboardPlanRows, publishedCutByMba } = await import(
        '@/lib/api/dashboard/planRows'
      )
      const { masters, versions } = await loadClientDashboardPlanRows(clientIds)
      const ytdMap = buildYtdCountBySlugFromMaster(masters, fyWindow)
      totalCampaignsYTDFromMaster = sumYtdAcrossSlugs(ytdMap, targetSlugs)
      const cut = publishedCutByMba(masters, versions)
      publishedByMba = cut.publishedByMba
      publishedVersionIdByMba = cut.publishedVersionIdByMba
      allVersions = versions
    } catch (versionsError) {
      console.warn('Dashboard: media_plan_versions fetch failed; using partial dashboard if client is known', versionsError)
      if (fallbackClient) {
        return emptyDashboardForKnownClient(
          fallbackClient,
          totalCampaignsYTDFromMaster,
          options?.rangeStartISO && options?.rangeEndISO
            ? { rangeStartISO: options.rangeStartISO, rangeEndISO: options.rangeEndISO }
            : options?.financialYearStartYear != null
              ? {
                  rangeStartISO: auFyBoundsDateOnly(options.financialYearStartYear).start,
                  rangeEndISO: auFyBoundsDateOnly(options.financialYearStartYear).end,
                }
              : currentAuFyRange(),
        )
      }
      return null
    }

    return buildClientDashboardDataFromVersions(targetSlugs, allVersions, {
      fallbackClient,
      totalCampaignsYTDFromMaster,
      urlSlug: sanitizedSlug,
      publishedByMba,
      publishedVersionIdByMba,
      financialYearStartYear: options?.financialYearStartYear,
      rangeStartISO: options?.rangeStartISO,
      rangeEndISO: options?.rangeEndISO,
      targetClientId,
    })
  } catch (error: any) {
    const msg = error?.message != null ? String(error.message) : String(error)
    console.error('[dashboard] getClientDashboardData outer catch:', {
      message: msg,
      failedUrl: error?.config?.url ?? '(unknown — see preceding [dashboard] Attempting fetch logs)',
      err: error,
    })
    return null
  }
}

export async function getClientHubSummaries(rawClients: any[]): Promise<ClientHubSummary[]> {
  if (!Array.isArray(rawClients) || rawClients.length === 0) return []

  const fyWindow = getAustralianFinancialYearWindow(new Date())
  let allVersions: any[] = []
  let masterPlans: any[] = []
  let publishedByMba = new Map<string, number>()
  let publishedVersionIdByMba = new Map<string, number | null>()
  try {
    const { loadPublishedDashboardPlanRows, publishedCutByMba } = await import(
      '@/lib/api/dashboard/planRows'
    )
    const loaded = await loadPublishedDashboardPlanRows()
    allVersions = loaded.versions
    masterPlans = loaded.masters
    const cut = publishedCutByMba(masterPlans, allVersions)
    publishedByMba = cut.publishedByMba
    publishedVersionIdByMba = cut.publishedVersionIdByMba
  } catch (err) {
    console.warn('getClientHubSummaries: media plan rows failed; continuing with empty versions', err)
  }
  const ytdMap = buildYtdCountBySlugFromMaster(masterPlans, fyWindow)

  const summaries: ClientHubSummary[] = []
  for (const raw of rawClients) {
    const fallback = rawClientToFallbackClient(raw)
    if (!fallback) continue

    const slugUrl = String(raw.slug || slugifyClientNameForUrl(fallback.name)).trim()
    if (!slugUrl) continue

    const targetSlug = slugifyClientName(slugUrl)
    const totalCampaignsYTDFromMaster = Object.prototype.hasOwnProperty.call(ytdMap, targetSlug)
      ? ytdMap[targetSlug]!
      : null

    // Hub stays on single-slug path (grouped dashboard is getClientDashboardData only).
    const dashboard = buildClientDashboardDataFromVersions(new Set([targetSlug]), allVersions, {
      fallbackClient: fallback,
      totalCampaignsYTDFromMaster,
      urlSlug: slugUrl,
      publishedByMba,
      publishedVersionIdByMba,
    })
    if (!dashboard) continue

    const idNum = Number(raw.id)
    const fromRaw =
      typeof raw.brand_colour === 'string' && raw.brand_colour.trim()
        ? raw.brand_colour.trim()
        : typeof raw.brandColour === 'string' && raw.brandColour.trim()
          ? raw.brandColour.trim()
          : undefined
    summaries.push({
      id: Number.isFinite(idNum) ? idNum : 0,
      slug: slugUrl,
      clientName: dashboard.clientName,
      liveCampaigns: dashboard.liveCampaigns,
      totalSpend: dashboard.totalSpend,
      brandColour: dashboard.brandColour || fromRaw,
      hasClientBrain:
        typeof raw.has_client_brain === 'boolean'
          ? raw.has_client_brain
          : hasNonEmptyClientBrain(raw),
    })
  }

  summaries.sort((a, b) => a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' }))
  return summaries
}

async function fetchClientsWithSlugsForHub(): Promise<any[]> {
  const { readClientsList } = await import('@/lib/data/readClients')
  const result = await readClientsList()
  const rows = parseXanoListPayload(result.body)
  return rows.map((raw: any) => {
    const stripped = omitClientBrain(
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {},
    )
    return {
      ...stripped,
      slug: raw?.slug || slugifyClientNameForUrl(getClientDisplayName(raw)),
    }
  })
}

/** Loads clients from Postgres and builds hub cards in one pass. */
export async function getClientHubSummariesForAdminHub(): Promise<ClientHubSummary[]> {
  try {
    const rows = await fetchClientsWithSlugsForHub()
    return await getClientHubSummaries(rows)
  } catch (e: any) {
    const msg = e?.message != null ? String(e.message) : String(e)
    console.error('[dashboard] getClientHubSummariesForAdminHub catch:', {
      message: msg,
      failedUrl: e?.config?.url ?? '(unknown)',
      err: e,
    })
    throw e
  }
}

export async function exportDashboardData(slug: string, format: 'csv' | 'json' = 'csv'): Promise<string> {
  const data = await getClientDashboardData(slug)
  if (!data) throw new Error('Client not found')

  if (format === 'json') {
    return JSON.stringify(data, null, 2)
  }

  // Generate CSV
  const csvRows: string[] = []
  
  // Add header
  csvRows.push('Metric,Value')
  csvRows.push(`Live Campaigns,${data.liveCampaigns}`)
  csvRows.push(`Total Campaigns YTD,${data.totalCampaignsYTD}`)
  csvRows.push(`Spend Past 30 Days,${data.spendPast30Days}`)
  csvRows.push(`Total Spend (Current FY),${data.totalSpend}`)
  
  // Add campaigns data
  csvRows.push('')
  csvRows.push('Campaigns')
  csvRows.push('MBA Number,Campaign Name,Status,Budget,Start Date,End Date,Media Types')
  
  const allCampaigns = [...data.liveCampaignsList, ...data.planningCampaignsList, ...data.completedCampaignsList]
  allCampaigns.forEach(campaign => {
    csvRows.push(`${campaign.mbaNumber},${campaign.campaignName},${campaign.status},${campaign.budget},${campaign.startDate},${campaign.endDate},"${campaign.mediaTypes.join('; ')}"`)
  })

  return csvRows.join('\n')
}

// Helper functions for async chart loading
export async function getSpendByMediaTypeData(slug: string): Promise<Array<{
  mediaType: string
  amount: number
  percentage: number
}>> {
  const dashboardData = await getClientDashboardData(slug)
  return dashboardData?.spendByMediaType || []
}

export async function getSpendByCampaignData(slug: string): Promise<Array<{
  campaignName: string
  mbaNumber: string
  amount: number
  percentage: number
}>> {
  const dashboardData = await getClientDashboardData(slug)
  return dashboardData?.spendByCampaign || []
}

export async function getMonthlySpendData(slug: string): Promise<Array<{
  month: string
  data: Array<{
    mediaType: string
    amount: number
  }>
}>> {
  const dashboardData = await getClientDashboardData(slug)
  return dashboardData?.monthlySpend || []
}
