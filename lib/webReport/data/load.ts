import "server-only"

import type { ClientDeliveredTotalsCampaignInput } from "@/lib/delivery/getDeliveredTotalsForClient"
import { readGa4 } from "@/lib/webReport/data/ga4"
import { readGsc } from "@/lib/webReport/data/gsc"
import { readAvPaid } from "@/lib/webReport/data/paid"
import { readSearchAds } from "@/lib/webReport/data/searchAds"
import { readSocialAds } from "@/lib/webReport/data/socialAds"
import { loadKpiReport } from "@/lib/webReport/kpis/warehouse"
import type { ReportWindows } from "@/lib/webReport/periods"
import type { WarehouseQuery, WebReportData } from "@/lib/webReport/types"

export async function loadWebReportData(input: {
  windows: ReportWindows
  today: string
  ga4PropertyId: string | null
  ga4PropertyName?: string | null
  gscSite: string | null
  brandTerms: readonly string[]
  campaigns: ClientDeliveredTotalsCampaignInput[]
  /** Loads the client's saved KPIs when set. */
  clientId?: number | null
  query?: WarehouseQuery
}): Promise<WebReportData> {
  const searchLineItemIds = new Set<string>()
  const socialLineItemIds = new Set<string>()
  const paidAndSearch = readAvPaid({
    campaigns: input.campaigns,
    current: input.windows.current,
    previous: input.windows.previous,
    searchLineItemIds,
    socialLineItemIds,
  }).then(async (paid) => {
    const [searchAds, socialAds] = await Promise.all([
      readSearchAds({
        lineItemIds: searchLineItemIds,
        current: input.windows.current,
        previous: input.windows.previous,
        query: input.query,
      }),
      readSocialAds({
        lineItemIds: socialLineItemIds,
        current: input.windows.current,
        previous: input.windows.previous,
        query: input.query,
      }),
    ])
    return { paid, searchAds, socialAds }
  })
  const [ga4, gsc, { paid, searchAds, socialAds }, kpis] = await Promise.all([
    readGa4({
      propertyId: input.ga4PropertyId,
      today: input.today,
      current: input.windows.current,
      previous: input.windows.previous,
      query: input.query,
    }),
    readGsc({
      site: input.gscSite,
      today: input.today,
      current: input.windows.current,
      previous: input.windows.previous,
      brandTerms: input.brandTerms,
      query: input.query,
    }),
    paidAndSearch,
    input.clientId != null
      ? loadKpiReport({
          clientId: input.clientId,
          window: input.windows.current,
          today: input.today,
          ga4PropertyId: input.ga4PropertyId,
          gscSite: input.gscSite,
          query: input.query,
        })
      : Promise.resolve(undefined),
  ])
  const data: WebReportData = {
    windows: input.windows,
    ga4Property: input.ga4PropertyId ? (input.ga4PropertyName ?? input.ga4PropertyId) : null,
    gscSite: input.gscSite,
    ga4,
    gsc,
    paid,
    searchAds,
    socialAds,
  }
  if (kpis) data.kpis = kpis
  return data
}
