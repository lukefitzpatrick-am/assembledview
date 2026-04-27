import {
  GlobalMonthlySpend,
  GlobalMonthlyPublisherSpend,
  GlobalMonthlyClientSpend,
} from '@/lib/types/dashboard'
import { parseXanoListPayload } from '@/lib/api/xano'
import { getXanoClientsCollectionUrl, xanoMediaPlansUrl } from '@/lib/api/xanoClients'
import {
  apiClient,
  getAustralianFinancialYear,
  isBookedApprovedCompleted,
  normalizeSchedule,
  parseMonthYear,
  getMonthYearValue,
  parseMoney,
} from './shared'

/**
 * Global monthly spend (all clients), sourced from deliverySchedule on media_plan_versions
 * with billingSchedule as a fallback. Rules: booked/approved/completed, highest matching version per MBA,
 * current AU FY (Jul–Jun).
 */
export async function getGlobalMonthlySpend(): Promise<GlobalMonthlySpend[]> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  const versionsResponse = await apiClient.get(xanoMediaPlansUrl("media_plan_versions"))
  const allVersions = parseXanoListPayload(versionsResponse.data)

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
 * with billingSchedule as a fallback. Rules: booked/approved/completed, highest matching version per MBA, current AU FY (Jul–Jun).
 */
export async function getGlobalMonthlyPublisherSpend(): Promise<GlobalMonthlyPublisherSpend[]> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  const versionsResponse = await apiClient.get(xanoMediaPlansUrl("media_plan_versions"))
  const allVersions = parseXanoListPayload(versionsResponse.data)

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
 * with billingSchedule as fallback. Rules: booked/approved/completed, highest matching version per MBA,
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
    const clientsResp = await apiClient.get(getXanoClientsCollectionUrl())
    const clients = parseXanoListPayload(clientsResp.data)
    clientColors = clients.reduce((acc: Record<string, string>, c: any) => {
      if (c.mp_client_name && c.brand_colour) {
        acc[c.mp_client_name] = c.brand_colour
      }
      return acc
    }, {})
  } catch (err) {
    console.warn('Global monthly client spend: unable to fetch client colors', err)
  }

  const versionsResponse = await apiClient.get(xanoMediaPlansUrl("media_plan_versions"))
  const allVersions = parseXanoListPayload(versionsResponse.data)

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
