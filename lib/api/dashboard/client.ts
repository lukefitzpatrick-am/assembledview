import {
  ClientDashboardData,
  Campaign,
  Client,
  ClientHubSummary,
} from '@/lib/types/dashboard'
import { 
  aggregateMonthlySpendByMediaType, 
  getSpendByMediaTypeFromLineItems, 
  getSpendByCampaignFromLineItems 
} from '../media-containers'
import { parseXanoListPayload } from '@/lib/api/xano'
import { getXanoClientsCollectionUrl, xanoMediaPlansUrl } from '@/lib/api/xanoClients'
import { getClientDisplayName, slugifyClientNameForUrl } from '@/lib/clients/slug'
import { findClientRawByDashboardSlug } from '@/lib/clients/xanoClientSlugMatch'
import { expectedSpendToDateFromDeliveryScheduleMonthly } from '@/lib/spend/monthlyPlanCalendar'
import { normalizeDateToMelbourneISO } from '@/lib/dates/normalizeCampaignDateISO'
import {
  apiClient,
  isDashboardDebug,
  normalizeStatus,
  normalizeMbaKey,
  pickHighestVersionRow,
  isBookedApprovedCompleted,
  hasBookedApprovedCompletedTag,
  slugifyClientName,
  parseDateSafe,
  getAustralianFinancialYear,
  getLast30DaysWindow,
  getAustralianFinancialYearWindow,
  parseMoney,
  parseMonthYear,
  getMonthYearValue,
  normalizeSchedule,
  computeSpendFromDelivery,
} from './shared'

function xanoResponseBodyPreview(data: unknown): string {
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data)
    return s.length > 200 ? `${s.slice(0, 200)}...` : s
  } catch {
    return '[unserializable]'
  }
}

async function fetchMediaPlanMasterWithFallback(): Promise<{ data: any; endpoint: string }> {
  const endpoints = ['media_plan_master', 'media_plans_master']
  const debug = isDashboardDebug()
  let lastError: any = null

  for (const endpoint of endpoints) {
    const url = xanoMediaPlansUrl(endpoint)
    try {
      const response = await apiClient.get(url)
      if (debug) {
        console.log(`Dashboard: fetched media plan master via ${endpoint}`)
      }
      return { data: response.data, endpoint }
    } catch (err: any) {
      const status = err?.response?.status
      lastError = err
      const msg = err?.message != null ? String(err.message) : String(err)
      console.error('[dashboard] fetchMediaPlanMasterWithFallback catch:', {
        message: msg,
        failedUrl: url,
        responseStatus: err?.response?.status,
        responseBodyPreview: err?.response?.data != null ? xanoResponseBodyPreview(err.response.data) : undefined,
        err,
      })

      if (debug) {
        console.warn(`Dashboard: ${endpoint} request failed${status ? ` (status ${status})` : ''}`)
      }

      if (status === 404) {
        continue
      }

      throw err
    }
  }

  throw lastError ?? new Error('Dashboard: media plan master endpoints unavailable')
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  const url = getXanoClientsCollectionUrl()
  try {
    const response = await apiClient.get(url)
    const clients = parseXanoListPayload(response.data)

    const raw = findClientRawByDashboardSlug(clients, slug) as Record<string, any> | null
    if (!raw) {
      if (isDashboardDebug()) {
        console.log('Client not found for slug:', slug)
      }
      return null
    }

    const name = getClientDisplayName(raw)
    const idVal = raw.id
    const brandColour =
      typeof raw.brand_colour === 'string' && raw.brand_colour.trim()
        ? raw.brand_colour.trim()
        : typeof raw.brandColour === 'string' && raw.brandColour.trim()
          ? raw.brandColour.trim()
          : undefined

    return {
      id: idVal != null ? String(idVal) : '',
      name,
      slug,
      createdAt:
        typeof raw.created_at === 'number'
          ? new Date(raw.created_at).toISOString()
          : typeof raw.created_at === 'string' && raw.created_at.trim()
            ? raw.created_at
            : new Date().toISOString(),
      updatedAt:
        typeof raw.updated_at === 'number'
          ? new Date(raw.updated_at).toISOString()
          : typeof raw.updated_at === 'string' && raw.updated_at.trim()
            ? raw.updated_at
            : new Date().toISOString(),
      brandColour,
    }
  } catch (error: any) {
    const msg = error?.message != null ? String(error.message) : String(error)
    console.error('[dashboard] getClientBySlug catch:', {
      message: msg,
      failedUrl: url,
      responseStatus: error?.response?.status,
      responseBodyPreview:
        error?.response?.data != null ? xanoResponseBodyPreview(error.response.data) : undefined,
      error,
    })
    return null
  }
}

async function fetchMediaPlanVersionsArray(): Promise<any[]> {
  const url = xanoMediaPlansUrl('media_plan_versions')
  try {
    const versionsResponse = await apiClient.get(url)
    return parseXanoListPayload(versionsResponse.data)
  } catch (error: any) {
    const msg = error?.message != null ? String(error.message) : String(error)
    console.error('[dashboard] fetchMediaPlanVersionsArray catch:', {
      message: msg,
      failedUrl: url,
      responseStatus: error?.response?.status,
      responseBodyPreview:
        error?.response?.data != null ? xanoResponseBodyPreview(error.response.data) : undefined,
      error,
    })
    if (error?.response?.status === 404) {
      if (isDashboardDebug()) {
        console.warn('Dashboard: media_plan_versions returned 404')
      }
      return []
    }
    throw error
  }
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
      parseDateSafe(
        plan?.campaign_start_date ??
          plan?.mp_campaigndates_start ??
          plan?.campaign_start ??
          plan?.start_date ??
          plan?.startDate
      ) ?? null
    const endDate =
      parseDateSafe(
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
  return {
    id: String(raw.id ?? ''),
    name,
    slug,
    createdAt: raw.created_at || new Date().toISOString(),
    updatedAt: raw.updated_at || new Date().toISOString(),
    brandColour: raw.brand_colour,
  }
}

/** When `media_plan_versions` cannot be loaded but the client row is known — empty campaigns / zero spend. */
function emptyDashboardForKnownClient(
  fallbackClient: Client,
  totalCampaignsYTDFromMaster: number | null,
): ClientDashboardData {
  const { months: fyMonths } = getAustralianFinancialYear(new Date())
  return {
    clientName: fallbackClient.name,
    brandColour: fallbackClient.brandColour,
    liveCampaigns: 0,
    totalCampaignsYTD: totalCampaignsYTDFromMaster ?? 0,
    spendPast30Days: 0,
    totalSpend: 0,
    liveCampaignsList: [],
    planningCampaignsList: [],
    completedCampaignsList: [],
    spendByMediaType: [],
    spendByCampaign: [],
    monthlySpend: fyMonths.map((month) => ({ month, data: [] })),
  }
}

function buildClientDashboardDataFromVersions(
  targetSlug: string,
  allVersions: any[],
  ctx: {
    fallbackClient: Client | null
    totalCampaignsYTDFromMaster: number | null
    urlSlug: string
  }
): ClientDashboardData | null {
  const { fallbackClient, totalCampaignsYTDFromMaster, urlSlug } = ctx

  const clientVersions = allVersions.filter((version: any) => {
    const nameCandidates = [
      version?.mp_client_name,
      version?.client_name,
      version?.mp_clientname,
      version?.client,
    ].filter((n: any) => typeof n === 'string' && n.trim().length > 0)

    if (nameCandidates.length === 0) return false

    return nameCandidates.some((name: string) => slugifyClientName(name) === targetSlug)
  })

  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  if (clientVersions.length === 0) {
    console.warn('No media_plan_versions found for slug:', urlSlug)

    if (fallbackClient) {
      return {
        clientName: fallbackClient.name,
        brandColour: fallbackClient.brandColour,
        liveCampaigns: 0,
        totalCampaignsYTD: totalCampaignsYTDFromMaster ?? 0,
        spendPast30Days: 0,
        totalSpend: 0,
        liveCampaignsList: [],
        planningCampaignsList: [],
        completedCampaignsList: [],
        spendByMediaType: [],
        spendByCampaign: [],
        monthlySpend: fyMonths.map((month) => ({ month, data: [] })),
      }
    }

    return null
  }

  const clientName =
      clientVersions[0].mp_client_name ||
      clientVersions[0].client_name ||
      clientVersions[0].mp_clientname ||
      fallbackClient?.name ||
      urlSlug
    const brandColour =
      clientVersions[0].brand_colour ||
      clientVersions[0].brandColour ||
      fallbackClient?.brandColour

    console.log('Dashboard: using client from media_plan_versions', { clientName, slug: targetSlug, versions: clientVersions.length })

    // One row per MBA: highest version_number (matches mediaplans MBA edit — latest version wins).
    const versionsByMBA = clientVersions.reduce((acc: Record<string, any[]>, version: any) => {
      const key = normalizeMbaKey(version.mba_number)
      if (!key) return acc
      acc[key] = acc[key] || []
      acc[key].push(version)
      return acc
    }, {} as Record<string, any[]>)

    const selectedVersionByMBA: Record<string, any> = {}

    Object.entries(versionsByMBA).forEach(([mbaKey, versions]: [string, any[]]) => {
      const chosenVersion = pickHighestVersionRow(versions)
      if (chosenVersion) {
        selectedVersionByMBA[mbaKey] = chosenVersion
      }
    })
    
    const selectedVersionPerMBA = Object.values(selectedVersionByMBA)
    
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
            })
          : 0

      return {
        mbaNumber: normalizeMbaKey(version.mba_number) ?? '',
        campaignName: version.campaign_name || '',
        versionNumber: `v${version.version_number || 1}`,
        version_number: Number.isFinite(vn) && vn > 0 ? vn : 1,
        budget: parseFloat(version.mp_campaignbudget) || 0,
        startDate,
        endDate,
        mediaTypes,
        status: normalizeStatus(version.campaign_status) as Campaign['status'],
        expectedSpendToDate: expectedSpendToDate > 0 ? expectedSpendToDate : undefined,
      }
    })

    const currentDate = new Date()
    const last30dWindow = getLast30DaysWindow()

    // Calculate metrics (unchanged from previous behaviour)
    const liveCampaigns = clientCampaigns.filter(campaign => {
      const status = normalizeStatus(campaign.status)
      return (status === 'approved' || status === 'booked') &&
        new Date(campaign.startDate) <= currentDate && 
        new Date(campaign.endDate) >= currentDate
    })

    const totalCampaignsYTD = totalCampaignsYTDFromMaster ?? 0

    const liveCampaignsList = clientCampaigns.filter(campaign => {
      const status = normalizeStatus(campaign.status)
      return (status === 'approved' || status === 'booked') &&
        new Date(campaign.startDate) <= currentDate && 
        new Date(campaign.endDate) >= currentDate
    })

    const planningCampaignsList = clientCampaigns.filter((campaign) => {
      const end = new Date(campaign.endDate)
      if (!Number.isNaN(end.getTime()) && end < currentDate) return false
      const status = normalizeStatus(campaign.status)
      return status === 'planning' || status === 'draft' || new Date(campaign.startDate) > currentDate
    })

    const completedCampaignsList = clientCampaigns.filter((campaign) => new Date(campaign.endDate) < currentDate)

    // Filter to only booked/approved/completed campaigns for spend analytics
    const bookedApprovedCampaigns = clientCampaigns.filter(campaign =>
      isBookedApprovedCompleted(campaign.status)
    )

    // Delivery / billing schedules from the same highest-version row per MBA (aligned with campaign cards).
    const deliveryScheduleByMBA: Record<string, any[]> = {}
    Object.entries(selectedVersionByMBA).forEach(([mbaKey, version]: [string, any]) => {
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
    fyMonths.forEach(month => { deliveryMonthlyMap[month] = {} })
    const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

    bookedApprovedCampaigns.forEach((campaign) => {
      const mbaKey = normalizeMbaKey(campaign.mbaNumber)
      const schedule = mbaKey ? deliveryScheduleByMBA[mbaKey] : undefined
      if (!schedule || !Array.isArray(schedule)) return

      schedule.forEach(entry => {
        const monthDate = parseMonthYear(getMonthYearValue(entry))
        if (!monthDate || monthDate < fyStart || monthDate > fyEnd) return
        const monthLabel = monthLabelFromDate(monthDate)

        const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
        // If no mediaTypes, try to record the whole entry as unspecified
        if (mediaTypes.length === 0) {
          const amount = parseMoney(entry?.amount ?? entry?.total ?? entry?.budget)
          if (amount > 0) {
            deliveryMediaTypeSpend['Unspecified'] = (deliveryMediaTypeSpend['Unspecified'] || 0) + amount
            const campaignKey = campaign.campaignName || campaign.mbaNumber || 'Campaign'
            deliveryCampaignSpend[campaignKey] = (deliveryCampaignSpend[campaignKey] || 0) + amount
            deliveryMonthlyMap[monthLabel]['Unspecified'] = (deliveryMonthlyMap[monthLabel]['Unspecified'] || 0) + amount
          }
          return
        }

        mediaTypes.forEach((mt: any) => {
          const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
          const totalForType = lineItems.reduce((sum: number, li: any) => sum + parseMoney(li?.amount), 0)
          if (totalForType <= 0) return
          const mediaTypeLabel =
            mt?.mediaType ||
            mt?.media_type ||
            mt?.type ||
            mt?.name ||
            mt?.channel ||
            'Unspecified'

          deliveryMediaTypeSpend[mediaTypeLabel] = (deliveryMediaTypeSpend[mediaTypeLabel] || 0) + totalForType

          const campaignKey = campaign.campaignName || campaign.mbaNumber || 'Campaign'
          deliveryCampaignSpend[campaignKey] = (deliveryCampaignSpend[campaignKey] || 0) + totalForType

          deliveryMonthlyMap[monthLabel][mediaTypeLabel] = (deliveryMonthlyMap[monthLabel][mediaTypeLabel] || 0) + totalForType
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
    }> = fyMonths.map(month => ({
      month,
      data: Object.entries(deliveryMonthlyMap[month] || {})
        .map(([mediaType, amount]) => ({ mediaType, amount }))
        .filter(item => item.amount > 0)
    }))

    // Ensure charts only show booked media types/campaigns with spend in the FY
    spendByMediaType = spendByMediaType.filter(item => item.amount > 0)
    spendByCampaign = spendByCampaign.filter(item => item.amount > 0)
    monthlySpend = monthlySpend.map(month => ({
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
      liveCampaignsList,
      planningCampaignsList,
      completedCampaignsList,
      spendByMediaType,
      spendByCampaign,
      monthlySpend
    }

    console.log('Dashboard data built for client:', clientName, {
      slug: targetSlug,
      campaigns: clientCampaigns.length,
      bookedApproved: bookedApprovedCampaigns.length,
      spendByMediaType: spendByMediaType.length,
      spendByCampaign: spendByCampaign.length,
      months: monthlySpend.length
    })

    return result
}

export async function getClientDashboardData(slug: string): Promise<ClientDashboardData | null> {
  console.log('[dashboard] getClientDashboardData called with slug:', slug, 'ENV check:', {
    XANO_BASE_URL: !!process.env.XANO_BASE_URL,
    XANO_MEDIA_PLANS_BASE_URL: !!process.env.XANO_MEDIA_PLANS_BASE_URL,
    XANO_CLIENTS_COLLECTION_URL: !!process.env.XANO_CLIENTS_COLLECTION_URL,
  })
  if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
    console.error('Invalid slug provided for dashboard:', slug)
    return null
  }

  const sanitizedSlug = slug.trim()
  const targetSlug = slugifyClientName(sanitizedSlug)
  const fyWindow = getAustralianFinancialYearWindow(new Date())

  try {
    let fallbackClient: Client | null = null
    try {
      fallbackClient = await getClientBySlug(targetSlug)
    } catch (err) {
      console.warn('Dashboard: skipping client fallback lookup due to error', err)
      fallbackClient = null
    }

    let totalCampaignsYTDFromMaster: number | null = null
    let masterEndpointUsed: string | null = null

    try {
      const { data: masterData, endpoint } = await fetchMediaPlanMasterWithFallback()
      masterEndpointUsed = endpoint
      const masterPlans = parseXanoListPayload(masterData)
      const ytdMap = buildYtdCountBySlugFromMaster(masterPlans, fyWindow)
      totalCampaignsYTDFromMaster = Object.prototype.hasOwnProperty.call(ytdMap, targetSlug)
        ? ytdMap[targetSlug]!
        : null
    } catch (error) {
      console.warn('Dashboard: failed to load media plan master for totals', error)
    }

    if (isDashboardDebug() && masterEndpointUsed) {
      console.log(`Dashboard: master totals sourced from ${masterEndpointUsed}`)
    }

    let allVersions: any[] = []
    try {
      allVersions = await fetchMediaPlanVersionsArray()
    } catch (versionsError) {
      console.warn('Dashboard: media_plan_versions fetch failed; using partial dashboard if client is known', versionsError)
      if (fallbackClient) {
        return emptyDashboardForKnownClient(fallbackClient, totalCampaignsYTDFromMaster)
      }
      return null
    }

    return buildClientDashboardDataFromVersions(targetSlug, allVersions, {
      fallbackClient,
      totalCampaignsYTDFromMaster,
      urlSlug: sanitizedSlug,
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
  const [allVersions, masterBundle] = await Promise.all([
    fetchMediaPlanVersionsArray().catch((err) => {
      console.warn('getClientHubSummaries: media_plan_versions failed; continuing with empty versions', err)
      return [] as any[]
    }),
    fetchMediaPlanMasterWithFallback().catch(() => ({ data: [] as any[], endpoint: null as string | null })),
  ])
  const masterPlans = parseXanoListPayload(masterBundle.data)
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

    const dashboard = buildClientDashboardDataFromVersions(targetSlug, allVersions, {
      fallbackClient: fallback,
      totalCampaignsYTDFromMaster,
      urlSlug: slugUrl,
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
    })
  }

  summaries.sort((a, b) => a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' }))
  return summaries
}

async function fetchXanoClientsWithSlugsForHub(): Promise<any[]> {
  const url = getXanoClientsCollectionUrl()
  const response = await apiClient.get(url)
  const rows = parseXanoListPayload(response.data)
  return rows.map((raw: any) => ({
    ...raw,
    slug: raw.slug || slugifyClientNameForUrl(getClientDisplayName(raw)),
  }))
}

/** Server-only: loads clients from Xano and builds hub cards in one batched pass (no self-HTTP). */
export async function getClientHubSummariesForAdminHub(): Promise<ClientHubSummary[]> {
  try {
    const rows = await fetchXanoClientsWithSlugsForHub()
    return await getClientHubSummaries(rows)
  } catch (e: any) {
    const msg = e?.message != null ? String(e.message) : String(e)
    console.error('[dashboard] getClientHubSummariesForAdminHub catch:', {
      message: msg,
      failedUrl: e?.config?.url ?? '(unknown)',
      err: e,
    })
    return []
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
