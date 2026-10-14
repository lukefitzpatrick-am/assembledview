import "server-only"

import type { ClientDeliveredTotalsCampaignInput } from "@/lib/delivery/getDeliveredTotalsForClient"
import { readGa4 } from "@/lib/webReport/data/ga4"
import { readGsc } from "@/lib/webReport/data/gsc"
import { readAvPaid } from "@/lib/webReport/data/paid"
import type { ReportWindows } from "@/lib/webReport/periods"
import type { WarehouseQuery, WebReportData } from "@/lib/webReport/types"

export async function loadWebReportData(input: {
  windows: ReportWindows
  today: string
  ga4PropertyId: string | null
  gscSite: string | null
  brandTerms: readonly string[]
  campaigns: ClientDeliveredTotalsCampaignInput[]
  query?: WarehouseQuery
}): Promise<WebReportData> {
  const [ga4, gsc, paid] = await Promise.all([
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
    readAvPaid({
      campaigns: input.campaigns,
      current: input.windows.current,
      previous: input.windows.previous,
    }),
  ])
  return {
    windows: input.windows,
    ga4Property: input.ga4PropertyId ? `properties/${input.ga4PropertyId}` : null,
    gscSite: input.gscSite,
    ga4,
    gsc,
    paid,
  }
}
