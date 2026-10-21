/**
 * Campaign report download file name. Pure: no DB, Snowflake, model or blob
 * imports, so tests can import it without the report generator's graph.
 */
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"
import { campaignReportPeriodFilePart } from "@/lib/reports/campaignReport/reportFigures"

function namePart(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return cleaned || fallback
}

/** Clean download name. Blob storage adds its own random suffix. */
export function campaignReportDownloadName(input: {
  clientName: string
  campaignName: string
  periodStartISO: string
  periodEndISO?: string
  periodKind?: CampaignReportPeriodKind
}): string {
  const client = namePart(input.clientName, "client")
  const campaign = namePart(input.campaignName, "campaign")
  const period = campaignReportPeriodFilePart({
    kind: input.periodKind ?? "this_month",
    startISO: input.periodStartISO,
    endISO: input.periodEndISO ?? input.periodStartISO,
  })
  return `${client}-${campaign}-report-${period}.pptx`
}
