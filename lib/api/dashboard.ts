import { ClientDashboardData, Campaign, Client, GlobalMonthlySpend, GlobalMonthlyPublisherSpend, GlobalMonthlyClientSpend } from '@/lib/types/dashboard'
import { 
  aggregateMonthlySpendByMediaType, 
  getSpendByMediaTypeFromLineItems, 
  getSpendByCampaignFromLineItems 
} from './media-containers'
import axios from 'axios'
import { xanoUrl } from '@/lib/api/xano'
import { slugifyClientNameForUrl } from '@/lib/clients/slug'

const MELBOURNE_TZ = 'Australia/Melbourne'
const DAY_MS = 24 * 60 * 60 * 1000

// Create axios instance with timeout
const apiClient = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
})

const isDashboardDebug = () => process.env.NEXT_PUBLIC_DEBUG_DASHBOARD === 'true'

async function fetchMediaPlanMasterWithFallback(): Promise<{ data: any; endpoint: string }> {
  const endpoints = ['media_plan_master', 'media_plans_master']
  const debug = isDashboardDebug()
  let lastError: any = null

  for (const endpoint of endpoints) {
    try {
      const response = await apiClient.get(
        xanoUrl(endpoint, ['XANO_MEDIA_PLANS_BASE_URL', 'XANO_MEDIAPLANS_BASE_URL'])
      )
      if (debug) {
        console.log(`Dashboard: fetched media plan master via ${endpoint}`)
      }
      return { data: response.data, endpoint }
    } catch (err: any) {
      const status = err?.response?.status
      lastError = err

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

// Helper function to normalize client names for consistent comparison
function normalizeClientName(name: string): string {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Helper function to check if two client names match
function clientNamesMatch(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false
  return normalizeClientName(name1) === normalizeClientName(name2)
}

function normalizeStatus(status: any): string {
  if (status === null || status === undefined) return ''
  return String(status).trim().toLowerCase()
}

function normalizeTags(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((tag) => (typeof tag === 'string' ? tag : String(tag)))
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0)
  }
  return []
}

const isBookedApprovedCompleted = (status: any) => {
  const normalized = normalizeStatus(status)
  return normalized === 'booked' || normalized === 'approved' || normalized === 'completed'
}

function hasBookedApprovedCompletedTag(value: any): boolean {
  const tags = normalizeTags(value)
  return tags.some((tag) => tag === 'booked' || tag === 'approved' || tag === 'completed')
}

function slugifyClientName(name: string): string {
  return slugifyClientNameForUrl(normalizeClientName(name))
}

function getAustralianFinancialYear(date = new Date()) {
  const currentYear = date.getFullYear()
  const isAfterJune = date.getMonth() >= 6 // July is 6
  const startYear = isAfterJune ? currentYear : currentYear - 1

  const start = new Date(startYear, 6, 1, 0, 0, 0, 0)
  const end = new Date(startYear + 1, 5, 30, 23, 59, 59, 999)
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

  return { start, end, months }
}

function parseDateSafe(value: any): Date | null {
  if (!value) return null
  const date = new Date(value)
  return isNaN(date.getTime()) ? null : date
}

type TzParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function getTzParts(date: Date, timeZone = MELBOURNE_TZ): TzParts {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = formatter.formatToParts(date).reduce<Record<string, number>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = Number(part.value)
    }
    return acc
  }, {})

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

function makeZonedDate(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
  timeZone = MELBOURNE_TZ,
): Date {
  const utcGuess = Date.UTC(year, monthIndex, day, hour, minute, second, ms)
  const parts = getTzParts(new Date(utcGuess), timeZone)
  const asLocal = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, ms)
  const offset = asLocal - utcGuess
  return new Date(utcGuess - offset)
}

function getTodayWindow() {
  const parts = getTzParts(new Date())
  const start = makeZonedDate(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0)
  const end = makeZonedDate(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999)
  return { start, end }
}

function getLast30DaysWindow() {
  const { start: todayStart, end: todayEnd } = getTodayWindow()
  const start = new Date(todayStart.getTime() - 29 * DAY_MS)
  return { start, end: todayEnd }
}

function getAustralianFinancialYearWindow(reference: Date = new Date()) {
  const parts = getTzParts(reference)
  const isAfterJune = parts.month >= 7 // July is month 7 in 1-based parts
  const startYear = isAfterJune ? parts.year : parts.year - 1
  const start = makeZonedDate(startYear, 6, 1, 0, 0, 0, 0) // July 1
  const end = makeZonedDate(startYear + 1, 5, 30, 23, 59, 59, 999) // June 30
  return { start, end }
}

function parseMonthYearLabel(label: any): { start: Date; end: Date } | null {
  if (!label || typeof label !== 'string') return null
  const trimmed = label.trim()
  if (!trimmed) return null

  // Support formats like "December 2025", "Dec 2025", "2025-12", "2025/12", "202512"
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ]

  let year: number | null = null
  let monthIndex: number | null = null

  // 2025-12 or 2025/12
  if (/^\d{4}[-/]\d{2}$/.test(trimmed)) {
    const [y, m] = trimmed.split(/[-/]/)
    year = Number(y)
    monthIndex = Number(m) - 1
  }

  // 202512
  if (!year && /^\d{6}$/.test(trimmed)) {
    year = Number(trimmed.slice(0, 4))
    monthIndex = Number(trimmed.slice(4, 6)) - 1
  }

  // December 2025 or Dec 2025
  if (!year) {
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 2) {
      const maybeMonth = parts[0].toLowerCase()
      const maybeYear = Number(parts[1])
      const nameIndex = monthNames.findIndex((m) => m.startsWith(maybeMonth))
      if (!Number.isNaN(maybeYear) && nameIndex >= 0) {
        year = maybeYear
        monthIndex = nameIndex
      }
    }
  }

  if (year === null || monthIndex === null || monthIndex < 0 || monthIndex > 11) return null

  const start = makeZonedDate(year, monthIndex, 1, 0, 0, 0, 0)
  const end = makeZonedDate(year, monthIndex + 1, 0, 23, 59, 59, 999) // day 0 of next month = last day current
  return { start, end }
}

function sumLineItems(entry: any): number {
  const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
  const lineItemTotal = mediaTypes.reduce((mtSum: number, mt: any) => {
    const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
    const liSum = lineItems.reduce((liAcc: number, li: any) => liAcc + parseMoney(li?.amount), 0)
    return mtSum + liSum
  }, 0)

  const feeTotal = parseMoney(entry?.feeTotal)
  const production = parseMoney(entry?.production)
  const adServing = parseMoney(entry?.adservingTechFees ?? entry?.adServingTechFees)

  return lineItemTotal + feeTotal + production + adServing
}

function calcOverlapAmountForWindow(
  entryRange: { start: Date; end: Date },
  totalAmount: number,
  window: { start: Date; end: Date },
): number {
  const overlapStart = new Date(Math.max(entryRange.start.getTime(), window.start.getTime()))
  const overlapEnd = new Date(Math.min(entryRange.end.getTime(), window.end.getTime()))
  if (overlapEnd < overlapStart) return 0
  const overlapDays = Math.max(1, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / DAY_MS) + 1)
  const entryDays = Math.max(1, Math.round((entryRange.end.getTime() - entryRange.start.getTime()) / DAY_MS) + 1)
  return (totalAmount * overlapDays) / entryDays
}

function computeSpendFromDelivery(
  deliverySchedule: any[],
  windows: { last30d: { start: Date; end: Date }; fy: { start: Date; end: Date } },
): { last30d: number; fy: number } {
  let last30d = 0
  let fy = 0

  deliverySchedule.forEach((entry) => {
    const monthRange = parseMonthYearLabel(entry?.monthYear ?? entry?.month_year ?? entry?.monthLabel ?? entry?.month_label)
    const explicitDate = parseDateSafe(entry?.date ?? entry?.day ?? entry?.startDate ?? entry?.start_date)

    const amount = sumLineItems(entry)
    if (!amount || amount <= 0) return

    // Monthly bucket: pro-rate by overlap days
    if (monthRange) {
      last30d += calcOverlapAmountForWindow(monthRange, amount, windows.last30d)
      fy += calcOverlapAmountForWindow(monthRange, amount, windows.fy)
      return
    }

    // Daily entry: include if inside window
    if (explicitDate) {
      const dayStart = makeZonedDate(
        explicitDate.getUTCFullYear(),
        explicitDate.getUTCMonth(),
        explicitDate.getUTCDate(),
        0,
        0,
        0,
        0,
      )
      const dayEnd = makeZonedDate(
        explicitDate.getUTCFullYear(),
        explicitDate.getUTCMonth(),
        explicitDate.getUTCDate(),
        23,
        59,
        59,
        999,
      )
      if (dayEnd >= windows.last30d.start && dayStart <= windows.last30d.end) {
        last30d += amount
      }
      if (dayEnd >= windows.fy.start && dayStart <= windows.fy.end) {
        fy += amount
      }
    }
  })

  return { last30d, fy }
}

function parseMoney(value: any): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseMonthYear(monthYear: any): Date | null {
  if (!monthYear) return null
  if (monthYear instanceof Date) {
    return isNaN(monthYear.getTime())
      ? null
      : new Date(monthYear.getFullYear(), monthYear.getMonth(), 1)
  }
  if (typeof monthYear === 'number') {
    // Handle YYYYMM numeric format (e.g. 202407)
    const asString = String(monthYear)
    if (/^\d{6}$/.test(asString)) {
      const yearNum = parseInt(asString.slice(0, 4), 10)
      const monthNum = parseInt(asString.slice(4, 6), 10)
      if (!isNaN(yearNum) && monthNum >= 1 && monthNum <= 12) {
        return new Date(yearNum, monthNum - 1, 1)
      }
    }
    return null
  }
  if (typeof monthYear !== 'string') return null
  const trimmed = monthYear.trim()
  if (!trimmed) return null

  // YYYY-MM or YYYY/MM
  if (/^\d{4}[-/]\d{2}$/.test(trimmed)) {
    const [yearStr, monthStr] = trimmed.split(/[-/]/)
    const yearNum = parseInt(yearStr, 10)
    const monthNum = parseInt(monthStr, 10)
    if (!isNaN(yearNum) && monthNum >= 1 && monthNum <= 12) {
      return new Date(yearNum, monthNum - 1, 1)
    }
  }

  // MM/YYYY or M/YYYY
  if (/^\d{1,2}[-/]\d{4}$/.test(trimmed)) {
    const [monthStr, yearStr] = trimmed.split(/[-/]/)
    const yearNum = parseInt(yearStr, 10)
    const monthNum = parseInt(monthStr, 10)
    if (!isNaN(yearNum) && monthNum >= 1 && monthNum <= 12) {
      return new Date(yearNum, monthNum - 1, 1)
    }
  }

  // Month name + year (e.g. "Jul 2024", "July 2024")
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    const [monthName, yearStr] = parts
    const monthIndex = [
      'january','february','march','april','may','june',
      'july','august','september','october','november','december'
    ].indexOf(monthName.toLowerCase())
    const yearNum = parseInt(yearStr, 10)
    if (monthIndex >= 0 && !isNaN(yearNum)) {
      return new Date(yearNum, monthIndex, 1)
    }
  }

  // Fallback to Date parsing (e.g. ISO strings)
  const parsed = new Date(trimmed)
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  }

  return null
}

function getMonthYearValue(entry: any) {
  return (
    entry?.monthYear ??
    entry?.month_year ??
    entry?.month ??
    entry?.monthLabel ??
    entry?.month_label ??
    null
  )
}

function normalizeSchedule(schedule: any): any[] {
  if (!schedule) return []
  if (Array.isArray(schedule)) return schedule
  if (typeof schedule === "string") {
    try {
      const parsed = JSON.parse(schedule)
      if (Array.isArray(parsed)) return parsed
      if (parsed?.months && Array.isArray(parsed.months)) return parsed.months
      return []
    } catch {
      return []
    }
  }
  if (schedule?.months && Array.isArray(schedule.months)) {
    return schedule.months
  }
  return []
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  try {
    // Fetch all clients from Xano
    const response = await apiClient.get(xanoUrl("clients", "XANO_CLIENTS_BASE_URL"))
    const clients = response.data
    
    // Debug logging
    console.log('Looking for slug:', slug)
    
    // Find client by converting name to slug
    const client = clients.find((c: any) => {
      const clientSlug = c.mp_client_name
        ?.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim()
      return clientSlug === slug
    })
    
    if (!client) {
      console.log('Client not found for slug:', slug)
      return null
    }
    
    return {
      id: client.id.toString(),
      name: client.mp_client_name,
      slug: slug,
      createdAt: client.created_at || new Date().toISOString(),
      updatedAt: client.updated_at || new Date().toISOString(),
      brandColour: client.brand_colour
    }
  } catch (error) {
    console.error('Error fetching client by slug:', error)
    return null
  }
}

export async function getClientDashboardData(slug: string): Promise<ClientDashboardData | null> {
  if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
    console.error('Invalid slug provided for dashboard:', slug)
    return null
  }
  
  const sanitizedSlug = slug.trim()
  const targetSlug = slugifyClientName(sanitizedSlug)

  try {
    let fallbackClient: Client | null = null
    try {
      fallbackClient = await getClientBySlug(targetSlug)
    } catch (err) {
      console.warn('Dashboard: skipping client fallback lookup due to error', err)
      fallbackClient = null
    }

    // Pull media plan versions and filter by client slug derived from mp_client_name
    const versionsResponse = await apiClient.get(
      xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
    )
    const allVersions = Array.isArray(versionsResponse.data) ? versionsResponse.data : []

    const clientVersions = allVersions.filter((version: any) => {
      const nameCandidates = [
        version?.mp_client_name,
        version?.client_name,
        version?.mp_clientname,
        version?.client
      ].filter((n: any) => typeof n === 'string' && n.trim().length > 0)

      if (nameCandidates.length === 0) return false

      return nameCandidates.some((name: string) => slugifyClientName(name) === targetSlug)
    })

    const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())
    const fyWindow = getAustralianFinancialYearWindow(new Date())
    let totalCampaignsYTDFromMaster: number | null = null
    let masterEndpointUsed: string | null = null

    try {
      const { data: masterData, endpoint } = await fetchMediaPlanMasterWithFallback()
      masterEndpointUsed = endpoint
      const masterPlans = Array.isArray(masterData) ? masterData : []
      const clientMasterPlans = masterPlans.filter((plan: any) => {
        const nameCandidates = [
          plan?.mp_client_name,
          plan?.client_name,
          plan?.mp_clientname,
          plan?.client
        ].filter((n: any) => typeof n === 'string' && n.trim().length > 0)

        if (nameCandidates.length === 0) return false

        return nameCandidates.some((name: string) => slugifyClientName(name) === targetSlug)
      })

      totalCampaignsYTDFromMaster = clientMasterPlans.filter((plan: any) => {
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
        if (!statusMatches) return false

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

        if (!startDate || !endDate) return false

        return startDate <= fyWindow.end && endDate >= fyWindow.start
      }).length
    } catch (error) {
      console.warn('Dashboard: failed to load media plan master for totals', error)
    }

    if (isDashboardDebug() && masterEndpointUsed) {
      console.log(`Dashboard: master totals sourced from ${masterEndpointUsed}`)
    }

    if (clientVersions.length === 0) {
      console.warn('No media_plan_versions found for slug:', sanitizedSlug)

      // Fallback: if client exists in Xano clients table but has no plans yet, return empty dashboard shell
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
          monthlySpend: fyMonths.map((month) => ({ month, data: [] }))
        }
      }

      return null
    }

    const clientName =
      clientVersions[0].mp_client_name ||
      clientVersions[0].client_name ||
      clientVersions[0].mp_clientname ||
      fallbackClient?.name ||
      sanitizedSlug
    const brandColour =
      clientVersions[0].brand_colour ||
      clientVersions[0].brandColour ||
      fallbackClient?.brandColour

    console.log('Dashboard: using client from media_plan_versions', { clientName, slug: targetSlug, versions: clientVersions.length })

    // Keep only booked/approved/completed and highest version per MBA
    const versionsByMBA = clientVersions.reduce((acc: Record<string, any[]>, version: any) => {
      const mbaNumber = version.mba_number
      if (!mbaNumber) return acc
      acc[mbaNumber] = acc[mbaNumber] || []
      acc[mbaNumber].push(version)
      return acc
    }, {} as Record<string, any[]>)

    const selectedVersionByMBA: Record<string, any> = {}

    Object.entries(versionsByMBA).forEach(([mbaNumber, versions]: [string, any[]]) => {
      const sorted = versions
        .slice()
        .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))

      const bookedApprovedCompleted = sorted.find((v: any) => isBookedApprovedCompleted(v.campaign_status))

      const chosenVersion = bookedApprovedCompleted || sorted[0]

      if (chosenVersion) {
        selectedVersionByMBA[mbaNumber] = chosenVersion
      }

      if (!bookedApprovedCompleted && sorted[0]) {
        console.warn(`No booked/approved/completed version found for MBA ${mbaNumber}; using latest version ${sorted[0]?.version_number ?? 'n/a'} for dashboard lists`)
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

      return {
        mbaNumber: version.mba_number || '',
        campaignName: version.campaign_name || '',
        versionNumber: `v${version.version_number || 1}`,
        budget: parseFloat(version.mp_campaignbudget) || 0,
        startDate: version.campaign_start_date || '',
        endDate: version.campaign_end_date || '',
        mediaTypes,
        status: normalizeStatus(version.campaign_status) as Campaign['status']
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

    const planningCampaignsList = clientCampaigns.filter(campaign => {
      const status = normalizeStatus(campaign.status)
      return status === 'planning' || status === 'draft' || new Date(campaign.startDate) > currentDate
    })

    const completedCampaignsList = clientCampaigns.filter(campaign => 
      new Date(campaign.endDate) < currentDate
    )

    // Filter to only booked/approved/completed campaigns for spend analytics
    const bookedApprovedCampaigns = clientCampaigns.filter(campaign =>
      isBookedApprovedCompleted(campaign.status)
    )

    // Build delivery schedule map using highest booked/approved/completed version per MBA
    const bookedApprovedVersionByMBA: Record<string, any> = {}
    Object.entries(versionsByMBA).forEach(([mbaNumber, versions]: [string, any[]]) => {
      const sorted = versions
        .slice()
        .sort((a, b) => {
          const vA = a.version_number ?? 0
          const vB = b.version_number ?? 0
          if (vB !== vA) return vB - vA
          const aUpdated = parseDateSafe(a.updated_at) ?? new Date(0)
          const bUpdated = parseDateSafe(b.updated_at) ?? new Date(0)
          return bUpdated.getTime() - aUpdated.getTime()
        })
      const bookedApprovedCompleted = sorted.find((v: any) => isBookedApprovedCompleted(v.campaign_status))
      if (bookedApprovedCompleted) {
        bookedApprovedVersionByMBA[mbaNumber] = bookedApprovedCompleted
      }
    })

    const deliveryScheduleByMBA: Record<string, any[]> = {}
    Object.entries(bookedApprovedVersionByMBA).forEach(([mbaNumber, version]: [string, any]) => {
      const schedule =
        (version as any)?.deliverySchedule ||
        (version as any)?.delivery_schedule ||
        (version as any)?.billingSchedule ||
        (version as any)?.billing_schedule
      const normalized = normalizeSchedule(schedule)
      if (normalized.length > 0) {
        deliveryScheduleByMBA[mbaNumber] = normalized
      }
    })

    // Build delivery spend breakdowns
    const deliveryMediaTypeSpend: Record<string, number> = {}
    const deliveryCampaignSpend: Record<string, number> = {}
    const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
    fyMonths.forEach(month => { deliveryMonthlyMap[month] = {} })
    const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

    bookedApprovedCampaigns.forEach(campaign => {
      const schedule = deliveryScheduleByMBA[campaign.mbaNumber]
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

    // Calculate spend windows from delivery schedules for booked/approved/completed campaigns
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
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return null
  }
}

/**
 * Global monthly spend (all clients), sourced from deliverySchedule on media_plan_versions
 * with billingSchedule as a fallback. Rules: booked/approved, highest version per MBA,
 * current AU FY (Jul–Jun).
 */
export async function getGlobalMonthlySpend(): Promise<GlobalMonthlySpend[]> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  const versionsResponse = await apiClient.get(
    xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  )
  const allVersions = Array.isArray(versionsResponse.data) ? versionsResponse.data : []

  const versionsByMBA = allVersions.reduce((acc: Record<string, any[]>, version: any) => {
    const mbaNumber = version?.mba_number
    if (!mbaNumber) return acc
    acc[mbaNumber] = acc[mbaNumber] || []
    acc[mbaNumber].push(version)
    return acc
  }, {} as Record<string, any[]>)

  const highestApprovedVersionByMBA = Object.entries(versionsByMBA).reduce((acc: Record<string, any>, [mbaNumber, versions]: [string, any[]]) => {
    const sorted = versions
      .slice()
      .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))

    const bookedApproved = sorted.find((v: any) => isBookedApprovedCompleted(v.campaign_status))

    if (bookedApproved) {
      acc[mbaNumber] = bookedApproved
      return acc
    }

    if (sorted[0]) {
      acc[mbaNumber] = sorted[0]
    }
    return acc
  }, {} as Record<string, any>)

  const deliveryMonthlyMap: Record<string, number> = {}
  fyMonths.forEach(month => { deliveryMonthlyMap[month] = 0 })

  const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

  Object.values(highestApprovedVersionByMBA).forEach(version => {
    const schedule = normalizeSchedule(
      (version as any)?.deliverySchedule ||
        (version as any)?.delivery_schedule ||
        (version as any)?.billingSchedule ||
        (version as any)?.billing_schedule
    )
    if (!Array.isArray(schedule) || schedule.length === 0) return

    schedule.forEach(entry => {
      const monthDate = parseMonthYear(getMonthYearValue(entry))
      if (!monthDate || monthDate < fyStart || monthDate > fyEnd) return
      const monthLabel = monthLabelFromDate(monthDate)

      const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
      mediaTypes.forEach((mt: any) => {
        const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
        const totalForType = lineItems.reduce((sum: number, li: any) => sum + parseMoney(li?.amount), 0)
        if (totalForType <= 0) return
        deliveryMonthlyMap[monthLabel] = (deliveryMonthlyMap[monthLabel] || 0) + totalForType
      })
    })
  })

  return fyMonths.map(month => ({
    month,
    amount: deliveryMonthlyMap[month] || 0
  }))
}

/**
 * Global monthly spend split by publisher (header1), sourced from deliverySchedule on media_plan_versions
 * with billingSchedule as a fallback. Rules: booked/approved, highest version per MBA, current AU FY (Jul–Jun).
 */
export async function getGlobalMonthlyPublisherSpend(): Promise<GlobalMonthlyPublisherSpend[]> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  const versionsResponse = await apiClient.get(
    xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  )
  const allVersions = Array.isArray(versionsResponse.data) ? versionsResponse.data : []

  const versionsByMBA = allVersions.reduce((acc: Record<string, any[]>, version: any) => {
    const mbaNumber = version?.mba_number
    if (!mbaNumber) return acc
    acc[mbaNumber] = acc[mbaNumber] || []
    acc[mbaNumber].push(version)
    return acc
  }, {} as Record<string, any[]>)

  const highestApprovedVersionByMBA = Object.entries(versionsByMBA).reduce((acc: Record<string, any>, [mbaNumber, versions]: [string, any[]]) => {
    const sorted = versions
      .slice()
      .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))

    const bookedApproved = sorted.find((v: any) => isBookedApprovedCompleted(v.campaign_status))

    if (bookedApproved) {
      acc[mbaNumber] = bookedApproved
      return acc
    }

    if (sorted[0]) {
      acc[mbaNumber] = sorted[0]
    }
    return acc
  }, {} as Record<string, any>)

  const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
  fyMonths.forEach(month => { deliveryMonthlyMap[month] = {} })

  const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

  Object.values(highestApprovedVersionByMBA).forEach(version => {
    const schedule = normalizeSchedule(
      (version as any)?.deliverySchedule ||
        (version as any)?.delivery_schedule ||
        (version as any)?.billingSchedule ||
        (version as any)?.billing_schedule
    )
    if (!Array.isArray(schedule) || schedule.length === 0) return

    schedule.forEach(entry => {
      const monthDate = parseMonthYear(getMonthYearValue(entry))
      if (!monthDate || monthDate < fyStart || monthDate > fyEnd) return
      const monthLabel = monthLabelFromDate(monthDate)

      const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
      mediaTypes.forEach((mt: any) => {
        const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
        lineItems.forEach((li: any) => {
          const publisher = li?.header1 || 'Unspecified'
          const amount = parseMoney(li?.amount)
          if (amount <= 0) return
          deliveryMonthlyMap[monthLabel][publisher] = (deliveryMonthlyMap[monthLabel][publisher] || 0) + amount
        })
      })
    })
  })

  return fyMonths.map(month => ({
    month,
    data: Object.entries(deliveryMonthlyMap[month] || {})
      .map(([publisher, amount]) => ({ publisher, amount }))
      .filter(item => item.amount > 0)
  }))
}

/**
 * Global monthly spend split by client, sourced from deliverySchedule on media_plan_versions
 * with billingSchedule as fallback. Rules: booked/approved, highest version per MBA,
 * current AU FY (Jul–Jun). Attempts to use client brand colours from Xano clients table when available.
 */
export async function getGlobalMonthlyClientSpend(): Promise<{
  data: GlobalMonthlyClientSpend[]
  clientColors: Record<string, string>
}> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  // Fetch client colors map
  let clientColors: Record<string, string> = {}
  try {
    const clientsResp = await apiClient.get(xanoUrl("clients", "XANO_CLIENTS_BASE_URL"))
    const clients = Array.isArray(clientsResp.data) ? clientsResp.data : []
    clientColors = clients.reduce((acc: Record<string, string>, c: any) => {
      if (c.mp_client_name && c.brand_colour) {
        acc[c.mp_client_name] = c.brand_colour
      }
      return acc
    }, {})
  } catch (err) {
    console.warn('Global monthly client spend: unable to fetch client colors', err)
  }

  const versionsResponse = await apiClient.get(
    xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  )
  const allVersions = Array.isArray(versionsResponse.data) ? versionsResponse.data : []

  const versionsByMBA = allVersions.reduce((acc: Record<string, any[]>, version: any) => {
    const mbaNumber = version?.mba_number
    if (!mbaNumber) return acc
    acc[mbaNumber] = acc[mbaNumber] || []
    acc[mbaNumber].push(version)
    return acc
  }, {} as Record<string, any[]>)

  const highestApprovedVersionByMBA = Object.entries(versionsByMBA).reduce((acc: Record<string, any>, [mbaNumber, versions]: [string, any[]]) => {
    const sorted = versions
      .slice()
      .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))

    const bookedApproved = sorted.find((v: any) => isBookedApprovedCompleted(v.campaign_status))

    if (bookedApproved) {
      acc[mbaNumber] = bookedApproved
      return acc
    }

    if (sorted[0]) {
      acc[mbaNumber] = sorted[0]
    }
    return acc
  }, {} as Record<string, any>)

  const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
  fyMonths.forEach(month => { deliveryMonthlyMap[month] = {} })

  const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

  Object.values(highestApprovedVersionByMBA).forEach(version => {
    const clientName = version?.mp_client_name || 'Unspecified'
    const schedule = normalizeSchedule(
      (version as any)?.deliverySchedule ||
        (version as any)?.delivery_schedule ||
        (version as any)?.billingSchedule ||
        (version as any)?.billing_schedule
    )
    if (!Array.isArray(schedule) || schedule.length === 0) return

    schedule.forEach(entry => {
      const monthDate = parseMonthYear(getMonthYearValue(entry))
      if (!monthDate || monthDate < fyStart || monthDate > fyEnd) return
      const monthLabel = monthLabelFromDate(monthDate)

      const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
      mediaTypes.forEach((mt: any) => {
        const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
        const totalForType = lineItems.reduce((sum: number, li: any) => sum + parseMoney(li?.amount), 0)
        if (totalForType <= 0) return
        deliveryMonthlyMap[monthLabel][clientName] = (deliveryMonthlyMap[monthLabel][clientName] || 0) + totalForType
      })
    })
  })

  const data: GlobalMonthlyClientSpend[] = fyMonths.map(month => ({
    month,
    data: Object.entries(deliveryMonthlyMap[month] || {})
      .map(([client, amount]) => ({ client, amount }))
      .filter(item => item.amount > 0)
  }))

  return { data, clientColors }
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
