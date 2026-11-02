import {
  GlobalMonthlyPublisherSpend,
  GlobalMonthlyClientSpend,
} from '@/lib/types/dashboard'
import {
  fetchDashboardMonthlyClientSpendFromPostgres,
  fetchDashboardMonthlyPublisherSpendFromPostgres,
} from '@/lib/data/dashboardMonthlySpend'
import { getCachedClients } from '@/lib/finance/xanoReferenceCache'
import {
  getAustralianFinancialYear,
  parseMonthYear,
} from './shared'

/**
 * Raw list rows for treemap feeds.
 * Postgres schedule_months aggregate.
 */
async function fetchDashboardMonthlyPublisherSpendRows(): Promise<any[]> {
  return fetchDashboardMonthlyPublisherSpendFromPostgres()
}

async function fetchDashboardMonthlyClientSpendRows(): Promise<any[]> {
  return fetchDashboardMonthlyClientSpendFromPostgres()
}

/**
 * Global monthly spend split by publisher (header1 / line_items.publisher).
 * Pre-aggregated from Postgres schedule_months (delivery). FY filter stays app-side.
 * Upstream / DB failures throw — never soft-fail to empty months (dead backend ≠ quiet FY).
 */
export async function getGlobalMonthlyPublisherSpend(): Promise<GlobalMonthlyPublisherSpend[]> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  const rows = await fetchDashboardMonthlyPublisherSpendRows()

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
 * Global monthly spend split by client.
 * Pre-aggregated from Postgres schedule_months (delivery). FY filter stays app-side.
 * Client brand colours still fetched from the clients collection.
 * Upstream / DB failures throw — never soft-fail to empty months (dead backend ≠ quiet FY).
 * Client-colour lookup remains best-effort (cosmetic only).
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

  const rows = await fetchDashboardMonthlyClientSpendRows()

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
