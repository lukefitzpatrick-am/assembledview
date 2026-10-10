/**
 * Campaign KPI sheet rows for a published version.
 * Spend, deliverables and estimates come from the persisted lines.
 * Saved campaign, client and publisher KPI rows supply the rates.
 */
import type { KPISheetRow, MediaItems } from "@/lib/generateMediaPlan"
import { readAllPublisherKpis, readCampaignKpis, readClientKpis } from "@/lib/data/readKpi"
import { toKpiSheetRows } from "@/lib/kpi/kpiWorkbook"
import { resolveAllKPIs } from "@/lib/kpi/resolve"
import type { ClientKPI, PublisherKPI } from "@/lib/kpi/types"
import type { Publisher } from "@/lib/types/publisher"

export async function publishedKpiSheetRows(args: {
  mediaItems: MediaItems
  publishers: Publisher[]
  clientName: string
  mbaNumber: string
  versionNumber: number
  campaignName: string
}): Promise<KPISheetRow[]> {
  const [savedCampaignKPIs, clientKPIs, publisherKPIs] = await Promise.all([
    readCampaignKpis(args.mbaNumber, args.versionNumber),
    readClientKpis(args.clientName),
    readAllPublisherKpis(),
  ])
  const resolved = resolveAllKPIs({
    mediaItemsByType: args.mediaItems as unknown as Record<string, any[]>,
    clientName: args.clientName,
    mbaNumber: args.mbaNumber,
    versionNumber: args.versionNumber,
    campaignName: args.campaignName,
    publisherKPIs: publisherKPIs as unknown as PublisherKPI[],
    clientKPIs: clientKPIs as unknown as ClientKPI[],
    savedCampaignKPIs,
    publishers: args.publishers,
  })
  return toKpiSheetRows(resolved)
}
