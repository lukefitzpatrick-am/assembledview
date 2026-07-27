import { parseXanoListPayload } from '@/lib/api/xano'
import { xanoMediaPlansUrl } from '@/lib/api/xanoClients'
import { fetchAllXanoPages } from '@/lib/api/xanoPagination'
import {
  australianFyStartYearForDate,
  billingMonthsInAustralianFinancialYear,
  referenceDateForFyStartYear,
} from '@/lib/finance/months'
import { publishedVersionFromMaster } from '@/lib/mediaplan/publishedVersionGuard'
import {
  apiClient,
  getTzParts,
  getAustralianFinancialYearWindow,
  isBookedApprovedCompleted,
  normalizeMbaKey,
  normalizeSchedule,
  parseMonthYear,
  getMonthYearValue,
  pickHighestVersionRow,
  sumLineItems,
  sumDeliveryScheduleMonthAgencyMedia,
} from './shared'

export type FinanceHubScheduleFytdOptions = {
  /** Calendar year of 1 July that starts the FY. Defaults to current Melbourne FY. */
  financialYearStartYear?: number
}

/**
 * Finance hub FY-to-date totals from media plan **month rows** (not Xano finance_billing_records).
 * - **billingScheduleYtd**: sum of `sumLineItems` per month row on `billingSchedule` / `billing_schedule` only.
 * - **deliveryScheduleYtd**: same on `deliverySchedule` / `delivery_schedule` only (no fallback to the other);
 *   media line items with `clientPaysForMedia` / `client_pays_for_media` are excluded (aligned with payables).
 * Version per MBA: booked/approved/completed if present, else highest `version_number` (same as global monthly charts).
 * Months: Australian FY — past FY = full 12 months; current FY = through current calendar month (Melbourne);
 * future FY = empty set (nothing “to date”).
 */
export async function getFinanceHubScheduleFytdTotals(
  options: FinanceHubScheduleFytdOptions = {},
): Promise<{
  billingScheduleYtd: number
  deliveryScheduleYtd: number
  currentMonthIso: string
  financialYearStartYear: number
}> {
  const now = new Date()
  const parts = getTzParts(now)
  const currentMonthIso = `${parts.year}-${String(parts.month).padStart(2, '0')}`
  const melbourneCalendar = new Date(parts.year, parts.month - 1, parts.day)
  const currentFyStart = australianFyStartYearForDate(melbourneCalendar)
  const fyStartYear = options.financialYearStartYear ?? currentFyStart

  const reference = referenceDateForFyStartYear(fyStartYear)
  const fyMonths = billingMonthsInAustralianFinancialYear(reference)

  let fyMonthAllowed: Set<string>
  if (fyStartYear < currentFyStart) {
    fyMonthAllowed = new Set(fyMonths)
  } else if (fyStartYear > currentFyStart) {
    fyMonthAllowed = new Set()
  } else {
    fyMonthAllowed = new Set(fyMonths.filter((m) => m <= currentMonthIso))
  }

  const { start: fyStart, end: fyEnd } = getAustralianFinancialYearWindow(reference)

  const [allVersions, mastersRaw] = await Promise.all([
    fetchAllXanoPages(
      xanoMediaPlansUrl('media_plan_versions'),
      {},
      'DASHBOARD_finance_hub_schedule_fytd',
      100,
      50
    ),
    (async () => {
      // Prefer same master endpoints as client dashboard; tolerate missing collection.
      for (const endpoint of ['media_plan_master', 'media_plans_master'] as const) {
        try {
          const response = await apiClient.get(xanoMediaPlansUrl(endpoint))
          return parseXanoListPayload(response.data)
        } catch (err: any) {
          if (err?.response?.status === 404) continue
          throw err
        }
      }
      return [] as any[]
    })(),
  ])

  const publishedByMba = new Map<string, number>()
  for (const master of mastersRaw || []) {
    const key = normalizeMbaKey(master?.mba_number ?? master?.mbaNumber)
    if (!key) continue
    const published = publishedVersionFromMaster(master)
    if (published > 0) publishedByMba.set(key, published)
  }

  const versionsByMBA = allVersions.reduce((acc: Record<string, any[]>, version: any) => {
    const mbaNumber = version?.mba_number
    if (!mbaNumber) return acc
    acc[mbaNumber] = acc[mbaNumber] || []
    acc[mbaNumber].push(version)
    return acc
  }, {} as Record<string, any[]>)

  const highestApprovedVersionByMBA = Object.entries(versionsByMBA).reduce(
    (acc: Record<string, any>, [mbaNumber, versions]: [string, any[]]) => {
      const mbaKey = normalizeMbaKey(mbaNumber) || String(mbaNumber)
      const published = publishedByMba.get(mbaKey)
      // Prefer booked/approved/completed among published versions only.
      const candidatePool =
        published != null && published > 0
          ? versions.filter((v: any) => {
              const vn = Number(v?.version_number ?? v?.versionNumber ?? 0)
              return Number.isFinite(vn) && vn > 0 && vn <= published
            })
          : versions
      const sorted = candidatePool
        .slice()
        .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))
      const bookedApproved = sorted.find((v: any) => isBookedApprovedCompleted(v.campaign_status))
      if (bookedApproved) {
        acc[mbaNumber] = bookedApproved
        return acc
      }
      const highest = pickHighestVersionRow(versions, published)
      if (highest) {
        acc[mbaNumber] = highest
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
    financialYearStartYear: fyStartYear,
  }
}
