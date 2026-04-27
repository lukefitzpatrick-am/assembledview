import type { Publisher, PublisherDashboardData, PublisherCampaignRow } from '@/lib/types/publisher'
import { buildAllowedScheduleLabels } from '@/lib/publisher/scheduleLabels'
import { parseXanoListPayload } from '@/lib/api/xano'
import { xanoMediaPlansUrl } from '@/lib/api/xanoClients'
import {
  apiClient,
  getAustralianFinancialYear,
  isBookedApprovedCompleted,
  normalizeSchedule,
  parseMonthYear,
  getMonthYearValue,
  parseMoney,
} from './shared'

function lineItemMatchesPublisher(li: any, publisherName: string, publisherId: string): boolean {
  const h1 = String(li?.header1 ?? li?.publisher ?? "").trim()
  if (!h1) return false
  const n = h1.toLowerCase()
  if (n === publisherName.trim().toLowerCase()) return true
  const id = String(publisherId ?? "").trim()
  if (id && n === id.toLowerCase()) return true
  return false
}

function lineItemIsFixedCostMedia(li: any): boolean {
  const v = li?.fixed_cost_media ?? li?.fixedCostMedia
  if (v === true || v === 1) return true
  if (typeof v === "string" && ["true", "yes", "1"].includes(v.trim().toLowerCase())) return true
  return false
}

/** Targeting-related text from schedule line items (matches media container save shape). */
function lineItemTargetingFragments(li: any): string[] {
  const keys = ["targeting", "creative_targeting", "creativeTargeting", "adset_targeting"] as const
  const parts: string[] = []
  for (const k of keys) {
    const s = String(li?.[k] ?? "").trim()
    if (s) parts.push(s)
  }
  if (parts.length === 0) {
    const h2 = String(li?.header2 ?? "").trim()
    if (h2) parts.push(h2)
  }
  return parts
}

/**
 * FY-scoped analytics for a publisher: delivery/billing schedules on booked/approved/completed
 * media_plan_versions, filtered by pub_* → schedule media labels and line item header1 match.
 */
export async function getPublisherDashboardData(publisher: Publisher): Promise<PublisherDashboardData> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())
  const monthLabelFromDate = (date: Date) => fyMonths[(date.getMonth() + 12 - 6) % 12]

  const allowedLabels = buildAllowedScheduleLabels(publisher as unknown as Record<string, unknown>)

  const versionsResponse = await apiClient.get(xanoMediaPlansUrl("media_plan_versions"))
  const allVersions = parseXanoListPayload(versionsResponse.data)

  const versionsByMBA = allVersions.reduce((acc: Record<string, any[]>, version: any) => {
    const mbaNumber = version?.mba_number
    if (!mbaNumber) return acc
    acc[mbaNumber] = acc[mbaNumber] || []
    acc[mbaNumber].push(version)
    return acc
  }, {} as Record<string, any[]>)

  const chosenByMBA: Record<string, any> = {}
  Object.entries(versionsByMBA).forEach(([, versions]) => {
    const list = versions as { version_number?: number; campaign_status?: string; mba_number?: string }[]
    const sorted = list.slice().sort((a, b) => (b.version_number || 0) - (a.version_number || 0))
    const picked = sorted.find((v: any) => isBookedApprovedCompleted(v.campaign_status))
    if (picked) {
      const mba = picked.mba_number
      if (mba) chosenByMBA[mba] = picked
    }
  })

  const campaignRows: PublisherCampaignRow[] = []
  const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
  fyMonths.forEach((m) => {
    deliveryMonthlyMap[m] = {}
  })
  const clientSpend: Record<string, number> = {}

  const name = publisher.publisher_name
  const pid = publisher.publisherid

  for (const [mbaNumber, version] of Object.entries(chosenByMBA)) {
    const schedule = normalizeSchedule(
      (version as any)?.deliverySchedule ||
        (version as any)?.delivery_schedule ||
        (version as any)?.billingSchedule ||
        (version as any)?.billing_schedule,
    )

    let campaignPublisherSpend = 0
    const mediaTypesHit = new Set<string>()
    let anyFixedCostMedia = false
    const targetingFragments = new Set<string>()

    for (const entry of schedule) {
      const monthDate = parseMonthYear(getMonthYearValue(entry))
      if (!monthDate || monthDate < fyStart || monthDate > fyEnd) continue

      const monthLabel = monthLabelFromDate(monthDate)
      const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []

      if (mediaTypes.length === 0) continue

      for (const mt of mediaTypes) {
        const mediaTypeLabel =
          mt?.mediaType ||
          mt?.media_type ||
          mt?.type ||
          mt?.name ||
          mt?.channel ||
          "Unspecified"

        if (allowedLabels.size > 0 && !allowedLabels.has(mediaTypeLabel)) continue

        const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
        for (const li of lineItems) {
          if (!lineItemMatchesPublisher(li, name, pid)) continue
          const amount = parseMoney(li?.amount)
          if (amount <= 0) continue
          campaignPublisherSpend += amount
          mediaTypesHit.add(mediaTypeLabel)
          if (lineItemIsFixedCostMedia(li)) anyFixedCostMedia = true
          for (const frag of lineItemTargetingFragments(li)) {
            targetingFragments.add(frag)
          }
          deliveryMonthlyMap[monthLabel][mediaTypeLabel] =
            (deliveryMonthlyMap[monthLabel][mediaTypeLabel] || 0) + amount
        }
      }
    }

    if (campaignPublisherSpend > 0) {
      const clientName =
        (version as any).mp_client_name ||
        (version as any).client_name ||
        (version as any).mp_clientname ||
        "Unknown"
      const campaignName = (version as any).campaign_name || ""
      const startDate =
        (version as any).campaign_start_date || (version as any).mp_campaigndates_start || ""
      const endDate = (version as any).campaign_end_date || (version as any).mp_campaigndates_end || ""

      clientSpend[clientName] = (clientSpend[clientName] || 0) + campaignPublisherSpend

      campaignRows.push({
        mbaNumber,
        clientName,
        campaignName,
        startDate,
        endDate,
        publisherSpendFy: campaignPublisherSpend,
        mediaTypes: Array.from(mediaTypesHit).sort(),
        fixedCostMedia: anyFixedCostMedia ? "Yes" : "No",
        targetingDetails: Array.from(targetingFragments).join("; "),
      })
    }
  }

  const totalClient = Object.values(clientSpend).reduce((a, b) => a + b, 0)
  const spendByClient = Object.entries(clientSpend)
    .map(([clientName, amount]) => ({
      clientName,
      amount,
      percentage: totalClient > 0 ? (amount / totalClient) * 100 : 0,
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const monthlySpend = fyMonths.map((month) => ({
    month,
    data: Object.entries(deliveryMonthlyMap[month] || {})
      .map(([mediaType, amount]) => ({ mediaType, amount }))
      .filter((item) => item.amount > 0),
  }))

  campaignRows.sort((a, b) => b.publisherSpendFy - a.publisherSpendFy)

  return {
    campaigns: campaignRows,
    monthlySpend,
    spendByClient,
    shareByMediaType: [],
  }
}
