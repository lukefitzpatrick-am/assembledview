import { ClientDashboardData, Campaign, Client, GlobalMonthlySpend, GlobalMonthlyPublisherSpend, GlobalMonthlyClientSpend } from '@/lib/types/dashboard'
import { 
  aggregateMonthlySpendByMediaType, 
  getSpendByMediaTypeFromLineItems, 
  getSpendByCampaignFromLineItems 
} from './media-containers'
import axios from 'axios'

const XANO_CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8"
const XANO_MEDIAPLANS_BASE_URL = process.env.XANO_MEDIAPLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM"
const MEDIA_PLAN_MASTER_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
const MEDIA_PLANS_VERSIONS_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"

// Create axios instance with timeout
const apiClient = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
})

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

function slugifyClientName(name: string): string {
  return normalizeClientName(name).replace(/\s+/g, '-')
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

function parseMoney(value: any): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseMonthYear(monthYear: any): Date | null {
  if (typeof monthYear !== 'string') return null
  const parts = monthYear.trim().split(/\s+/)
  if (parts.length < 2) return null
  const [monthName, yearStr] = parts
  const monthIndex = [
    'january','february','march','april','may','june',
    'july','august','september','october','november','december'
  ].indexOf(monthName.toLowerCase())
  const yearNum = parseInt(yearStr, 10)
  if (monthIndex < 0 || isNaN(yearNum)) return null
  return new Date(yearNum, monthIndex, 1)
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  try {
    // Fetch all clients from Xano
    const response = await apiClient.get(`${XANO_CLIENTS_BASE_URL}/clients`)
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
    // Pull media plan versions and filter by client slug derived from mp_client_name
    const versionsResponse = await apiClient.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions`)
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

    if (clientVersions.length === 0) {
      console.warn('No media_plan_versions found for slug:', sanitizedSlug)
      return null
    }

    const clientName = clientVersions[0].mp_client_name || clientVersions[0].client_name || clientVersions[0].mp_clientname || sanitizedSlug
    const brandColour = clientVersions[0].brand_colour || clientVersions[0].brandColour

    console.log('Dashboard: using client from media_plan_versions', { clientName, slug: targetSlug, versions: clientVersions.length })

    // Keep only booked/approved and highest version per MBA
    const versionsByMBA = clientVersions.reduce((acc: Record<string, any[]>, version: any) => {
      const mbaNumber = version.mba_number
      if (!mbaNumber) return acc
      acc[mbaNumber] = acc[mbaNumber] || []
      acc[mbaNumber].push(version)
      return acc
    }, {})

    const selectedVersionByMBA: Record<string, any> = {}

    Object.entries(versionsByMBA).forEach(([mbaNumber, versions]) => {
      const sorted = versions
        .slice()
        .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))

      const bookedApproved = sorted.find((v: any) => {
        const status = normalizeStatus(v.campaign_status)
        return status === 'booked' || status === 'approved'
      })

      const chosenVersion = bookedApproved || sorted[0]

      if (chosenVersion) {
        selectedVersionByMBA[mbaNumber] = chosenVersion
      }

      if (!bookedApproved && sorted[0]) {
        console.warn(`No booked/approved version found for MBA ${mbaNumber}; using latest version ${sorted[0]?.version_number ?? 'n/a'} for dashboard lists`)
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
    const thirtyDaysAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    const startOfYear = new Date(currentDate.getFullYear(), 0, 1)
    const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(currentDate)

    // Calculate metrics (unchanged from previous behaviour)
    const liveCampaigns = clientCampaigns.filter(campaign => {
      const status = normalizeStatus(campaign.status)
      return (status === 'approved' || status === 'booked') &&
        new Date(campaign.startDate) <= currentDate && 
        new Date(campaign.endDate) >= currentDate
    })

    const totalCampaignsYTD = clientCampaigns.filter(campaign => 
      new Date(campaign.startDate) >= startOfYear
    ).length

    const spendPast30Days = clientCampaigns
      .filter(campaign => {
        const campaignStart = new Date(campaign.startDate)
        const campaignEnd = new Date(campaign.endDate)
        return campaignStart <= currentDate && campaignEnd >= thirtyDaysAgo
      })
      .reduce((sum, campaign) => {
        const campaignStart = new Date(campaign.startDate)
        const campaignEnd = new Date(campaign.endDate)
        
        const totalCampaignDays = Math.ceil((campaignEnd.getTime() - campaignStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        
        const overlapStart = new Date(Math.max(campaignStart.getTime(), thirtyDaysAgo.getTime()))
        const overlapEnd = new Date(Math.min(campaignEnd.getTime(), currentDate.getTime()))
        const overlapDays = Math.max(0, Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
        
        const dailyRate = totalCampaignDays > 0 ? campaign.budget / totalCampaignDays : 0
        const proratedSpend = dailyRate * overlapDays
        
        return sum + proratedSpend
      }, 0)

    const spentYTD = clientCampaigns
      .filter(campaign => {
        const campaignStart = new Date(campaign.startDate)
        return campaignStart >= startOfYear && campaignStart <= currentDate
      })
      .reduce((sum, campaign) => sum + campaign.budget, 0)

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

    // Filter to only booked/approved campaigns for spend analytics
    const bookedApprovedCampaigns = clientCampaigns.filter(campaign => {
      const status = normalizeStatus(campaign.status)
      return status === 'booked' || status === 'approved'
    })

    const mbaNumbers = [...new Set(bookedApprovedCampaigns.map(campaign => campaign.mbaNumber))]
    const versionNumbers = bookedApprovedCampaigns.reduce((acc, campaign) => {
      acc[campaign.mbaNumber] = parseInt(campaign.versionNumber.replace('v', '')) || 1
      return acc
    }, {} as Record<string, number>)

    // Primary data source: deliverySchedule (fallback to billingSchedule if missing)
    const dateRange = { start: fyStart, end: fyEnd }
    const deliveryScheduleByMBA: Record<string, any[]> = Object.entries(selectedVersionByMBA).reduce((acc, [mba, version]) => {
      const schedule =
        (version as any)?.deliverySchedule ||
        (version as any)?.delivery_schedule ||
        (version as any)?.billingSchedule ||
        (version as any)?.billing_schedule
      if (Array.isArray(schedule)) acc[mba] = schedule
      return acc
    }, {} as Record<string, any[]>)

    const deliveryMediaTypeSpend: Record<string, number> = {}
    const deliveryCampaignSpend: Record<string, number> = {}
    const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
    fyMonths.forEach(month => { deliveryMonthlyMap[month] = {} })

    const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

    bookedApprovedCampaigns.forEach(campaign => {
      const schedule = deliveryScheduleByMBA[campaign.mbaNumber]
      if (!Array.isArray(schedule)) return

      schedule.forEach(entry => {
        const monthDate = parseMonthYear(entry?.monthYear)
        if (!monthDate || monthDate < fyStart || monthDate > fyEnd) return
        const monthLabel = monthLabelFromDate(monthDate)

        const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
        mediaTypes.forEach((mt: any) => {
          const mediaTypeName = mt?.mediaType || 'Unspecified'
          const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
          const totalForType = lineItems.reduce((sum: number, li: any) => sum + parseMoney(li?.amount), 0)
          if (totalForType <= 0) return

          deliveryMediaTypeSpend[mediaTypeName] = (deliveryMediaTypeSpend[mediaTypeName] || 0) + totalForType
          deliveryCampaignSpend[campaign.campaignName || campaign.mbaNumber] = (deliveryCampaignSpend[campaign.campaignName || campaign.mbaNumber] || 0) + totalForType
          deliveryMonthlyMap[monthLabel][mediaTypeName] = (deliveryMonthlyMap[monthLabel][mediaTypeName] || 0) + totalForType
        })
      })
    })

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

    // Fallbacks when delivery schedule yields no spend but we still have booked/approved campaigns
    if (spendByMediaType.length === 0 || spendByCampaign.length === 0 || monthlySpend.every(m => (m.data || []).length === 0)) {
      const fallbackMediaTypeSpend: Record<string, number> = {}
      const fallbackCampaignSpend: Record<string, number> = {}
      const monthlyMap: Record<string, Record<string, number>> = {}
      fyMonths.forEach(month => { monthlyMap[month] = {} })

      const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]
      
      bookedApprovedCampaigns.forEach(campaign => {
        const campaignStartRaw = parseDateSafe(campaign.startDate) || fyStart
        const campaignEndRaw = parseDateSafe(campaign.endDate) || fyEnd
        const mediaTypes = campaign.mediaTypes.length > 0 ? campaign.mediaTypes : ['Unspecified']

        // Clamp to FY window
        let overlapStart = new Date(Math.max(campaignStartRaw.getTime(), fyStart.getTime()))
        let overlapEnd = new Date(Math.min(campaignEndRaw.getTime(), fyEnd.getTime()))

        // If dates are inverted or no overlap, still allocate whole budget evenly across FY
        if (overlapEnd < overlapStart) {
          overlapStart = fyStart
          overlapEnd = fyEnd
        }

        const totalCampaignDays = Math.max(1, Math.ceil((campaignEndRaw.getTime() - campaignStartRaw.getTime()) / (1000 * 60 * 60 * 24)) + 1)
        const overlapDays = Math.max(1, Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
        const dailyRate = totalCampaignDays > 0 ? campaign.budget / totalCampaignDays : 0
        const proratedBudget = dailyRate * overlapDays

        fallbackCampaignSpend[`${campaign.campaignName} (${campaign.mbaNumber})`] = (fallbackCampaignSpend[`${campaign.campaignName} (${campaign.mbaNumber})`] || 0) + (proratedBudget || campaign.budget || 0)

        const mediaSplit = (proratedBudget || campaign.budget || 0) / mediaTypes.length
        mediaTypes.forEach(type => {
          fallbackMediaTypeSpend[type] = (fallbackMediaTypeSpend[type] || 0) + mediaSplit
        })

        // Monthly allocation across overlap window
        let cursor = new Date(overlapStart)
        while (cursor <= overlapEnd) {
          const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
          const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
          const segStart = cursor
          const segEnd = new Date(Math.min(monthEnd.getTime(), overlapEnd.getTime()))
          const segDays = Math.max(1, Math.ceil((segEnd.getTime() - segStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
          const segAmount = (dailyRate || 0) * segDays || mediaSplit
          const monthLabel = monthLabelFromDate(segStart)

          mediaTypes.forEach(type => {
            const share = segAmount / mediaTypes.length
            monthlyMap[monthLabel][type] = (monthlyMap[monthLabel][type] || 0) + share
          })

          // Move cursor to first day of next month
          cursor = new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, 1)
        }
      })

      const fallbackTotal = Object.values(fallbackMediaTypeSpend).reduce((sum, n) => sum + n, 0)

      if (spendByMediaType.length === 0 && fallbackTotal > 0) {
        spendByMediaType = Object.entries(fallbackMediaTypeSpend)
          .map(([mediaType, amount]) => ({
            mediaType,
            amount,
            percentage: fallbackTotal > 0 ? (amount / fallbackTotal) * 100 : 0
          }))
          .filter(item => item.amount > 0)
          .sort((a, b) => b.amount - a.amount)
      }

      if (spendByCampaign.length === 0 && Object.keys(fallbackCampaignSpend).length > 0) {
        const totalSpend = Object.values(fallbackCampaignSpend).reduce((sum, n) => sum + n, 0)
        spendByCampaign = Object.entries(fallbackCampaignSpend)
          .map(([campaignName, amount]) => ({
            campaignName: campaignName.split(' (')[0],
            mbaNumber: campaignName.match(/\(([^)]+)\)/)?.[1] || '',
            amount,
            percentage: totalSpend > 0 ? (amount / totalSpend) * 100 : 0
          }))
          .filter(item => item.amount > 0)
          .sort((a, b) => b.amount - a.amount)
      }

      const monthlyHasData = monthlySpend.some(m => (m.data || []).some(d => d.amount > 0))
      if (!monthlyHasData) {
        monthlySpend = fyMonths.map(month => ({
          month,
          data: Object.entries(monthlyMap[month] || {})
            .map(([mediaType, amount]) => ({ mediaType, amount }))
            .filter(item => item.amount > 0)
        }))
      }
    }

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
      spentYTD,
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

  const versionsResponse = await apiClient.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions`)
  const allVersions = Array.isArray(versionsResponse.data) ? versionsResponse.data : []

  const versionsByMBA = allVersions.reduce((acc: Record<string, any[]>, version: any) => {
    const mbaNumber = version?.mba_number
    if (!mbaNumber) return acc
    acc[mbaNumber] = acc[mbaNumber] || []
    acc[mbaNumber].push(version)
    return acc
  }, {})

  const highestApprovedVersionByMBA = Object.entries(versionsByMBA).reduce((acc: Record<string, any>, [mbaNumber, versions]) => {
    const sorted = versions
      .slice()
      .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))

    const bookedApproved = sorted.find((v: any) => {
      const status = normalizeStatus(v.campaign_status)
      return status === 'booked' || status === 'approved'
    })

    if (bookedApproved) {
      acc[mbaNumber] = bookedApproved
    }
    return acc
  }, {} as Record<string, any>)

  const deliveryMonthlyMap: Record<string, number> = {}
  fyMonths.forEach(month => { deliveryMonthlyMap[month] = 0 })

  const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

  Object.values(highestApprovedVersionByMBA).forEach(version => {
    const schedule =
      (version as any)?.deliverySchedule ||
      (version as any)?.delivery_schedule ||
      (version as any)?.billingSchedule ||
      (version as any)?.billing_schedule
    if (!Array.isArray(schedule)) return

    schedule.forEach(entry => {
      const monthDate = parseMonthYear(entry?.monthYear)
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

  const versionsResponse = await apiClient.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions`)
  const allVersions = Array.isArray(versionsResponse.data) ? versionsResponse.data : []

  const versionsByMBA = allVersions.reduce((acc: Record<string, any[]>, version: any) => {
    const mbaNumber = version?.mba_number
    if (!mbaNumber) return acc
    acc[mbaNumber] = acc[mbaNumber] || []
    acc[mbaNumber].push(version)
    return acc
  }, {})

  const highestApprovedVersionByMBA = Object.entries(versionsByMBA).reduce((acc: Record<string, any>, [mbaNumber, versions]) => {
    const sorted = versions
      .slice()
      .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))

    const bookedApproved = sorted.find((v: any) => {
      const status = normalizeStatus(v.campaign_status)
      return status === 'booked' || status === 'approved'
    })

    if (bookedApproved) {
      acc[mbaNumber] = bookedApproved
    }
    return acc
  }, {} as Record<string, any>)

  const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
  fyMonths.forEach(month => { deliveryMonthlyMap[month] = {} })

  const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

  Object.values(highestApprovedVersionByMBA).forEach(version => {
    const schedule =
      (version as any)?.deliverySchedule ||
      (version as any)?.delivery_schedule ||
      (version as any)?.billingSchedule ||
      (version as any)?.billing_schedule
    if (!Array.isArray(schedule)) return

    schedule.forEach(entry => {
      const monthDate = parseMonthYear(entry?.monthYear)
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
    const clientsResp = await apiClient.get(`${XANO_CLIENTS_BASE_URL}/clients`)
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

  const versionsResponse = await apiClient.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions`)
  const allVersions = Array.isArray(versionsResponse.data) ? versionsResponse.data : []

  const versionsByMBA = allVersions.reduce((acc: Record<string, any[]>, version: any) => {
    const mbaNumber = version?.mba_number
    if (!mbaNumber) return acc
    acc[mbaNumber] = acc[mbaNumber] || []
    acc[mbaNumber].push(version)
    return acc
  }, {})

  const highestApprovedVersionByMBA = Object.entries(versionsByMBA).reduce((acc: Record<string, any>, [mbaNumber, versions]) => {
    const sorted = versions
      .slice()
      .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))

    const bookedApproved = sorted.find((v: any) => {
      const status = normalizeStatus(v.campaign_status)
      return status === 'booked' || status === 'approved'
    })

    if (bookedApproved) {
      acc[mbaNumber] = bookedApproved
    }
    return acc
  }, {} as Record<string, any>)

  const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
  fyMonths.forEach(month => { deliveryMonthlyMap[month] = {} })

  const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

  Object.values(highestApprovedVersionByMBA).forEach(version => {
    const clientName = version?.mp_client_name || 'Unspecified'
    const schedule =
      (version as any)?.deliverySchedule ||
      (version as any)?.delivery_schedule ||
      (version as any)?.billingSchedule ||
      (version as any)?.billing_schedule
    if (!Array.isArray(schedule)) return

    schedule.forEach(entry => {
      const monthDate = parseMonthYear(entry?.monthYear)
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
  csvRows.push(`Spent YTD,${data.spentYTD}`)
  
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
