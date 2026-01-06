import axios from 'axios'

const MEDIA_PLANS_VERSIONS_URL = process.env.XANO_MEDIA_CONTAINERS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"

// Track which "no data" messages have already been logged to avoid spam
const missingLineItemsLogCache = new Set<string>()

function buildMediaContainerUrl(
  mediaType: keyof typeof MEDIA_CONTAINER_ENDPOINTS,
  mbaNumber: string,
  versionNumber?: number
) {
  // Query by BOTH mba_number AND version_number when available
  // This ensures we get exact matches instead of filtering in JavaScript
  const params = new URLSearchParams()
  params.append('mba_number', mbaNumber.trim())
  
  // Include version_number, mp_plannumber, and media_plan_version parameters when versionNumber is provided
  if (versionNumber !== undefined && versionNumber !== null) {
    params.append('version_number', String(versionNumber))
    params.append('mp_plannumber', String(versionNumber))
    params.append('media_plan_version', String(versionNumber))
  }

  return `${MEDIA_PLANS_VERSIONS_URL}/${MEDIA_CONTAINER_ENDPOINTS[mediaType]}?${params.toString()}`
}

// Create axios instance with timeout
const apiClient = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
})

export interface MediaContainerLineItem {
  id: number
  mba_number: string
  media_plan_version: number
  placement_date?: string
  start_date?: string
  end_date?: string
  budget?: number
  cost?: number
  spend?: number
  investment?: number
  [key: string]: any // For flexibility with different media type fields
}

export interface MonthlyMediaSpend {
  month: string
  data: Array<{
    mediaType: string
    amount: number
  }>
}

export interface SpendFilterOptions {
  dateRange?: {
    start: Date
    end: Date
  }
  monthsOrder?: string[]
}

// Media container endpoints mapping
const MEDIA_CONTAINER_ENDPOINTS = {
  television: 'television_line_items',
  radio: 'radio_line_items',
  newspaper: 'newspaper_line_items',
  magazines: 'magazines_line_items',
  ooh: 'ooh_line_items',
  cinema: 'cinema_line_items',
  digitalDisplay: 'digital_display_line_items',
  digitalAudio: 'digital_audio_line_items',
  digitalVideo: 'digital_video_line_items',
  bvod: 'bvod_line_items',
  integration: 'integration_line_items',
  search: 'search_line_items',
  socialMedia: 'social_media_line_items',
  progDisplay: 'prog_display_line_items',
  progVideo: 'prog_video_line_items',
  progBvod: 'prog_bvod_line_items',
  progAudio: 'prog_audio_line_items',
  progOoh: 'prog_ooh_line_items',
  influencers: 'influencers_line_items',
  production: 'media_plan_production',
}

// Media type mapping for display
const MEDIA_TYPE_DISPLAY_NAMES = {
  television: 'Television',
  radio: 'Radio',
  newspaper: 'Newspaper',
  magazines: 'Magazines',
  ooh: 'OOH',
  cinema: 'Cinema',
  digitalDisplay: 'Digital Display',
  digitalAudio: 'Digital Audio',
  digitalVideo: 'Digital Video',
  bvod: 'BVOD',
  integration: 'Integration',
  search: 'Search',
  socialMedia: 'Social Media',
  progDisplay: 'Programmatic Display',
  progVideo: 'Programmatic Video',
  progBvod: 'Programmatic BVOD',
  progAudio: 'Programmatic Audio',
  progOoh: 'Programmatic OOH',
  influencers: 'Influencers',
  production: 'Production',
}

/**
 * Fetch line items for a specific media type and MBA number
 * Queries with BOTH mba_number AND version_number when available, then filters in JavaScript as safety net
 * This ensures we check ALL entries and don't stop at the first match
 */
export async function fetchMediaContainerLineItems(
  mediaType: keyof typeof MEDIA_CONTAINER_ENDPOINTS,
  mbaNumber: string,
  versionNumber?: number
): Promise<MediaContainerLineItem[]> {
  if (!mbaNumber) {
    console.warn(`Skipping ${mediaType} line items fetch - missing mbaNumber`)
    return []
  }
  try {
    // Primary fetch with version filters
    const url = buildMediaContainerUrl(mediaType, mbaNumber, versionNumber)
    const response = await apiClient.get(url)
    const allItems = Array.isArray(response.data) ? response.data : []
    
    // Helper to normalize and match version fields
    const matchesVersion = (item: any, ver: number) => {
      const itemVersion = typeof item.version_number === 'string' 
        ? parseInt(item.version_number, 10) 
        : item.version_number
      const itemPlan = typeof item.mp_plannumber === 'string'
        ? parseInt(item.mp_plannumber, 10)
        : item.mp_plannumber
      const itemMediaPlan = typeof item.media_plan_version === 'string'
        ? parseInt(item.media_plan_version, 10)
        : item.media_plan_version
      return itemVersion === ver || itemPlan === ver || itemMediaPlan === ver
    }

    // Filter by version fields + mba_number as safety net
    const filteredPrimary = (versionNumber !== undefined && versionNumber !== null)
      ? allItems.filter((item: any) => matchesVersion(item, versionNumber) && item.mba_number === mbaNumber)
      : allItems.filter((item: any) => item.mba_number === mbaNumber)
    
    // Fallback: if we expected a version match but got nothing, refetch without version filters.
    // Keep MBA matches, preferring version matches but allowing items with missing version fields as last resort.
    if ((versionNumber !== undefined && versionNumber !== null) && filteredPrimary.length === 0) {
      try {
        const fallbackUrl = buildMediaContainerUrl(mediaType, mbaNumber, undefined)
        const fallbackResponse = await apiClient.get(fallbackUrl)
        const fallbackItems = Array.isArray(fallbackResponse.data) ? fallbackResponse.data : []
        const filteredFallback = fallbackItems.filter((item: any) => {
          const mbaMatch = item.mba_number === mbaNumber
          const versionMatch = matchesVersion(item, versionNumber)
          const versionUnset = !item.version_number && !item.mp_plannumber && !item.media_plan_version
          return mbaMatch && (versionMatch || versionUnset)
        })
        if (filteredFallback.length > 0) {
          console.info(`[${mediaType}] Fallback fetched ${filteredFallback.length} items without version filter for mba_number=${mbaNumber}, version=${versionNumber}`)
        }
        return filteredFallback
      } catch (fallbackErr) {
        console.warn(`[${mediaType}] Fallback fetch without version failed`, fallbackErr)
      }
    }

    if (versionNumber !== undefined && versionNumber !== null && filteredPrimary.length !== allItems.length) {
      console.log(`[${mediaType}] Filtered ${allItems.length} items to ${filteredPrimary.length} matching mba_number=${mbaNumber} and version=${versionNumber}`)
    }
    
    return filteredPrimary
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      const cacheKey = `${mediaType}:${mbaNumber}:${versionNumber ?? 'latest'}`
      if (!missingLineItemsLogCache.has(cacheKey)) {
        missingLineItemsLogCache.add(cacheKey)
        console.info(`Line items not found for ${mediaType} (404)`, {
          mbaNumber,
          versionNumber: versionNumber ?? 'latest',
          url: error.config?.url
        })
      } else {
        console.debug(`Suppressing repeated 404 log for ${mediaType}`, {
          mbaNumber,
          versionNumber: versionNumber ?? 'latest'
        })
      }
      return []
    }
    console.error(`Error fetching ${mediaType} line items:`, error)
    return []
  }
}

/**
 * Fetch all line items for a given MBA number across all media types
 */
export async function fetchAllMediaContainerLineItems(
  mbaNumber: string,
  versionNumber?: number
): Promise<Record<string, MediaContainerLineItem[]>> {
  const results: Record<string, MediaContainerLineItem[]> = {}
  
  // Fetch all media types in parallel
  const promises = Object.keys(MEDIA_CONTAINER_ENDPOINTS).map(async (mediaType) => {
    const lineItems = await fetchMediaContainerLineItems(
      mediaType as keyof typeof MEDIA_CONTAINER_ENDPOINTS,
      mbaNumber,
      versionNumber
    )
    return { mediaType, lineItems }
  })
  
  const responses = await Promise.all(promises)
  
  responses.forEach(({ mediaType, lineItems }) => {
    results[mediaType] = lineItems
  })
  
  return results
}

/**
 * Extract spend amount from line item (handles different field names)
 * Priority: totalMedia (from media containers) > grossMedia > other fields
 */
function extractSpendAmount(lineItem: MediaContainerLineItem): number {
  // Priority order: totalMedia and grossMedia are the primary fields from media containers
  const spendFields = ['totalMedia', 'grossMedia', 'spend', 'budget', 'cost', 'investment', 'amount', 'value', 'deliverablesAmount']
  
  for (const field of spendFields) {
    if (lineItem[field] !== undefined && lineItem[field] !== null) {
      if (typeof lineItem[field] === 'number') {
        return lineItem[field]
      }
      if (typeof lineItem[field] === 'string') {
        const num = parseFloat(String(lineItem[field]).replace(/[^0-9.-]+/g, '')) || 0
        if (num > 0) return num
      }
    }
  }
  
  return 0
}

/**
 * Extract date from line item (handles different field names)
 */
function extractDate(lineItem: MediaContainerLineItem): Date | null {
  const dateFields = ['placement_date', 'start_date', 'end_date', 'date', 'created_at']
  
  for (const field of dateFields) {
    if (lineItem[field]) {
      const date = new Date(lineItem[field])
      if (!isNaN(date.getTime())) {
        return date
      }
    }
  }
  
  return null
}

/**
 * Aggregate monthly spend data from line items
 */
export async function aggregateMonthlySpendByMediaType(
  mbaNumbers: string[],
  versionNumbers?: Record<string, number>,
  options: SpendFilterOptions = {}
): Promise<MonthlyMediaSpend[]> {
  const { dateRange, monthsOrder } = options
  const monthlyData: Record<string, Record<string, number>> = {}
  
  // Initialize months for requested order (defaults to calendar order)
  const months = monthsOrder && monthsOrder.length > 0
    ? monthsOrder
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const calendarMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  
  months.forEach(month => {
    monthlyData[month] = {}
  })
  
  // Process each MBA number
  for (const mbaNumber of mbaNumbers) {
    const versionNumber = versionNumbers?.[mbaNumber]
    const allLineItems = await fetchAllMediaContainerLineItems(mbaNumber, versionNumber)
    
    // Process each media type
    Object.entries(allLineItems).forEach(([mediaType, lineItems]) => {
      const displayName = MEDIA_TYPE_DISPLAY_NAMES[mediaType as keyof typeof MEDIA_TYPE_DISPLAY_NAMES] || mediaType
      
      lineItems.forEach(lineItem => {
        const spendAmount = extractSpendAmount(lineItem)
        const date = extractDate(lineItem)
        
        const isInRange = !dateRange || (date && date >= dateRange.start && date <= dateRange.end)
        
        if (spendAmount > 0 && date && isInRange) {
          const monthIndex = date.getMonth()
          const monthName = monthsOrder && monthsOrder.length === 12
            ? monthsOrder[(monthIndex + 12 - 6) % 12] // shift so July (6) maps to index 0
            : calendarMonths[monthIndex]
          
          if (!monthlyData[monthName][displayName]) {
            monthlyData[monthName][displayName] = 0
          }
          
          monthlyData[monthName][displayName] += spendAmount
        }
      })
    })
  }
  
  // Convert to the expected format
  return months.map(month => ({
    month,
    data: Object.entries(monthlyData[month] || {})
      .map(([mediaType, amount]) => ({ mediaType, amount }))
      .filter(item => item.amount > 0)
  }))
}

/**
 * Get spend by media type from line items
 */
export async function getSpendByMediaTypeFromLineItems(
  mbaNumbers: string[],
  versionNumbers?: Record<string, number>,
  options: SpendFilterOptions = {}
): Promise<Array<{ mediaType: string; amount: number; percentage: number }>> {
  const { dateRange } = options
  const mediaTypeSpend: Record<string, number> = {}
  
  // Process each MBA number
  for (const mbaNumber of mbaNumbers) {
    const versionNumber = versionNumbers?.[mbaNumber]
    const allLineItems = await fetchAllMediaContainerLineItems(mbaNumber, versionNumber)
    
    // Process each media type
    Object.entries(allLineItems).forEach(([mediaType, lineItems]) => {
      const displayName = MEDIA_TYPE_DISPLAY_NAMES[mediaType as keyof typeof MEDIA_TYPE_DISPLAY_NAMES] || mediaType
      
      const totalSpend = lineItems.reduce((sum, lineItem) => {
        const date = extractDate(lineItem)
        const isInRange = !dateRange || (date && date >= dateRange.start && date <= dateRange.end)
        if (!isInRange) return sum

        return sum + extractSpendAmount(lineItem)
      }, 0)
      
      if (!mediaTypeSpend[displayName]) {
        mediaTypeSpend[displayName] = 0
      }
      
      mediaTypeSpend[displayName] += totalSpend
    })
  }
  
  const totalSpend = Object.values(mediaTypeSpend).reduce((sum, amount) => sum + amount, 0)
  
  return Object.entries(mediaTypeSpend)
    .map(([mediaType, amount]) => ({
      mediaType,
      amount,
      percentage: totalSpend > 0 ? (amount / totalSpend) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Get spend by campaign from line items
 */
export async function getSpendByCampaignFromLineItems(
  campaigns: Array<{ mbaNumber: string; campaignName: string; versionNumber?: number }>,
  options: SpendFilterOptions = {}
): Promise<Array<{ campaignName: string; mbaNumber: string; amount: number; percentage: number }>> {
  const { dateRange } = options
  const campaignSpend: Record<string, number> = {}
  
  // Process each campaign
  for (const campaign of campaigns) {
    const allLineItems = await fetchAllMediaContainerLineItems(
      campaign.mbaNumber, 
      campaign.versionNumber
    )
    
    const totalSpend = Object.values(allLineItems).reduce((sum, lineItems) => {
      return sum + lineItems.reduce((lineSum, lineItem) => {
        const date = extractDate(lineItem)
        const isInRange = !dateRange || (date && date >= dateRange.start && date <= dateRange.end)
        if (!isInRange) return lineSum

        return lineSum + extractSpendAmount(lineItem)
      }, 0)
    }, 0)
    
    campaignSpend[`${campaign.campaignName} (${campaign.mbaNumber})`] = totalSpend
  }
  
  const totalSpend = Object.values(campaignSpend).reduce((sum, amount) => sum + amount, 0)
  
  return Object.entries(campaignSpend)
    .map(([campaignName, amount]) => ({
      campaignName: campaignName.split(' (')[0],
      mbaNumber: campaignName.match(/\(([^)]+)\)/)?.[1] || '',
      amount,
      percentage: totalSpend > 0 ? (amount / totalSpend) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount)
}

