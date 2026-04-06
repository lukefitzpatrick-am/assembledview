"use client"

import { useMemo } from "react"
import { StackedColumnChart, type StackedColumnData } from "@/components/charts/StackedColumnChart"
import { PieChart } from "@/components/charts/PieChart"
import type { PublisherDashboardData } from "@/lib/types/publisher"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { PanelRow, PanelRowCell } from "@/components/layout/PanelRow"
import { TableWithExport } from "@/components/ui/table-with-export"
import { FALLBACK_PALETTE } from "@/lib/charts/registry"
import { normalizeCampaignMediaTypeKey } from "@/lib/publisher/mediaTypeBadges"
import { MEDIA_TYPE_SLUG_TO_DASHBOARD_LABEL } from "@/lib/publisher/scheduleLabels"
import { MediaChannelTag, mediaChannelTagRowClassName } from "@/components/dashboard/MediaChannelTag"

interface PublisherDetailChartsProps {
  analytics: PublisherDashboardData
  brandColour?: string
  publisherId: number
  publisherName: string
}

type CampaignCsvRow = {
  client_name: string
  campaign_name: string
  mba_number: string
  start_date: string
  end_date: string
  fixed_cost_media: string
  targeting_details: string
  publisher_spend_fy_aud: number
  media_types: string
}

export function PublisherDetailCharts({
  analytics,
  brandColour,
  publisherId,
  publisherName,
}: PublisherDetailChartsProps) {
  const accent = brandColour?.trim() ?? ""
  const hasBrandColour = Boolean(accent)
  const chartColourOverride = hasBrandColour ? [accent, ...FALLBACK_PALETTE] : undefined

  const stackedData: StackedColumnData[] = analytics.monthlySpend.map((month) => {
    const row: StackedColumnData = { month: month.month }
    for (const { mediaType, amount } of month.data) {
      row[mediaType] = amount
    }
    return row
  })

  const totalsSpend = analytics.campaigns.reduce((s, c) => s + c.publisherSpendFy, 0)

  const pieDataByClient = analytics.spendByClient.map((c) => ({
    name: c.clientName,
    value: c.amount,
    percentage: c.percentage,
  }))

  const pieDataByMediaType = useMemo(() => {
    const byType: Record<string, number> = {}
    for (const month of analytics.monthlySpend) {
      for (const { mediaType, amount } of month.data) {
        byType[mediaType] = (byType[mediaType] || 0) + amount
      }
    }
    const total = Object.values(byType).reduce((a, b) => a + b, 0)
    return Object.entries(byType)
      .filter(([, amount]) => amount > 0)
      .map(([name, value]) => ({
        name,
        value,
        percentage: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
  }, [analytics.monthlySpend])

  const showMediaTypePie = pieDataByMediaType.length >= 2

  const csvData: CampaignCsvRow[] = useMemo(() => {
    const rows: CampaignCsvRow[] = analytics.campaigns.map((row) => ({
      client_name: row.clientName,
      campaign_name: row.campaignName,
      mba_number: row.mbaNumber,
      start_date: row.startDate,
      end_date: row.endDate,
      fixed_cost_media: row.fixedCostMedia,
      targeting_details: row.targetingDetails,
      publisher_spend_fy_aud: row.publisherSpendFy,
      media_types: row.mediaTypes.join("; "),
    }))
    if (rows.length > 0) {
      rows.push({
        client_name: "Totals",
        campaign_name: "",
        mba_number: "",
        start_date: "",
        end_date: "",
        fixed_cost_media: "",
        targeting_details: "",
        publisher_spend_fy_aud: totalsSpend,
        media_types: "",
      })
    }
    return rows
  }, [analytics.campaigns, totalsSpend])

  const csvHeaders: Record<keyof CampaignCsvRow, string> = {
    client_name: "Client",
    campaign_name: "Campaign",
    mba_number: "MBA",
    start_date: "Start",
    end_date: "End",
    fixed_cost_media: "Fixed cost media",
    targeting_details: "Targeting details",
    publisher_spend_fy_aud: "Publisher spend FY (AUD)",
    media_types: "Media types",
  }

  return (
    <div className="space-y-6">
      <Panel className="overflow-hidden border-border/40 bg-card shadow-sm">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
        <PanelHeader className="border-b border-border/40 pb-4">
          <PanelTitle>Campaigns (current financial year)</PanelTitle>
          <PanelDescription>
            Booked, approved, or completed plans where delivery line items match this publisher. Fixed cost and
            targeting come from those line items in the delivery schedule.
          </PanelDescription>
        </PanelHeader>
        <PanelContent className="overflow-x-auto">
          <TableWithExport
            data={csvData}
            filename={`publisher-${publisherId}-campaigns-fy.csv`}
            headers={csvHeaders}
            exportButtonText="Export CSV"
          >
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>MBA</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Fixed cost media</TableHead>
                  <TableHead>Targeting details</TableHead>
                  <TableHead className="text-right">Publisher spend (FY)</TableHead>
                  <TableHead>Media types</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:nth-child(even)]:bg-muted/5">
                {analytics.campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                      No matching campaigns in the current financial year.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {analytics.campaigns.map((row) => (
                      <TableRow key={row.mbaNumber}>
                        <TableCell>{row.clientName}</TableCell>
                        <TableCell>{row.campaignName}</TableCell>
                        <TableCell>{row.mbaNumber}</TableCell>
                        <TableCell>{row.startDate}</TableCell>
                        <TableCell>{row.endDate}</TableCell>
                        <TableCell>{row.fixedCostMedia}</TableCell>
                        <TableCell className="max-w-[240px] whitespace-normal text-sm text-muted-foreground">
                          {row.targetingDetails || "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${row.publisherSpendFy.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell>
                          <div className={mediaChannelTagRowClassName}>
                            {row.mediaTypes.map((t) => {
                              const slug = normalizeCampaignMediaTypeKey(t)
                              const label = MEDIA_TYPE_SLUG_TO_DASHBOARD_LABEL[slug] ?? t
                              return <MediaChannelTag key={`${row.mbaNumber}-${t}`} label={label} />
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow
                      className="border-t-2 bg-muted/30 font-semibold"
                      style={{ borderTopColor: hasBrandColour ? `${accent}33` : undefined }}
                    >
                      <TableCell colSpan={5}>Totals</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell className="text-right">
                        ${totalsSpend.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </TableWithExport>
        </PanelContent>
      </Panel>

      <PanelRow
        title="Spend visualisation"
        helperText="Monthly spend stacked by media type and FY distribution for this publisher."
      >
        <PanelRowCell span={showMediaTypePie ? "third" : "half"}>
          <StackedColumnChart
            title="Monthly spend by media type"
            description="Australian financial year, this publisher only"
            data={stackedData}
            colors={chartColourOverride}
            cardClassName="h-full border-border/40 bg-card shadow-sm"
            headerClassName="border-b border-border/40 bg-muted/10 px-6 py-4"
            contentClassName="p-6"
          />
        </PanelRowCell>
        <PanelRowCell span={showMediaTypePie ? "third" : "half"}>
          {pieDataByClient.length === 0 ? (
            <Panel className="h-full border-border/40 bg-card shadow-sm">
              <PanelHeader className="border-b border-border/40 bg-muted/10 px-6 py-4">
                <PanelTitle>Spend by client</PanelTitle>
                <PanelDescription>No FY spend attributed to this publisher to chart by client.</PanelDescription>
              </PanelHeader>
            </Panel>
          ) : (
            <PieChart
              title="Spend by client"
              description={"Share of this publisher's FY spend by client"}
              data={pieDataByClient}
              colors={chartColourOverride}
              cardClassName="h-full border-border/40 bg-card shadow-sm"
              headerClassName="border-b border-border/40 bg-muted/10 px-6 py-4"
              contentClassName="p-6"
            />
          )}
        </PanelRowCell>
        {showMediaTypePie ? (
          <PanelRowCell span="third">
            <PieChart
              title="Spend by media type"
              description="FY totals split across media types with spend for this publisher"
              data={pieDataByMediaType}
              colors={chartColourOverride}
              cardClassName="h-full border-border/40 bg-card shadow-sm"
              headerClassName="border-b border-border/40 bg-muted/10 px-6 py-4"
              contentClassName="p-6"
            />
          </PanelRowCell>
        ) : null}
      </PanelRow>

      {analytics.shareByMediaType.length > 0 ? (
        <PanelRow
          title="Market share"
          helperText="This publisher's FY spend as a share of total booked spend across all publishers, per media type."
        >
          {analytics.shareByMediaType.map((entry) => {
            const label = MEDIA_TYPE_SLUG_TO_DASHBOARD_LABEL[entry.mediaType] ?? entry.mediaType
            const span = analytics.shareByMediaType.length >= 3 ? "third" : "half"
            const marketSharePieColors = [brandColour ?? FALLBACK_PALETTE[0], "#e5e7eb"] as string[]
            return (
              <PanelRowCell key={entry.mediaType} span={span}>
                <PieChart
                  title={label}
                  description={`Share of total ${label} spend this FY`}
                  data={[
                    {
                      name: publisherName,
                      value: entry.thisPublisherSpend,
                      percentage: entry.sharePercent,
                    },
                    {
                      name: "Other publishers",
                      value: entry.totalMarketSpend - entry.thisPublisherSpend,
                      percentage: 100 - entry.sharePercent,
                    },
                  ]}
                  colors={marketSharePieColors}
                  cardClassName="h-full border-border/40 bg-card shadow-sm"
                  headerClassName="border-b border-border/40 bg-muted/10 px-6 py-4"
                  contentClassName="p-6"
                />
              </PanelRowCell>
            )
          })}
        </PanelRow>
      ) : null}
    </div>
  )
}
