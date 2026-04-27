import { parseXanoListPayload } from '@/lib/api/xano'
import { xanoMediaPlansUrl } from '@/lib/api/xanoClients'
import { billingMonthsInAustralianFinancialYear } from '@/lib/finance/months'
import {
  apiClient,
  getTzParts,
  getAustralianFinancialYearWindow,
  isBookedApprovedCompleted,
  normalizeSchedule,
  parseMonthYear,
  getMonthYearValue,
  sumLineItems,
  sumDeliveryScheduleMonthAgencyMedia,
} from './shared'

/**
 * Finance hub FY-to-date totals from media plan **month rows** (not Xano finance_billing_records).
 * - **billingScheduleYtd**: sum of `sumLineItems` per month row on `billingSchedule` / `billing_schedule` only.
 * - **deliveryScheduleYtd**: same on `deliverySchedule` / `delivery_schedule` only (no fallback to the other);
 *   media line items with `clientPaysForMedia` / `client_pays_for_media` are excluded (aligned with payables).
 * Version per MBA: booked/approved/completed if present, else highest `version_number` (same as global monthly charts).
 * Months: Australian FY through current calendar month (Melbourne), inclusive.
 */
export async function getFinanceHubScheduleFytdTotals(): Promise<{
  billingScheduleYtd: number
  deliveryScheduleYtd: number
  currentMonthIso: string
}> {
  const reference = new Date()
  const parts = getTzParts(reference)
  const currentMonthIso = `${parts.year}-${String(parts.month).padStart(2, '0')}`
  const melbourneCalendar = new Date(parts.year, parts.month - 1, parts.day)

  const fyMonthAllowed = new Set(
    billingMonthsInAustralianFinancialYear(melbourneCalendar).filter((m) => m <= currentMonthIso)
  )

  const { start: fyStart, end: fyEnd } = getAustralianFinancialYearWindow(reference)

  const versionsResponse = await apiClient.get(xanoMediaPlansUrl('media_plan_versions'))
  const allVersions = parseXanoListPayload(versionsResponse.data)

  const versionsByMBA = allVersions.reduce((acc: Record<string, any[]>, version: any) => {
    const mbaNumber = version?.mba_number
    if (!mbaNumber) return acc
    acc[mbaNumber] = acc[mbaNumber] || []
    acc[mbaNumber].push(version)
    return acc
  }, {} as Record<string, any[]>)

  const highestApprovedVersionByMBA = Object.entries(versionsByMBA).reduce(
    (acc: Record<string, any>, [mbaNumber, versions]: [string, any[]]) => {
      const sorted = versions.slice().sort((a, b) => (b.version_number || 0) - (a.version_number || 0))
      const bookedApproved = sorted.find((v: any) => isBookedApprovedCompleted(v.campaign_status))
      if (bookedApproved) {
        acc[mbaNumber] = bookedApproved
        return acc
      }
      if (sorted[0]) {
        acc[mbaNumber] = sorted[0]
      }
      return acc
    },
    {} as Record<string, any>
  )

  let billingScheduleYtd = 0
  let deliveryScheduleYtd = 0

  for (const version of Object.values(highestApprovedVersionByMBA)) {
    const v = version as any
    const billingSchedule = normalizeSchedule(v?.billingSchedule ?? v?.billing_schedule)
    for (const entry of billingSchedule) {
      const monthDate = parseMonthYear(getMonthYearValue(entry))
      if (!monthDate) continue
      if (monthDate.getTime() < fyStart.getTime() || monthDate.getTime() > fyEnd.getTime()) continue
      const ym = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
      if (!fyMonthAllowed.has(ym)) continue
      billingScheduleYtd += sumLineItems(entry)
    }

    const deliverySchedule = normalizeSchedule(v?.deliverySchedule ?? v?.delivery_schedule)
    for (const entry of deliverySchedule) {
      const monthDate = parseMonthYear(getMonthYearValue(entry))
      if (!monthDate) continue
      if (monthDate.getTime() < fyStart.getTime() || monthDate.getTime() > fyEnd.getTime()) continue
      const ym = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
      if (!fyMonthAllowed.has(ym)) continue
      deliveryScheduleYtd += sumDeliveryScheduleMonthAgencyMedia(entry)
    }
  }

  return {
    billingScheduleYtd: Math.round(billingScheduleYtd * 100) / 100,
    deliveryScheduleYtd: Math.round(deliveryScheduleYtd * 100) / 100,
    currentMonthIso,
  }
}
