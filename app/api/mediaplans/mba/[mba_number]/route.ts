import { NextResponse } from "next/server"
import axios from "axios"
import { parseDateOnlyString, toMelbourneDateString } from "@/lib/timezone"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { getXanoBaseUrl, xanoUrl } from "@/lib/api/xano"

export const dynamic = "force-dynamic"
export const revalidate = 0

type MediaLineItems = {
  television: any[]
  radio: any[]
  newspaper: any[]
  magazines: any[]
  ooh: any[]
  cinema: any[]
  search: any[]
  socialMedia: any[]
  digitalDisplay: any[]
  digitalAudio: any[]
  digitalVideo: any[]
  bvod: any[]
  integration: any[]
  progDisplay: any[]
  progVideo: any[]
  progBvod: any[]
  progAudio: any[]
  progOoh: any[]
  influencers: any[]
  production: any[]
}

const createEmptyLineItems = (): MediaLineItems => ({
  television: [],
  radio: [],
  newspaper: [],
  magazines: [],
  ooh: [],
  cinema: [],
  search: [],
  socialMedia: [],
  digitalDisplay: [],
  digitalAudio: [],
  digitalVideo: [],
  bvod: [],
  integration: [],
  progDisplay: [],
  progVideo: [],
  progBvod: [],
  progAudio: [],
  progOoh: [],
  influencers: [],
  production: []
})

const MEDIA_TYPE_ENDPOINTS: Record<keyof MediaLineItems, string> = {
  television: "media_plan_television",
  radio: "media_plan_radio",
  newspaper: "media_plan_newspaper",
  magazines: "media_plan_magazines",
  ooh: "media_plan_ooh",
  cinema: "media_plan_cinema",
  digitalDisplay: "media_plan_digi_display",
  digitalAudio: "media_plan_digi_audio",
  digitalVideo: "media_plan_digi_video",
  bvod: "media_plan_digi_bvod",
  integration: "media_plan_integration",
  search: "media_plan_search",
  socialMedia: "media_plan_social",
  progDisplay: "media_plan_prog_display",
  progVideo: "media_plan_prog_video",
  progBvod: "media_plan_prog_bvod",
  progAudio: "media_plan_prog_audio",
  progOoh: "media_plan_prog_ooh",
  influencers: "media_plan_influencers",
  production: "media_plan_production",
}

const MEDIA_TYPE_FLAGS: Record<keyof MediaLineItems, string> = {
  television: "mp_television",
  radio: "mp_radio",
  newspaper: "mp_newspaper",
  magazines: "mp_magazines",
  ooh: "mp_ooh",
  cinema: "mp_cinema",
  digitalDisplay: "mp_digidisplay",
  digitalAudio: "mp_digiaudio",
  digitalVideo: "mp_digivideo",
  bvod: "mp_bvod",
  integration: "mp_integration",
  search: "mp_search",
  socialMedia: "mp_socialmedia",
  progDisplay: "mp_progdisplay",
  progVideo: "mp_progvideo",
  progBvod: "mp_progbvod",
  progAudio: "mp_progaudio",
  progOoh: "mp_progooh",
  influencers: "mp_influencers",
  production: "mp_production",
}

const MEDIA_TYPE_ALIASES: Record<string, keyof MediaLineItems> = {
  "social media": "socialMedia",
  "socialmedia": "socialMedia",
  "social": "socialMedia",
  "digital display": "digitalDisplay",
  "digitaldisplay": "digitalDisplay",
  "digital audio": "digitalAudio",
  "digitalaudio": "digitalAudio",
  "digital video": "digitalVideo",
  "digitalvideo": "digitalVideo",
  "programmatic display": "progDisplay",
  "prog display": "progDisplay",
  "progdisplay": "progDisplay",
  "programmatic video": "progVideo",
  "prog video": "progVideo",
  "progvideo": "progVideo",
  "programmatic bvod": "progBvod",
  "prog bvod": "progBvod",
  "progbvod": "progBvod",
  "programmatic audio": "progAudio",
  "prog audio": "progAudio",
  "progaudio": "progAudio",
  "programmatic ooh": "progOoh",
  "prog ooh": "progOoh",
  "progooh": "progOoh",
}

function normalise(value: any) {
  return String(value ?? "").trim().toLowerCase()
}

function isTruthyFlag(value: any) {
  if (value === undefined || value === null) return false
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["yes", "true", "1", "y", "on"].includes(normalized)
  }
  return false
}

function parseVersion(value: any): number | null {
  if (value === null || value === undefined) return null
  const num = typeof value === "string" ? parseInt(value, 10) : Number(value)
  return Number.isNaN(num) ? null : num
}

function parseAmount(value: any): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "")
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function safeParseDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value)
  }
  if (typeof value === "string") {
    try {
      return parseDateOnlyString(value)
    } catch {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getMonthLabel(value: any): string {
  if (!value) return "Unknown"
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }
  return String(value)
}

function slugifyClientName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return ""
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim()
}

async function fetchClientBrandColour(clientName?: string | null): Promise<string | null> {
  if (!clientName) return null
  try {
    const response = await axios.get(xanoUrl("clients", "XANO_CLIENTS_BASE_URL"))
    const clients = Array.isArray(response.data) ? response.data : []
    const targetSlug = slugifyClientName(clientName)
    const match = clients.find((client: any) => slugifyClientName(client?.mp_client_name || client?.name) === targetSlug)
    const colour = match?.brand_colour ?? match?.brandColor ?? match?.brand_colour
    if (typeof colour === "string" && colour.trim()) {
      return colour.trim()
    }
  } catch (error) {
    console.warn("[API] Failed to fetch client brand colour", {
      clientName,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return null
}

function calculateTimeElapsed(startDate: string, endDate: string): number {
  const start = safeParseDate(startDate)
  const end = safeParseDate(endDate)
  if (!start || !end) return 0
  const today = new Date()

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  const daysElapsed = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))

  if (today > end) return 100
  if (today < start) return 0

  const percentage = (daysElapsed / totalDays) * 100
  return Math.min(100, Math.max(0, Math.round(percentage * 100) / 100))
}

function calculateDayMetrics(startDate: string, endDate: string) {
  const start = safeParseDate(startDate)
  const end = safeParseDate(endDate)
  if (!start || !end) {
    return { daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }
  }
  const today = new Date()

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  const daysInCampaign = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  const daysElapsed = today < start ? 0 : Math.min(daysInCampaign, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  const daysRemaining = Math.max(0, daysInCampaign - daysElapsed)

  return { daysInCampaign, daysElapsed, daysRemaining }
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const startDay = startOfDay(start).getTime()
  const endDay = startOfDay(end).getTime()
  if (endDay < startDay) return 0
  return Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1
}

function extractMonthDate(entry: any): Date | null {
  const raw =
    entry?.month ||
    entry?.billingMonth ||
    entry?.date ||
    entry?.startDate ||
    entry?.periodStart ||
    entry?.period_start
  const parsed = safeParseDate(raw)
  if (!parsed) return null
  const monthStart = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  monthStart.setHours(0, 0, 0, 0)
  return monthStart
}

function sumBillingEntryAmount(entry: any): number {
  if (!entry) return 0
  if (entry?.totalAmount) return parseAmount(entry.totalAmount)
  if (entry?.amount) return parseAmount(entry.amount)

  let total = 0
  const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
  mediaTypes.forEach((mt: any) => {
    const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
    lineItems.forEach((item: any) => {
      total += parseAmount(item?.amount)
    })
  })
  return total
}

function calculateExpectedSpendToDate(billingSchedule: any, startDate: string, endDate: string): number {
  if (!billingSchedule || !Array.isArray(billingSchedule)) {
    return 0
  }

  const start = safeParseDate(startDate)
  const end = safeParseDate(endDate)
  if (!start || !end) return 0
  const today = new Date()

  const campaignStart = startOfDay(start)
  const campaignEnd = endOfDay(end)
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)

  if (todayEnd < campaignStart) return 0

  const monthlyTotals = new Map<
    string,
    { amount: number; monthStart: Date; monthEnd: Date }
  >()

  billingSchedule.forEach((entry: any) => {
    const monthStart = extractMonthDate(entry)
    if (!monthStart) return
    const amount = sumBillingEntryAmount(entry)
    if (!amount) return
    const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`
    const monthEnd = endOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0))
    const existing = monthlyTotals.get(key)
    if (existing) {
      existing.amount += amount
    } else {
      monthlyTotals.set(key, { amount, monthStart, monthEnd })
    }
  })

  let expected = 0

  monthlyTotals.forEach(({ amount, monthStart, monthEnd }) => {
    const windowStart = monthStart > campaignStart ? monthStart : campaignStart
    const windowEnd = monthEnd < campaignEnd ? monthEnd : campaignEnd
    if (windowEnd < windowStart) return

    if (todayEnd >= windowEnd) {
      expected += amount
      return
    }

    if (todayStart < windowStart) {
      return
    }

    const totalDays = daysBetweenInclusive(windowStart, windowEnd)
    const elapsedDays = Math.min(totalDays, daysBetweenInclusive(windowStart, todayStart))
    if (totalDays <= 0 || elapsedDays <= 0) return

    expected += amount * (elapsedDays / totalDays)
  })

  return Number(expected.toFixed(2))
}

function summarizeBillingSchedule(billingSchedule: any[]): {
  spendByMediaChannel: Array<{ mediaType: string; amount: number; percentage: number }>
  monthlySpend: Array<{ month: string; data: Array<{ mediaType: string; amount: number }> }>
} {
  const channelTotals: Record<string, number> = {}
  const monthlyTotals: Record<string, Record<string, number>> = {}

  billingSchedule.forEach((entry: any) => {
    const monthLabel = getMonthLabel(
      entry?.month ||
        entry?.billingMonth ||
        entry?.date ||
        entry?.startDate ||
        entry?.periodStart ||
        entry?.period_start
    )

    const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []

    if (mediaTypes.length === 0) {
      const uncategorizedAmount = parseAmount(entry?.totalAmount ?? entry?.amount)
      if (uncategorizedAmount > 0) {
        channelTotals["Uncategorized"] = (channelTotals["Uncategorized"] || 0) + uncategorizedAmount
        monthlyTotals[monthLabel] = monthlyTotals[monthLabel] || {}
        monthlyTotals[monthLabel]["Uncategorized"] = (monthlyTotals[monthLabel]["Uncategorized"] || 0) + uncategorizedAmount
      }
      return
    }

    mediaTypes.forEach((mt: any) => {
      const mediaType =
        mt?.mediaType ||
        mt?.media_type ||
        mt?.name ||
        "Other"

      const lineItemSum = Array.isArray(mt?.lineItems)
        ? mt.lineItems.reduce((sum: number, li: any) => {
            return sum + parseAmount(li?.amount ?? li?.totalAmount ?? li?.cost ?? li?.value ?? li?.total)
          }, 0)
        : 0

      const amount = lineItemSum || parseAmount(mt?.totalAmount ?? mt?.amount)
      if (amount <= 0) return

      channelTotals[mediaType] = (channelTotals[mediaType] || 0) + amount

      monthlyTotals[monthLabel] = monthlyTotals[monthLabel] || {}
      monthlyTotals[monthLabel][mediaType] = (monthlyTotals[monthLabel][mediaType] || 0) + amount
    })
  })

  const totalAmount = Object.values(channelTotals).reduce((sum, val) => sum + val, 0)
  const spendByMediaChannel = Object.entries(channelTotals).map(([mediaType, amount]) => ({
    mediaType,
    amount,
    percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0
  }))

  const monthlySpend = Object.entries(monthlyTotals).map(([month, entries]) => ({
    month,
    data: Object.entries(entries).map(([mediaType, amount]) => ({
      mediaType,
      amount
    }))
  }))

  monthlySpend.sort((a, b) => {
    const aDate = new Date(a.month).getTime()
    const bDate = new Date(b.month).getTime()
    if (Number.isNaN(aDate) || Number.isNaN(bDate)) return a.month.localeCompare(b.month)
    return aDate - bDate
  })

  return { spendByMediaChannel, monthlySpend }
}

function normalizeDeliverySchedule(raw: any) {
  const parsed = Array.isArray(raw) ? raw : typeof raw === "string" ? (() => {
    try {
      return JSON.parse(raw)
    } catch {
      return []
    }
  })() : []
  const spendByChannel: Record<string, number> = {}
  const monthlyMap: Record<string, Record<string, number>> = {}

  parsed.forEach((entry: any) => {
    const channel =
      entry?.channel ||
      entry?.media_channel ||
      entry?.mediaType ||
      entry?.media_type ||
      entry?.publisher ||
      entry?.placement ||
      "Other"

    const monthLabel = getMonthLabel(
      entry?.month ||
        entry?.monthYear ||
        entry?.period_start ||
        entry?.periodStart ||
        entry?.date ||
        entry?.startDate
    )

    const amount = parseAmount(
      entry?.spend ??
        entry?.amount ??
        entry?.budget ??
        entry?.value ??
        entry?.investment ??
        entry?.media_investment
    )

    if (amount > 0) {
      spendByChannel[channel] = (spendByChannel[channel] || 0) + amount
      monthlyMap[monthLabel] = monthlyMap[monthLabel] || {}
      monthlyMap[monthLabel][channel] = (monthlyMap[monthLabel][channel] || 0) + amount
    }
  })

  const monthlySpend = Object.entries(monthlyMap)
    .map(([month, data]) => ({
      month,
      data: Object.entries(data).map(([mediaType, amount]) => ({ mediaType, amount })),
    }))
    .sort((a, b) => {
      const aDate = new Date(a.month).getTime()
      const bDate = new Date(b.month).getTime()
      if (Number.isNaN(aDate) || Number.isNaN(bDate)) return a.month.localeCompare(b.month)
      return aDate - bDate
    })

  const total = Object.values(spendByChannel).reduce((sum, v) => sum + v, 0)
  const spendByMediaChannel = Object.entries(spendByChannel).map(([mediaType, amount]) => ({
    mediaType,
    amount,
    percentage: total > 0 ? (amount / total) * 100 : 0,
  }))

  return {
    raw: parsed,
    spendByMediaChannel,
    monthlySpend,
  }
}

function normalizeMediaTypeKey(raw: any): keyof MediaLineItems | null {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  if (trimmed in MEDIA_TYPE_ENDPOINTS) return trimmed as keyof MediaLineItems
  const normalized = normalise(trimmed).replace(/[^a-z0-9]+/g, " ").trim()
  if (normalized in MEDIA_TYPE_ENDPOINTS) return normalized as keyof MediaLineItems
  return MEDIA_TYPE_ALIASES[normalized] || null
}

function flagIsEnabled(value: any): boolean {
  if (value === true) return true
  if (value === 1) return true
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "1" || normalized === "yes"
  }
  return false
}

function deriveEnabledMediaTypes(versionData: Record<string, any> = {}) {
  const enabledSet = new Set<keyof MediaLineItems>()
  const arrayCandidates = [
    versionData?.enabledMediaTypes,
    versionData?.enabled_media_types,
    versionData?.media_types,
    versionData?.mediaTypes,
  ]
  arrayCandidates.forEach((candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => {
        const normalized = normalizeMediaTypeKey(entry)
        if (normalized) enabledSet.add(normalized)
      })
    }
  })

  ;(Object.keys(MEDIA_TYPE_FLAGS) as Array<keyof MediaLineItems>).forEach((key) => {
    const flag = MEDIA_TYPE_FLAGS[key]
    if (flagIsEnabled(versionData?.[flag])) {
      enabledSet.add(key)
    }
  })

  const enabled = Array.from(enabledSet)
  return enabled.length > 0 ? enabled : (Object.keys(MEDIA_TYPE_ENDPOINTS) as Array<keyof MediaLineItems>)
}

function filterByMbaAndVersion(items: any[], mbaNumber: string, versionNumber: number): any[] {
  if (!Array.isArray(items)) return []
  const normalizedMba = normalise(mbaNumber)
  const versionStr = String(versionNumber)

  return items.filter((item) => {
    if (normalise(item?.mba_number) !== normalizedMba) return false

    const mpPlanNumber = item?.mp_plannumber ?? item?.mp_plan_number ?? item?.mpPlanNumber
    const mediaPlanVersion = item?.media_plan_version ?? item?.media_plan_version_id
    const versionNumberField = item?.version_number

    if (mpPlanNumber !== null && mpPlanNumber !== undefined && String(mpPlanNumber).trim() !== "") {
      return String(mpPlanNumber).trim() === versionStr
    }

    if (mediaPlanVersion !== null && mediaPlanVersion !== undefined && String(mediaPlanVersion).trim() !== "") {
      return String(mediaPlanVersion).trim() === versionStr
    }

    if (versionNumberField !== null && versionNumberField !== undefined && String(versionNumberField).trim() !== "") {
      return String(versionNumberField).trim() === versionStr
    }

    return false
  })
}

async function fetchXanoTableForMediaType(
  mediaType: keyof MediaLineItems,
  mbaNumber: string,
  versionNumber: number
): Promise<any[]> {
  const endpoint = MEDIA_TYPE_ENDPOINTS[mediaType]
  const url = xanoUrl(endpoint, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  const data = await fetchAllXanoPages(url, { mba_number: mbaNumber }, `MBA_${mediaType}`)
  return filterByMbaAndVersion(data, mbaNumber, versionNumber)
}

// GET latest version by MBA number
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const mediaPlansBaseUrl = getXanoBaseUrl(["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
    const { mba_number } = await params
    console.log(`[API] Received request for MBA number: "${mba_number}"`)
    console.log(`[API] MBA number type: ${typeof mba_number}, length: ${mba_number?.length}`)
    
    // First, get the MediaPlanMaster by MBA number
    const masterQueryUrl = `${mediaPlansBaseUrl}/media_plan_master?mba_number=${encodeURIComponent(mba_number)}`
    console.log(`[API] Querying master with URL: ${masterQueryUrl}`)
    console.log(`[API] Master API Database: ${mediaPlansBaseUrl}`)
    console.log(`[API] Master Endpoint: media_plan_master`)
    console.log(`[API] Requested MBA number: "${mba_number}" (type: ${typeof mba_number}, length: ${mba_number?.length})`)
    
    const masterResponse = await axios.get(masterQueryUrl)
    
    // Log raw response to see what Xano is actually returning
    console.log(`[API] Raw Xano response:`, {
      isArray: Array.isArray(masterResponse.data),
      arrayLength: Array.isArray(masterResponse.data) ? masterResponse.data.length : 'N/A',
      dataType: typeof masterResponse.data,
      rawData: masterResponse.data
    })
    
    // Handle array response - find the exact match (no fallback to first record)
    const requestedNormalized = normalise(mba_number)
    let masterData: any = null
    if (Array.isArray(masterResponse.data)) {
      masterData = masterResponse.data.find((item: any) => normalise(item?.mba_number) === requestedNormalized) || null
    } else if (masterResponse.data && typeof masterResponse.data === 'object') {
      const candidate = masterResponse.data as any
      masterData = normalise(candidate?.mba_number) === requestedNormalized ? candidate : null
    }
    
    // CRITICAL: Ensure we use version_number from media_plan_master
    const masterVersionNumber = masterData?.version_number
    
    console.log(`[API] Master data response:`, {
      found: !!masterData,
      id: masterData?.id,
      mbaNumber: masterData?.mba_number,
      versionNumber: masterVersionNumber,
      usingVersionNumber: true // Explicitly indicate we're using version_number
    })
    
    // Validate that we got the correct MBA number
    if (masterData && masterData.mba_number !== mba_number) {
      console.error(`[API] MBA number mismatch! Requested: "${mba_number}", Got: "${masterData.mba_number}"`)
      return NextResponse.json(
        { 
          error: `MBA number mismatch: requested "${mba_number}" but received data for "${masterData.mba_number}". This indicates a database query issue.`,
          requestedMbaNumber: mba_number,
          receivedMbaNumber: masterData.mba_number
        },
        { status: 500 }
      )
    }
    
    if (!masterData) {
      console.error(`[API] Master not found for MBA: ${mba_number}`)
      return NextResponse.json(
        { error: `Media plan master not found for MBA number: ${mba_number}` },
        { status: 404 }
      )
    }
    
    console.log(`[API] Successfully found master data for MBA: ${mba_number}`)
    
    // Ensure we have version_number from master (required field)
    if (!masterData.version_number && masterData.version_number !== 0) {
      console.error(`[API] ERROR: masterData is missing version_number field!`, masterData)
      return NextResponse.json(
        { 
          error: `Media plan master data is missing version_number field for MBA number: ${mba_number}`,
          requestedMbaNumber: mba_number
        },
        { status: 500 }
      )
    }

    // Parse requested version from query (optional)
    const url = new URL(request.url)
    const requestedVersionParam = url.searchParams.get('version')
    const requestedVersionNumber = requestedVersionParam ? parseInt(requestedVersionParam, 10) : null
    
    // Fetch ALL versions for this MBA to derive target and latest
    const versionsResponse = await axios.get(
      `${mediaPlansBaseUrl}/media_plan_versions?mba_number=${encodeURIComponent(mba_number)}`
    )
    
    const allVersionsForMBA = Array.isArray(versionsResponse.data)
      ? versionsResponse.data.filter((v: any) => normalise(v?.mba_number) === requestedNormalized)
      : []
    
    const versionsMetadata = allVersionsForMBA.map((v: any) => ({
      id: v.id,
      version_number: parseVersion(v.version_number) ?? 0,
      created_at: v.created_at ?? v.createdAt ?? v.created ?? null
    }))
    
    const latestVersionNumber = versionsMetadata.length > 0
      ? Math.max(...versionsMetadata.map(v => v.version_number || 0))
      : parseVersion(masterData?.version_number) ?? 0
    
    const nextVersionNumber = (latestVersionNumber || 0) + 1
    
    // Choose target version: requested > master version > latest available > 1
    // Default to the latest version when none is requested
    let targetVersionNumber = requestedVersionNumber ?? latestVersionNumber ?? parseVersion(masterData?.version_number) ?? 1
    
    let versionData = allVersionsForMBA.find((v: any) => parseVersion(v.version_number) === targetVersionNumber) || null
    
    if (requestedVersionNumber !== null && !versionData) {
      console.error(`[API] Requested version ${requestedVersionNumber} not found for mba_number ${mba_number}`)
      return NextResponse.json(
        { 
          error: `Media plan version ${requestedVersionNumber} not found for MBA number ${mba_number}`,
          requestedVersion: requestedVersionNumber,
          requestedMbaNumber: mba_number
        },
        { status: 404 }
      )
    }
    
    // Fallback to latest if target missing
    if (!versionData && allVersionsForMBA.length > 0) {
      versionData = allVersionsForMBA.sort((a: any, b: any) => (parseVersion(b.version_number) || 0) - (parseVersion(a.version_number) || 0))[0]
      targetVersionNumber = parseVersion(versionData?.version_number) || targetVersionNumber
      console.warn(`[API] Target version missing, using latest version ${targetVersionNumber} for mba_number ${mba_number}`)
    }
    
    // Final validation
    if (!versionData) {
      console.error(`[API] No versions found for MBA: ${mba_number}`)
      return NextResponse.json(
        { error: `No media plan versions found for MBA number ${mba_number}` },
        { status: 404 }
      )
    }
    
    console.log(`[API] Using version ${targetVersionNumber} for mba_number: ${mba_number}`)
    
    console.log(`[API] Successfully found version data for mba_number: ${mba_number}`)

    // Check if line items should be skipped for faster initial load
    // Note: url was already parsed above for version parameter
    const skipLineItems = url.searchParams.get("skipLineItems") === "true"

    let lineItemsData: MediaLineItems = createEmptyLineItems()
    const versionRecord = versionData || masterData || {}
    const enabledMediaTypes = deriveEnabledMediaTypes(versionRecord)

    if (mba_number && !skipLineItems) {
      try {
        const versionNumberForLineItems = targetVersionNumber
        console.log(
          `[API] Fetching Xano line items for MBA: ${mba_number}, version: ${versionNumberForLineItems}`
        )

        const results = await Promise.all(
          enabledMediaTypes.map(async (mediaType) => {
            try {
              const items = await fetchXanoTableForMediaType(mediaType, mba_number, versionNumberForLineItems)
              return { mediaType, items }
            } catch (error) {
              console.warn(`[API] Failed to fetch ${mediaType} line items`, error)
              return { mediaType, items: [] }
            }
          })
        )

        lineItemsData = createEmptyLineItems()
        results.forEach(({ mediaType, items }) => {
          lineItemsData[mediaType] = Array.isArray(items) ? items : []
        })
      } catch (lineItemsError) {
        console.error("Error fetching line items:", lineItemsError)
      }
    }

    const countsPerType = Object.entries(lineItemsData).reduce(
      (acc, [key, items]) => {
        acc[key] = Array.isArray(items) ? items.length : 0
        return acc
      },
      {} as Record<string, number>
    )
    
    // Combine master, version, and line items data
    // Explicitly include billingSchedule from versionData to ensure it's not lost
    // Check for billingSchedule in various possible field names (camelCase, snake_case, etc.)
    const billingSchedule = versionData.billingSchedule || 
                           versionData.billing_schedule || 
                           masterData.billingSchedule || 
                           masterData.billing_schedule || 
                           null
    
    // If billingSchedule is a string, try to parse it as JSON
    let parsedBillingSchedule = billingSchedule
    if (typeof billingSchedule === 'string' && billingSchedule.trim() !== '') {
      try {
        parsedBillingSchedule = JSON.parse(billingSchedule)
      } catch (e) {
        console.warn(`[API] Failed to parse billingSchedule as JSON:`, e)
        parsedBillingSchedule = billingSchedule
      }
    }
    
    const deliveryScheduleSource =
      versionData.deliverySchedule ||
      versionData.delivery_schedule ||
      masterData.deliverySchedule ||
      masterData.delivery_schedule ||
      null

    let parsedDeliverySchedule = deliveryScheduleSource
    if (typeof deliveryScheduleSource === "string" && deliveryScheduleSource.trim() !== "") {
      try {
        parsedDeliverySchedule = JSON.parse(deliveryScheduleSource)
      } catch (e) {
        console.warn(`[API] Failed to parse deliverySchedule as JSON:`, e)
        parsedDeliverySchedule = deliveryScheduleSource
      }
    }

    const startDate =
      versionData.campaign_start_date ||
      versionData.mp_campaigndates_start ||
      masterData.campaign_start_date ||
      masterData.mp_campaigndates_start
    const endDate =
      versionData.campaign_end_date ||
      versionData.mp_campaigndates_end ||
      masterData.campaign_end_date ||
      masterData.mp_campaigndates_end

    const timeElapsed = startDate && endDate ? calculateTimeElapsed(startDate, endDate) : 0
    const dayMetrics = startDate && endDate ? calculateDayMetrics(startDate, endDate) : { daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }

    const clientName =
      versionData?.mp_client_name ||
      versionData?.client_name ||
      masterData?.mp_client_name ||
      masterData?.client_name ||
      null

    const clientBrandColour = await fetchClientBrandColour(clientName)

    const expectedSpendToDate = parsedBillingSchedule && Array.isArray(parsedBillingSchedule) && startDate && endDate
      ? calculateExpectedSpendToDate(parsedBillingSchedule, startDate, endDate)
      : 0

    const billingSpend = parsedBillingSchedule && Array.isArray(parsedBillingSchedule)
      ? summarizeBillingSchedule(parsedBillingSchedule)
      : { spendByMediaChannel: [], monthlySpend: [] }

    const deliveryScheduleMetrics = normalizeDeliverySchedule(parsedDeliverySchedule)

    // Ensure version_number is explicitly set from versionData to avoid being overridden by masterData
    // If a specific version was requested, we MUST use that version (it should already be in versionData)
    // Priority: targetVersionNumber (if requested) > versionData.version_number > latestVersionNumber > masterData.version_number
    let actualVersionNumber: number
    if (targetVersionNumber !== null) {
      // If a version was requested, we MUST use that version (it should already be in versionData)
      actualVersionNumber = targetVersionNumber
      console.log(`[API] Using requested version: ${actualVersionNumber} (from query parameter)`)
    } else if (versionData?.version_number !== undefined && versionData.version_number !== null) {
      actualVersionNumber = typeof versionData.version_number === 'string' 
        ? parseInt(versionData.version_number, 10) 
        : versionData.version_number
      console.log(`[API] Using version from versionData: ${actualVersionNumber}`)
    } else if (latestVersionNumber !== undefined && latestVersionNumber !== null) {
      actualVersionNumber = latestVersionNumber
      console.log(`[API] Using latestVersionNumber: ${actualVersionNumber}`)
    } else {
      actualVersionNumber = masterData?.version_number || 1
      console.log(`[API] Using masterData version (fallback): ${actualVersionNumber}`)
    }
    
    console.log(`[API] Setting version_number in combined data:`, {
      versionDataVersion: versionData?.version_number,
      latestVersionNumber: latestVersionNumber,
      masterDataVersion: masterData?.version_number,
      actualVersionNumber: actualVersionNumber,
      requestedVersion: targetVersionNumber,
      source: targetVersionNumber !== null ? 'query parameter' : (versionData?.version_number ? 'versionData' : 'fallback')
    })
    
    // CRITICAL: If a version was requested, ensure versionData matches (it should have been validated above)
    if (targetVersionNumber !== null && versionData && versionData.version_number !== undefined) {
      const versionDataVersion = typeof versionData.version_number === 'string' 
        ? parseInt(versionData.version_number, 10) 
        : versionData.version_number
      if (versionDataVersion !== targetVersionNumber) {
        console.error(`[API] CRITICAL ERROR: versionData has wrong version! Expected ${targetVersionNumber}, got ${versionDataVersion}`)
        return NextResponse.json(
          { 
            error: `Version data mismatch: expected version ${targetVersionNumber} but versionData has version ${versionDataVersion}`,
            requestedVersion: targetVersionNumber,
            versionDataVersion: versionDataVersion
          },
          { status: 500 }
        )
      }
    }
    
    const combinedData = {
      ...masterData,
      ...versionData,
      mbaNumber: mba_number,
      versionNumber: actualVersionNumber,
      versionData,
      version_number: actualVersionNumber, // Explicitly set to ensure correct version is returned
      billingSchedule: parsedBillingSchedule,
      deliverySchedule: deliveryScheduleMetrics.raw,
      lineItems: lineItemsData,
      metrics: {
        timeElapsed,
        ...dayMetrics,
        expectedSpendToDate,
        spendByMediaChannel: billingSpend.spendByMediaChannel,
        monthlySpend: billingSpend.monthlySpend,
        deliverySpendByChannel: deliveryScheduleMetrics.spendByMediaChannel,
        deliveryMonthlySpend: deliveryScheduleMetrics.monthlySpend,
      },
      debug: {
        enabledMediaTypes,
        countsPerType,
      },
      client: {
        ...(versionData?.client || masterData?.client || {}),
        brand_colour: clientBrandColour || versionData?.client?.brand_colour || masterData?.client?.brand_colour,
        brandColour: clientBrandColour || versionData?.client?.brandColour || masterData?.client?.brandColour,
        name: clientName || versionData?.client?.name || masterData?.client?.name,
      },
      client_details: {
        ...(versionData?.client_details || versionData?.clientDetails || masterData?.client_details || masterData?.clientDetails || {}),
        brand_colour:
          clientBrandColour ||
          versionData?.client_details?.brand_colour ||
          versionData?.clientDetails?.brand_colour ||
          masterData?.client_details?.brand_colour ||
          masterData?.clientDetails?.brand_colour,
      },
      versions: versionsMetadata.sort((a, b) => (a.version_number || 0) - (b.version_number || 0)),
      latestVersionNumber,
      nextVersionNumber,
    }

    if (clientBrandColour) {
      combinedData.brand_colour = combinedData.brand_colour || clientBrandColour
      combinedData.client_brand_colour = combinedData.client_brand_colour || clientBrandColour
    }
    
    // Final validation that the returned version matches the requested version
    if (targetVersionNumber !== null && combinedData.version_number !== targetVersionNumber) {
      console.error(`[API] CRITICAL ERROR: Version mismatch in final response! Requested: ${targetVersionNumber}, Returning: ${combinedData.version_number}`)
      console.error(`[API] This should never happen - the version was explicitly set above`)
      // Force the correct version
      combinedData.version_number = targetVersionNumber
      console.error(`[API] Forced version_number to ${targetVersionNumber} in response`)
    } else if (targetVersionNumber !== null && combinedData.version_number === targetVersionNumber) {
      console.log(`[API] ✓ Version match confirmed: Requested ${targetVersionNumber}, Returning ${combinedData.version_number}`)
    }
    
    console.log(`[API] Returning combined data for MBA: ${mba_number}`, {
      mbaNumber: combinedData.mba_number,
      versionNumber: combinedData.version_number,
      versionNumberType: typeof combinedData.version_number,
      requestedVersion: targetVersionNumber,
      versionMatches: targetVersionNumber !== null ? combinedData.version_number === targetVersionNumber : 'N/A',
      clientName: combinedData.mp_client_name || combinedData.client_name,
      hasBillingSchedule: !!combinedData.billingSchedule,
      billingScheduleType: typeof combinedData.billingSchedule,
      billingScheduleIsArray: Array.isArray(combinedData.billingSchedule),
      billingScheduleLength: Array.isArray(combinedData.billingSchedule) ? combinedData.billingSchedule.length : 'N/A',
      lineItemsCount: Object.keys(lineItemsData).reduce((sum, key) => sum + (lineItemsData[key]?.length || 0), 0)
    })
    
    const response = NextResponse.json(combinedData)
    // Ensure no caching
    response.headers.set("Cache-Control", "no-store, max-age=0")
    return response
  } catch (error) {
    console.error("Error fetching media plan by MBA:", error)
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
        code: error.code,
      })
      
      // Handle network errors (no response)
      if (!error.response) {
        return NextResponse.json(
          { 
            error: `Network error: ${error.message || "Failed to connect to API"}`,
            code: error.code || "NETWORK_ERROR"
          },
          { status: 503 }
        )
      }
      
      // Extract error message from response
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          error.message || 
                          "Failed to fetch media plan"
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.config?.url,
            message: error.message,
          }
        },
        { status: error.response.status || 500 }
      )
    }
    
    // Handle non-axios errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    return NextResponse.json(
      { 
        error: `Failed to fetch media plan: ${errorMessage}`,
        message: errorMessage
      },
      { status: 500 }
    )
  }
}

// PUT (update) a media plan by MBA number - creates new version for version control
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const mediaPlansBaseUrl = getXanoBaseUrl(["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
    const { mba_number } = await params
    const data = await request.json()
    
    console.log(`Creating new version for media plan with MBA: ${mba_number}`)
    console.log("Update data:", data)
    
    // First, get the MediaPlanMaster by MBA number (require exact match)
    const masterResponse = await axios.get(`${mediaPlansBaseUrl}/media_plan_master?mba_number=${mba_number}`)
    const requestedNormalized = normalise(mba_number)
    const masterData = Array.isArray(masterResponse.data)
      ? masterResponse.data.find((item: any) => normalise(item?.mba_number) === requestedNormalized) || null
      : (masterResponse.data && normalise((masterResponse.data as any).mba_number) === requestedNormalized
        ? masterResponse.data
        : null)
    
    if (!masterData) {
      console.error(`[PUT] Media plan master not found for MBA: "${mba_number}"`)
      return NextResponse.json(
        { error: `Media plan master not found for MBA number: ${mba_number}` },
        { status: 404 }
      )
    }

    // Calculate next version number based on max existing version for this MBA
    const versionsResponse = await axios.get(
      `${mediaPlansBaseUrl}/media_plan_versions?mba_number=${encodeURIComponent(mba_number)}`
    ).catch(() => ({ data: [] }))
    
    const allVersionsForMBA = Array.isArray(versionsResponse.data)
      ? versionsResponse.data.filter((v: any) => normalise(v?.mba_number) === requestedNormalized)
      : []
    
    const parseVersion = (value: any): number => {
      const num = typeof value === 'string' ? parseInt(value, 10) : value
      return isNaN(num) ? 0 : num
    }
    
    const latestVersionNumber = allVersionsForMBA.length > 0
      ? Math.max(...allVersionsForMBA.map((v: any) => parseVersion(v.version_number)))
      : parseVersion(masterData.version_number)
    
    const nextVersionNumber = (latestVersionNumber || 0) + 1
    
    const campaignStartDate = data.mp_campaigndates_start ?? masterData.campaign_start_date
    const campaignEndDate = data.mp_campaigndates_end ?? masterData.campaign_end_date
    const normalizedCampaignStartDate = campaignStartDate ? toMelbourneDateString(campaignStartDate) : campaignStartDate
    const normalizedCampaignEndDate = campaignEndDate ? toMelbourneDateString(campaignEndDate) : campaignEndDate

    // Format the data to match the media_plan_versions schema
    const mpProductionFlag = isTruthyFlag(data.mp_production) || isTruthyFlag(data.mp_fixedfee)
    const newVersionData = {
      media_plan_master_id: masterData.id,
      version_number: nextVersionNumber,
      mba_number: mba_number,
      campaign_name: data.mp_campaignname || masterData.mp_campaignname,
      campaign_status: data.mp_campaignstatus || masterData.campaign_status,
      campaign_start_date: normalizedCampaignStartDate,
      campaign_end_date: normalizedCampaignEndDate,
      brand: data.mp_brand || "",
      client_name: data.mp_client_name || masterData.mp_client_name,
      client_contact: data.mp_clientcontact || "",
      po_number: data.mp_ponumber || "",
      mp_campaignbudget: data.mp_campaignbudget || masterData.mp_campaignbudget,
      fixed_fee: isTruthyFlag(data.mp_fixedfee),
      mp_production: mpProductionFlag,
      mp_television: isTruthyFlag(data.mp_television),
      mp_radio: isTruthyFlag(data.mp_radio),
      mp_newspaper: isTruthyFlag(data.mp_newspaper),
      mp_magazines: isTruthyFlag(data.mp_magazines),
      mp_ooh: isTruthyFlag(data.mp_ooh),
      mp_cinema: isTruthyFlag(data.mp_cinema),
      mp_digidisplay: isTruthyFlag(data.mp_digidisplay),
      mp_digiaudio: isTruthyFlag(data.mp_digiaudio),
      mp_digivideo: isTruthyFlag(data.mp_digivideo),
      mp_bvod: isTruthyFlag(data.mp_bvod),
      mp_integration: isTruthyFlag(data.mp_integration),
      mp_search: isTruthyFlag(data.mp_search),
      mp_socialmedia: isTruthyFlag(data.mp_socialmedia),
      mp_progdisplay: isTruthyFlag(data.mp_progdisplay),
      mp_progvideo: isTruthyFlag(data.mp_progvideo),
      mp_progbvod: isTruthyFlag(data.mp_progbvod),
      mp_progaudio: isTruthyFlag(data.mp_progaudio),
      mp_progooh: isTruthyFlag(data.mp_progooh),
      mp_influencers: isTruthyFlag(data.mp_influencers),
      billingSchedule: data.billingSchedule || null,
      deliverySchedule: data.deliverySchedule || null,
    }
    
    // Create new version in media_plan_versions table
    const versionResponse = await axios.post(`${mediaPlansBaseUrl}/media_plan_versions`, newVersionData)
    
    // Update MediaPlanMaster with new version number and campaign name
    const masterUpdateData = {
      version_number: nextVersionNumber,
      mp_campaignname: data.mp_campaignname || masterData.mp_campaignname,
      campaign_status: data.mp_campaignstatus || masterData.campaign_status,
      campaign_start_date: normalizedCampaignStartDate,
      campaign_end_date: normalizedCampaignEndDate,
      mp_campaignbudget: data.mp_campaignbudget || masterData.mp_campaignbudget
    }
    
    const masterUpdateResponse = await axios.patch(`${mediaPlansBaseUrl}/media_plan_master/${masterData.id}`, masterUpdateData)
    
    console.log("New version created:", versionResponse.data)
    console.log("Master updated:", masterUpdateResponse.data)
    
    return NextResponse.json({
      version: versionResponse.data,
      master: masterUpdateResponse.data,
      latestVersionNumber,
      nextVersionNumber
    })
  } catch (error) {
    console.error("Error creating new media plan version:", error)
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
      })
      
      return NextResponse.json(
        { 
          error: `Failed to create new version: ${error.response?.data?.message || error.message}`,
          details: {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            url: error.config?.url,
          }
        },
        { status: error.response?.status || 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: "Failed to create new version", 
        details: error 
      },
      { status: 500 }
    )
  }
}

// PATCH (update) media plan master by MBA number
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const mediaPlansBaseUrl = getXanoBaseUrl(["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
    const { mba_number } = await params
    const data = await request.json()
    
    console.log(`[PATCH] Updating media plan master for MBA: "${mba_number}"`)
    console.log(`[PATCH] MBA number type: ${typeof mba_number}, length: ${mba_number?.length}`)
    console.log("[PATCH] Update data:", data)
    
    // First, get the MediaPlanMaster by MBA number (require exact match)
    const masterQueryUrl = `${mediaPlansBaseUrl}/media_plan_master?mba_number=${encodeURIComponent(mba_number)}`
    console.log(`[PATCH] Querying master with URL: ${masterQueryUrl}`)
    
    const masterResponse = await axios.get(masterQueryUrl)
    
    const requestedNormalized = normalise(mba_number)
    
    // Handle array response - find the exact match (same logic as GET handler)
    let masterData: any = null
    if (Array.isArray(masterResponse.data)) {
      masterData = masterResponse.data.find((item: any) => normalise(item?.mba_number) === requestedNormalized) || null
    } else if (masterResponse.data && typeof masterResponse.data === 'object') {
      const candidate = masterResponse.data as any
      masterData = normalise(candidate?.mba_number) === requestedNormalized ? candidate : null
    }
    
    console.log(`[PATCH] Master data response:`, {
      found: !!masterData,
      id: masterData?.id,
      mbaNumber: masterData?.mba_number,
      versionNumber: masterData?.version_number
    })
    
    // Validate that we got the correct MBA number
    if (masterData && masterData.mba_number !== mba_number) {
      console.error(`[PATCH] MBA number mismatch! Requested: "${mba_number}", Got: "${masterData.mba_number}"`)
      return NextResponse.json(
        { 
          error: `MBA number mismatch: requested "${mba_number}" but received data for "${masterData.mba_number}". This indicates a database query issue.`,
          requestedMbaNumber: mba_number,
          receivedMbaNumber: masterData.mba_number
        },
        { status: 500 }
      )
    }
    
    if (!masterData) {
      console.error(`[PATCH] Master not found for MBA: ${mba_number}`)
      return NextResponse.json(
        { error: `Media plan master not found for MBA number: ${mba_number}` },
        { status: 404 }
      )
    }
    
    console.log(`[PATCH] Successfully found master data for MBA: ${mba_number}`)

    // Validate that we have the id field (required for PATCH)
    if (!masterData.id) {
      console.error(`[PATCH] Master data missing id field:`, masterData)
      return NextResponse.json(
        { error: `Media plan master data is missing the required 'id' field` },
        { status: 500 }
      )
    }

    const masterId = masterData.id
    console.log(`[PATCH] Using master ID for update: ${masterId} (type: ${typeof masterId})`)
    
    // Ensure masterId is a number (Xano requires numeric ID)
    const numericMasterId = typeof masterId === 'number' ? masterId : parseInt(masterId, 10)
    if (isNaN(numericMasterId)) {
      console.error(`[PATCH] Invalid master ID: ${masterId}`)
      return NextResponse.json(
        { error: `Invalid master ID format: ${masterId}. Expected numeric ID.` },
        { status: 400 }
      )
    }

    // Build update data object with only provided fields
    // IMPORTANT: Do NOT include id, mba_number, or other identifying fields in the update payload
    // Only include fields that should be updated to avoid bulk updates
    const masterUpdateData: any = {}
    
    if (data.version_number !== undefined) {
      masterUpdateData.version_number = data.version_number
    }
    if (data.mp_campaignname !== undefined) {
      masterUpdateData.mp_campaignname = data.mp_campaignname
    }
    if (data.campaign_status !== undefined) {
      masterUpdateData.campaign_status = data.campaign_status
    }
    if (data.campaign_start_date !== undefined) {
      masterUpdateData.campaign_start_date = data.campaign_start_date
        ? toMelbourneDateString(data.campaign_start_date)
        : data.campaign_start_date
    }
    if (data.campaign_end_date !== undefined) {
      masterUpdateData.campaign_end_date = data.campaign_end_date
        ? toMelbourneDateString(data.campaign_end_date)
        : data.campaign_end_date
    }
    if (data.mp_campaignbudget !== undefined) {
      masterUpdateData.mp_campaignbudget = data.mp_campaignbudget
    }
    
    // Construct the PATCH URL using the numeric id field
    // Format: /media_plan_master/{id} - this should target ONLY the specific record
    const patchUrl = `${mediaPlansBaseUrl}/media_plan_master/${numericMasterId}`
    console.log(`[PATCH] Updating media plan master at URL: ${patchUrl}`)
    console.log(`[PATCH] Target master ID: ${numericMasterId}`)
    console.log(`[PATCH] Update payload (only updating these fields):`, masterUpdateData)
    console.log(`[PATCH] Payload keys:`, Object.keys(masterUpdateData))
    
    // Verify we're not accidentally including identifying fields that could cause bulk updates
    if (masterUpdateData.id || masterUpdateData.mba_number) {
      console.error(`[PATCH] ERROR: Update payload contains identifying fields that could cause bulk updates!`, masterUpdateData)
      return NextResponse.json(
        { error: `Update payload must not contain id or mba_number fields to prevent bulk updates` },
        { status: 400 }
      )
    }
    
    // Update MediaPlanMaster using the id field in the URL path
    // This should update ONLY the record with the matching ID
    const masterUpdateResponse = await axios.patch(
      patchUrl, 
      masterUpdateData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    
    // Check if the update was successful
    if (masterUpdateResponse.status >= 200 && masterUpdateResponse.status < 300) {
      console.log(`[PATCH] Successfully updated master ID ${numericMasterId}`)
      console.log("[PATCH] Master updated response:", masterUpdateResponse.data)
      
      // Verify the response indicates a single record was updated
      // Xano typically returns the updated record object, not an array
      if (Array.isArray(masterUpdateResponse.data)) {
        console.warn(`[PATCH] WARNING: Response is an array. Expected single record object. Array length: ${masterUpdateResponse.data.length}`)
        if (masterUpdateResponse.data.length > 1) {
          console.error(`[PATCH] ERROR: Multiple records returned! This suggests bulk update occurred.`)
        }
      }
      
      return NextResponse.json(masterUpdateResponse.data)
    } else {
      console.error(`[PATCH] Unexpected response status: ${masterUpdateResponse.status}`)
      return NextResponse.json(
        { 
          error: `Failed to update media plan master: Unexpected status ${masterUpdateResponse.status}`,
          details: masterUpdateResponse.data
        },
        { status: masterUpdateResponse.status }
      )
    }
  } catch (error) {
    console.error("Error updating media plan master:", error)
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
      })
      
      return NextResponse.json(
        { 
          error: `Failed to update media plan master: ${error.response?.data?.message || error.message}`,
          details: {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            url: error.config?.url,
          }
        },
        { status: error.response?.status || 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: "Failed to update media plan master", 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

