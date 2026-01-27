import { parse, format, startOfMonth, endOfMonth, isWithinInterval, getDaysInMonth } from "date-fns"

export interface FinanceLineItem {
  itemCode: string
  mediaType: string
  description: string
  amount: number
}

export interface FinanceServiceRow {
  itemCode: string
  service: string
  amount: number
}

export interface FinanceCampaignData {
  clientName: string
  mbaNumber: string
  poNumber?: string
  campaignName: string
  paymentDays: number
  paymentTerms: string
  invoiceDate: string
  lineItems: FinanceLineItem[]
  serviceRows: FinanceServiceRow[]
  total: number
}

export interface BillingScheduleEntry {
  monthYear: string
  mediaTypes?: Array<{
    // Billing schedule payloads vary; tolerate multiple property names.
    mediaType?: string
    media_type?: string
    type?: string
    name?: string
    lineItems: Array<{
      lineItemId: string
      header1: string
      header2: string
      amount: string
    }>
  }>
  adservingTechFees?: string
  production?: string
  feeTotal?: string
}

/**
 * Merge duplicate finance line items by exact match on:
 * - itemCode
 * - mediaType
 * - description
 *
 * Amounts are summed and rounded to 2 decimals.
 * Order is preserved (first occurrence wins).
 */
export function mergeFinanceLineItems(items: FinanceLineItem[]): FinanceLineItem[] {
  if (!items || items.length === 0) return []

  const byKey = new Map<string, FinanceLineItem>()
  const merged: FinanceLineItem[] = []

  for (const item of items) {
    const key = `${item.itemCode}||${item.mediaType}||${item.description}`
    const existing = byKey.get(key)
    if (!existing) {
      const copy: FinanceLineItem = {
        itemCode: item.itemCode,
        mediaType: item.mediaType,
        description: item.description,
        amount: item.amount,
      }
      byKey.set(key, copy)
      merged.push(copy)
      continue
    }

    existing.amount += item.amount
  }

  // Round to 2dp to keep currency display/export stable
  for (const item of merged) {
    item.amount = Math.round(item.amount * 100) / 100
  }

  return merged
}

/**
 * Get the last day of a given month/year
 */
export function getLastDayOfMonth(year: number, month: number): Date {
  return endOfMonth(new Date(year, month - 1, 1))
}

/**
 * Format invoice date as last day of selected month
 */
export function formatInvoiceDate(year: number, month: number): string {
  const lastDay = getLastDayOfMonth(year, month)
  return format(lastDay, "yyyy-MM-dd")
}

/**
 * Build item code based on billing agency and media type
 */
export function buildItemCode(
  billingAgency: string | null | undefined,
  mediaType: string
): string {
  const prefix = billingAgency === "advertising associates" ? "G" : "D"
  // Remove spaces from media type for item code
  const cleanMediaType = mediaType.replace(/\s+/g, "")
  return `${prefix}.${cleanMediaType}`
}

/**
 * Get media type display name (container name)
 */
export function getMediaTypeDisplayName(mediaTypeKey: string): string {
  const displayNames: Record<string, string> = {
    television: "Television",
    radio: "Radio",
    newspaper: "Newspaper",
    magazines: "Magazines",
    ooh: "OOH",
    cinema: "Cinema",
    digitalDisplay: "Digital Display",
    digitalAudio: "Digital Audio",
    digitalVideo: "Digital Video",
    bvod: "BVOD",
    integration: "Integration",
    search: "Search",
    socialMedia: "Social Media",
    progDisplay: "Programmatic Display",
    progVideo: "Programmatic Video",
    progBvod: "Programmatic BVOD",
    progAudio: "Programmatic Audio",
    progOoh: "Programmatic OOH",
    influencers: "Influencers",
  }
  return displayNames[mediaTypeKey] || mediaTypeKey
}

/**
 * Build description based on media type and line item fields
 */
export function buildDescription(
  mediaTypeKey: string,
  lineItem: any
): string {
  const parts: string[] = []

  // TV/Radio: Network & Station
  if (mediaTypeKey === "television" || mediaTypeKey === "radio") {
    if (lineItem.network) parts.push(lineItem.network)
    if (lineItem.station) parts.push(lineItem.station)
  }
  // Print: Network & Title
  else if (mediaTypeKey === "newspaper" || mediaTypeKey === "magazines") {
    if (lineItem.network) parts.push(lineItem.network)
    if (lineItem.title) parts.push(lineItem.title)
  }
  // Digital: Publisher & Site
  else if (
    ["digitalDisplay", "digitalAudio", "digitalVideo", "bvod", "integration"].includes(
      mediaTypeKey
    )
  ) {
    if (lineItem.publisher) parts.push(lineItem.publisher)
    if (lineItem.site) parts.push(lineItem.site)
  }
  // Programmatic: Platform & Targeting
  else if (
    [
      "progDisplay",
      "progVideo",
      "progBvod",
      "progAudio",
      "progOoh",
    ].includes(mediaTypeKey)
  ) {
    if (lineItem.platform) parts.push(lineItem.platform)
    // Finance requirement: description should be Platform + Targeting (not Platform + Bid Strategy)
    const targeting =
      lineItem.targeting ??
      lineItem.creative_targeting ??
      lineItem.creativeTargeting ??
      lineItem.targeting_attribute ??
      lineItem.targetingAttribute
    if (targeting) parts.push(targeting)
  }
  // Search/Social: Platform & Targeting
  else if (mediaTypeKey === "search" || mediaTypeKey === "socialMedia") {
    if (lineItem.platform) parts.push(lineItem.platform)
    // Finance requirement: description should be Platform + Targeting (not Platform + Bid Strategy)
    const targeting =
      lineItem.targeting ??
      lineItem.creative_targeting ??
      lineItem.creativeTargeting ??
      lineItem.targeting_attribute ??
      lineItem.targetingAttribute
    if (targeting) parts.push(targeting)
  }
  // Cinema/OOH: Network & Format
  else if (mediaTypeKey === "cinema" || mediaTypeKey === "ooh") {
    if (lineItem.network) parts.push(lineItem.network)
    if (lineItem.format) parts.push(lineItem.format)
  }
  // Influencers: Publisher & Site (similar to digital)
  else if (mediaTypeKey === "influencers") {
    if (lineItem.publisher) parts.push(lineItem.publisher)
    if (lineItem.site) parts.push(lineItem.site)
  }

  return parts.filter(Boolean).join(" ")
}

/**
 * Calculate monthly amount from line item bursts
 */
export function calculateMonthlyAmountFromBursts(
  bursts: any,
  selectedYear: number,
  selectedMonth: number
): number {
  if (!bursts) return 0

  let total = 0
  const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1, 1))
  const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1, 1))

  // Parse bursts if it's a JSON string
  let burstArray: any[] = []
  if (typeof bursts === "string") {
    try {
      const parsed = JSON.parse(bursts)
      burstArray = Array.isArray(parsed) ? parsed : [parsed]
    } catch (e) {
      console.warn("Failed to parse bursts JSON:", e)
      return 0
    }
  } else if (Array.isArray(bursts)) {
    burstArray = bursts
  } else if (bursts && typeof bursts === "object") {
    burstArray = [bursts]
  }

  burstArray.forEach((burst: any) => {
    if (!burst.startDate && !burst.start_date) return
    if (!burst.endDate && !burst.end_date) return

    const burstStart = new Date(burst.startDate || burst.start_date)
    const burstEnd = new Date(burst.endDate || burst.end_date)

    // Validate dates
    if (isNaN(burstStart.getTime()) || isNaN(burstEnd.getTime())) return

    // Check if burst overlaps with selected month
    if (burstEnd < monthStart || burstStart > monthEnd) return

    // Calculate overlap
    const overlapStart = burstStart > monthStart ? burstStart : monthStart
    const overlapEnd = burstEnd < monthEnd ? burstEnd : monthEnd

    // Calculate days in burst and overlap
    const totalBurstDays =
      Math.ceil((burstEnd.getTime() - burstStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const overlapDays =
      Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Get burst amount (could be budget, cost, spend, investment, etc.)
    // Also handle string amounts that need parsing
    let burstAmount =
      burst.budget ||
      burst.cost ||
      burst.spend ||
      burst.investment ||
      burst.amount ||
      burst.totalAmount ||
      0

    // If amount is a string, try to parse it
    if (typeof burstAmount === "string") {
      burstAmount = parseFloat(burstAmount.replace(/[^0-9.-]/g, "")) || 0
    }

    // Calculate proportional amount for this month
    if (totalBurstDays > 0 && burstAmount > 0) {
      const monthlyAmount = (burstAmount / totalBurstDays) * overlapDays
      total += monthlyAmount
    }
  })

  return Math.round(total * 100) / 100 // Round to 2 decimal places
}

/**
 * Check if campaign dates overlap with selected month
 */
export function campaignOverlapsMonth(
  campaignStartDate: string | Date,
  campaignEndDate: string | Date,
  selectedYear: number,
  selectedMonth: number
): boolean {
  const start = new Date(campaignStartDate)
  const end = new Date(campaignEndDate)
  const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1, 1))
  const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1, 1))

  return start <= monthEnd && end >= monthStart
}

/**
 * Get media type key from line item table name
 */
export function getMediaTypeKeyFromTableName(tableName: string): string {
  const mapping: Record<string, string> = {
    television_line_items: "television",
    radio_line_items: "radio",
    newspaper_line_items: "newspaper",
    magazines_line_items: "magazines",
    ooh_line_items: "ooh",
    cinema_line_items: "cinema",
    digital_display_line_items: "digitalDisplay",
    digital_audio_line_items: "digitalAudio",
    digital_video_line_items: "digitalVideo",
    bvod_line_items: "bvod",
    integration_line_items: "integration",
    search_line_items: "search",
    social_media_line_items: "socialMedia",
    prog_display_line_items: "progDisplay",
    prog_video_line_items: "progVideo",
    prog_bvod_line_items: "progBvod",
    prog_audio_line_items: "progAudio",
    prog_ooh_line_items: "progOoh",
    influencers_line_items: "influencers",
  }
  return mapping[tableName] || tableName
}

/**
 * Parse amount string from billing schedule (e.g., "$40,000.00" → 40000.00)
 */
export function parseBillingScheduleAmount(amountStr: string | number): number {
  if (typeof amountStr === "number") {
    return amountStr
  }
  if (!amountStr || typeof amountStr !== "string") {
    return 0
  }
  // Remove currency symbols, commas, and whitespace, then parse
  const cleaned = amountStr.replace(/[$,]/g, "").trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Map media type display name to media type key for determining billing agency
 */
export function getMediaTypeKeyFromDisplayName(displayName: string): string {
  const reverseMapping: Record<string, string> = {
    "Television": "television",
    "Radio": "radio",
    "Newspaper": "newspaper",
    "Magazines": "magazines",
    "OOH": "ooh",
    "Cinema": "cinema",
    "Digital Display": "digitalDisplay",
    "Digital Audio": "digitalAudio",
    "Digital Video": "digitalVideo",
    "BVOD": "bvod",
    "Integration": "integration",
    "Search": "search",
    "Social Media": "socialMedia",
    "Programmatic Display": "progDisplay",
    "Programmatic Video": "progVideo",
    "Programmatic BVOD": "progBvod",
    "Programmatic Audio": "progAudio",
    "Programmatic OOH": "progOoh",
    "Influencers": "influencers",
  }
  return reverseMapping[displayName] || displayName.toLowerCase().replace(/\s+/g, "")
}

/**
 * Convert snake_case or other formats to natural language (Title Case with spaces)
 * Example: "landing_page_views" → "Landing Page Views"
 */
export function formatDescriptionToNaturalLanguage(description: string): string {
  if (!description) return description

  // If it already contains spaces and proper capitalization, return as is
  // (to preserve existing formatting)
  if (description.includes(" ") && /^[A-Z]/.test(description)) {
    return description
  }

  // Split on underscores or handle camelCase
  const parts = description.includes("_")
    ? description.split("_")
    : description.replace(/([A-Z])/g, " $1").split(" ")

  // Capitalize first letter of each word and join with spaces
  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      const trimmed = part.trim()
      if (trimmed.length === 0) return ""
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
    })
    .join(" ")
}

/**
 * Match month/year in different formats
 * Handles "November 2025", "2025-11", "2025-11-01" formats
 */
export function matchMonthYear(
  entryMonthYear: string,
  selectedYear: number,
  selectedMonth: number
): boolean {
  if (!entryMonthYear) return false

  const cleaned = entryMonthYear.toString().trim()
  if (!cleaned) return false

  // Format selected month in common shapes
  const selectedMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`
  const monthDate = new Date(selectedYear, selectedMonth - 1, 1)
  const selectedLong = monthDate.toLocaleString("default", { month: "long", year: "numeric" }) // e.g., December 2025
  const selectedShort = monthDate.toLocaleString("default", { month: "short", year: "numeric" }) // e.g., Dec 2025

  const normalized = cleaned.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim()

  // Fast path exact/normalized matches
  if ([cleaned, normalized].some((v) => [selectedMonthKey, selectedLong, selectedShort].includes(v))) {
    return true
  }

  // Common date formats we want to tolerate
  const formats = [
    "MMMM yyyy",
    "MMM yyyy",
    "MMMM-yyyy",
    "MMM-yyyy",
    "yyyy-MM",
    "yyyy-M",
    "yyyy/MM",
    "yyyy/M",
    "yyyy-MM-dd",
    "yyyy-M-d",
    "yyyy/MM/dd",
    "yyyy/M/d",
  ]

  for (const fmt of formats) {
    try {
      const parsed = parse(normalized, fmt, new Date())
      if (!isNaN(parsed.getTime())) {
        if (parsed.getFullYear() === selectedYear && parsed.getMonth() + 1 === selectedMonth) {
          return true
        }
      }
    } catch {
      // ignore and try next format
    }
  }

  // Fallback: native Date parsing
  const nativeParsed = new Date(cleaned)
  if (!isNaN(nativeParsed.getTime())) {
    return (
      nativeParsed.getFullYear() === selectedYear &&
      nativeParsed.getMonth() + 1 === selectedMonth
    )
  }

  // Fallback: numeric extraction (e.g., "2025 12" or "2025-12 anything")
  const numericMatch = normalized.match(/(\d{4}).*?(\d{1,2})/)
  if (numericMatch) {
    const [, yearStr, monthStr] = numericMatch
    if (Number(yearStr) === selectedYear && Number(monthStr) === selectedMonth) {
      return true
    }
  }

  return false
}

/**
 * Extract line items from billing schedule JSON for a specific month
 */
export function extractLineItemsFromBillingSchedule(
  billingSchedule: any,
  selectedYear: number,
  selectedMonth: number,
  publisherMap: Map<string, any>
): FinanceLineItem[] {
  if (!billingSchedule) return []

  let scheduleArray: BillingScheduleEntry[] = []
  
  // Handle different billing schedule structures
  if (Array.isArray(billingSchedule)) {
    scheduleArray = billingSchedule
  } else if (billingSchedule.months && Array.isArray(billingSchedule.months)) {
    scheduleArray = billingSchedule.months
  } else {
    return []
  }

  // Find the month entry matching selected month/year
  const monthEntry = scheduleArray.find((entry) => {
    const monthLabel =
      (entry as any).monthYear ||
      (entry as any).month_year ||
      (entry as any).month ||
      (entry as any).month_label

    return matchMonthYear(monthLabel, selectedYear, selectedMonth)
  })

  if (!monthEntry || !monthEntry.mediaTypes) {
    return []
  }

  const lineItems: FinanceLineItem[] = []

  // Process each media type
  for (const mediaTypeEntry of monthEntry.mediaTypes) {
    if (!mediaTypeEntry.lineItems || mediaTypeEntry.lineItems.length === 0) {
      continue
    }

    const mediaTypeDisplayName =
      mediaTypeEntry.mediaType ||
      mediaTypeEntry.media_type ||
      mediaTypeEntry.type ||
      mediaTypeEntry.name ||
      ""
    const mediaTypeKey = getMediaTypeKeyFromDisplayName(mediaTypeDisplayName)

    // Process each line item
    for (const lineItem of mediaTypeEntry.lineItems) {
      const amount = parseBillingScheduleAmount(lineItem.amount)
      
      // Only include line items with amount > $0
      if (amount <= 0) {
        continue
      }

      // Determine billing agency from lineItemId or header1
      // Try to extract publisher name from header1 or lineItemId
      let billingAgency: string | null = null
      
      // Parse lineItemId to extract media type info
      // Format: "mediaType-header1-header2-index"
      if (lineItem.lineItemId) {
        const parts = lineItem.lineItemId.split("-")
        if (parts.length >= 2) {
          const possiblePublisher = parts[1]
          const publisher = publisherMap.get(possiblePublisher)
          if (publisher) {
            billingAgency = publisher.billingagency || null
          }
        }
      }

      // If not found in lineItemId, try header1
      if (!billingAgency && lineItem.header1) {
        const publisher = publisherMap.get(lineItem.header1)
        if (publisher) {
          billingAgency = publisher.billingagency || null
        }
      }

      // Build item code
      const itemCode = buildItemCode(billingAgency, mediaTypeDisplayName)

      // Build description from header1 & header2, applying natural language formatting.
      // Finance requirement: for Search/Social/Programmatic, description should be Platform + Targeting
      // (not Platform + Bid Strategy).
      const descriptionParts: string[] = []
      if (lineItem.header1) {
        descriptionParts.push(formatDescriptionToNaturalLanguage(lineItem.header1))
      }
      const useTargetingInsteadOfBidStrategy = [
        "search",
        "socialMedia",
        "progDisplay",
        "progVideo",
        "progBvod",
        "progAudio",
        "progOoh",
      ].includes(mediaTypeKey)

      const secondPart = useTargetingInsteadOfBidStrategy
        ? (lineItem as any).targeting ??
          (lineItem as any).creative_targeting ??
          (lineItem as any).creativeTargeting ??
          (lineItem as any).targeting_attribute ??
          (lineItem as any).targetingAttribute ??
          lineItem.header2
        : lineItem.header2

      if (secondPart) {
        descriptionParts.push(formatDescriptionToNaturalLanguage(secondPart))
      }
      const description = descriptionParts.join(" ") || mediaTypeDisplayName

      lineItems.push({
        itemCode,
        mediaType: mediaTypeDisplayName,
        description,
        amount,
      })
    }
  }

  return lineItems
}

/**
 * Extract service amounts from billing schedule JSON for a specific month
 */
export function extractServiceAmountsFromBillingSchedule(
  billingSchedule: any,
  selectedYear: number,
  selectedMonth: number
): {
  adservingTechFees: number
  production: number
  assembledFee: number
} {
  const defaultAmounts = {
    adservingTechFees: 0,
    production: 0,
    assembledFee: 0,
  }

  if (!billingSchedule) return defaultAmounts

  let scheduleArray: BillingScheduleEntry[] = []
  
  // Handle different billing schedule structures
  if (Array.isArray(billingSchedule)) {
    scheduleArray = billingSchedule
  } else if (billingSchedule.months && Array.isArray(billingSchedule.months)) {
    scheduleArray = billingSchedule.months
  } else {
    return defaultAmounts
  }

  // Find the month entry matching selected month/year
  const monthEntry = scheduleArray.find((entry) => {
    const monthLabel =
      (entry as any).monthYear ||
      (entry as any).month_year ||
      (entry as any).month ||
      (entry as any).month_label

    return matchMonthYear(monthLabel, selectedYear, selectedMonth)
  })

  if (!monthEntry) {
    return defaultAmounts
  }

  const adserving =
    (monthEntry as any).adservingTechFees ??
    (monthEntry as any).adserving_tech_fees ??
    (monthEntry as any).ad_serving ??
    0
  const production =
    (monthEntry as any).production ??
    (monthEntry as any).production_cost ??
    (monthEntry as any).productionCost ??
    0
  const assembled =
    (monthEntry as any).feeTotal ??
    (monthEntry as any).fee_total ??
    (monthEntry as any).assembledFee ??
    0

  return {
    adservingTechFees: parseBillingScheduleAmount(adserving),
    production: parseBillingScheduleAmount(production),
    assembledFee: parseBillingScheduleAmount(assembled),
  }
}

