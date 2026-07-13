import {
  GlobalMonthlySpend,
  GlobalMonthlyPublisherSpend,
  GlobalMonthlyClientSpend,
} from '@/lib/types/dashboard'
import { parseXanoListPayload } from '@/lib/api/xano'
import { xanoDashboardsUrl } from '@/lib/api/xanoClients'
import { getCachedMediaPlanVersions } from '@/lib/api/mediaPlanVersionsCache'
import { getCachedClients } from '@/lib/finance/xanoReferenceCache'
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

  const { data: allVersions } = await getCachedMediaPlanVersions()

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
 * Legacy: fetch-all media_plan_versions + app-side aggregation.
 * Kept for parity harness; remove after parity gate passes.
 */
export async function getGlobalMonthlyPublisherSpendLegacy(): Promise<GlobalMonthlyPublisherSpend[]> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  const { data: allVersions } = await getCachedMediaPlanVersions()

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

function emptyPublisherSpendMonths(fyMonths: string[]): GlobalMonthlyPublisherSpend[] {
  return fyMonths.map(month => ({ month, data: [] }))
}

/**
 * Global monthly spend split by publisher (header1).
 * Pre-aggregated via Xano dashboards `dashboard_monthly_publisher_spend`; FY filter stays app-side.
 * Non-OK upstream (currently 500 while Xano fix lands) soft-fails to empty months.
 */
export async function getGlobalMonthlyPublisherSpend(): Promise<GlobalMonthlyPublisherSpend[]> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  let rows: any[] = []
  try {
    const rowsResp = await apiClient.get(xanoDashboardsUrl("dashboard_monthly_publisher_spend"))
    rows = parseXanoListPayload(rowsResp.data)
  } catch (err: any) {
    const status = err?.response?.status
    console.warn(
      "[dashboard] dashboard_monthly_publisher_spend upstream non-OK; returning empty chart data",
      status ?? err?.message ?? err,
    )
    return emptyPublisherSpendMonths(fyMonths)
  }

  const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
  fyMonths.forEach(month => { deliveryMonthlyMap[month] = {} })

  for (const row of rows) {
    const monthDate = parseMonthYear(row?.month)
    if (!monthDate || monthDate < fyStart || monthDate > fyEnd) continue
    const monthLabel = fyMonths[(monthDate.getMonth() + 12 - 6) % 12]
    const publisher = typeof row?.publisher === 'string' && row.publisher.length > 0
      ? row.publisher
      : 'Unspecified'
    const amount = Number(row?.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue
    deliveryMonthlyMap[monthLabel][publisher] = (deliveryMonthlyMap[monthLabel][publisher] || 0) + amount
  }

  return fyMonths.map(month => ({
    month,
    data: Object.entries(deliveryMonthlyMap[month] || {})
      .map(([publisher, amount]) => ({ publisher, amount }))
      .filter(item => item.amount > 0)
  }))
}

/**
 * Legacy: fetch-all media_plan_versions + app-side aggregation.
 * Kept for parity harness; remove after parity gate passes.
 */
export async function getGlobalMonthlyClientSpendLegacy(): Promise<{
  data: GlobalMonthlyClientSpend[]
  clientColors: Record<string, string>
}> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  // Fetch client colors map (coalesced via finance reference cache)
  let clientColors: Record<string, string> = {}
  try {
    const clients = await getCachedClients()
    clientColors = clients.reduce((acc: Record<string, string>, c: any) => {
      if (c.mp_client_name && c.brand_colour) {
        acc[c.mp_client_name] = c.brand_colour
      }
      return acc
    }, {})
  } catch (err) {
    console.warn('Global monthly client spend: unable to fetch client colors', err)
  }

  const { data: allVersions } = await getCachedMediaPlanVersions()

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

/**
 * Global monthly spend split by client.
 * Pre-aggregated via Xano dashboards `dashboard_monthly_client_spend`; FY filter stays app-side.
 * Client brand colours still fetched from the clients collection.
 * Non-OK upstream (currently 500 while Xano fix lands) soft-fails to empty months.
 */
export async function getGlobalMonthlyClientSpend(): Promise<{
  data: GlobalMonthlyClientSpend[]
  clientColors: Record<string, string>
}> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  // Fetch client colors via finance reference cache (clients API route uses
  // lib/cache/clientsCache as a passive store only — no fetch helper there).
  let clientColors: Record<string, string> = {}
  try {
    const clients = await getCachedClients()
    clientColors = clients.reduce((acc: Record<string, string>, c: any) => {
      if (c.mp_client_name && c.brand_colour) {
        acc[c.mp_client_name] = c.brand_colour
      }
      return acc
    }, {})
  } catch (err) {
    console.warn('Global monthly client spend: unable to fetch client colors', err)
  }

  let rows: any[] = []
  try {
    const rowsResp = await apiClient.get(xanoDashboardsUrl("dashboard_monthly_client_spend"))
    rows = parseXanoListPayload(rowsResp.data)
  } catch (err: any) {
    const status = err?.response?.status
    console.warn(
      "[dashboard] dashboard_monthly_client_spend upstream non-OK; returning empty chart data",
      status ?? err?.message ?? err,
    )
    return {
      data: fyMonths.map(month => ({ month, data: [] })),
      clientColors,
    }
  }

  const deliveryMonthlyMap: Record<string, Record<string, number>> = {}
  fyMonths.forEach(month => { deliveryMonthlyMap[month] = {} })

  for (const row of rows) {
    const monthDate = parseMonthYear(row?.month)
    if (!monthDate || monthDate < fyStart || monthDate > fyEnd) continue
    const monthLabel = fyMonths[(monthDate.getMonth() + 12 - 6) % 12]
    const client = typeof row?.client === 'string' && row.client.length > 0
      ? row.client
      : 'Unspecified'
    const amount = Number(row?.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue
    deliveryMonthlyMap[monthLabel][client] = (deliveryMonthlyMap[monthLabel][client] || 0) + amount
  }

  const data: GlobalMonthlyClientSpend[] = fyMonths.map(month => ({
    month,
    data: Object.entries(deliveryMonthlyMap[month] || {})
      .map(([client, amount]) => ({ client, amount }))
      .filter(item => item.amount > 0)
  }))

  return { data, clientColors }
}
