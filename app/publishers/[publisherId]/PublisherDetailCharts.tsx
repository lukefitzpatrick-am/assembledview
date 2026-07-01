"use client"

import { useMemo } from "react"
import { BarChart3, PieChart as PieChartIcon } from "lucide-react"

import {
  BaseChartCard,
  DonutChart,
  StackedBarChart,
} from "@/components/charts/system"
import { buildDonutSlices } from "@/lib/charts-app/donutSlices"
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
import { ProgressBar } from "@/components/ui/ProgressBar"
import { EmptyState } from "@/components/ui/states"
import {
  FALLBACK_PALETTE,
  getDeterministicColor,
  getMediaColor,
  getMediaLabel,
} from "@/lib/charts/registry"
import { channelColorFor, fmt } from "@/lib/chart-theme"
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
  const chartColourOverride = useMemo(() => {
    if (!accent) return undefined
    return [accent, ...FALLBACK_PALETTE]
  }, [accent])

  const stackedData = useMemo(
    () =>
      analytics.monthlySpend.map((month) => {
        const row: Record<string, string | number> = { month: month.month }
        for (const { mediaType, amount } of month.data) {
          row[mediaType] = amount
        }
        return row
      }),
    [analytics.monthlySpend],
  )

  const series = useMemo(() => {
    const keys = new Set<string>()
    for (const row of stackedData) {
      for (const k of Object.keys(row)) {
        if (k !== "month") keys.add(k)
      }
    }
    return Array.from(keys)
      .sort()
      .map((key, i) => ({
        key,
        label: getMediaLabel(key),
        color: channelColorFor(key, i),
      }))
  }, [stackedData])

  const totalPositiveStacked = useMemo(
    () =>
      stackedData.reduce(
        (sum, row) =>
          sum +
          Object.entries(row).reduce((s, [k, v]) => (k === "month" ? s : s + Math.max(0, Number(v) || 0)), 0),
        0,
      ),
    [stackedData],
  )

  const totalsSpend = analytics.campaigns.reduce((s, c) => s + c.publisherSpendFy, 0)

  const clientDonutSlices = useMemo(() => {
    const { slices, total } = buildDonutSlices(
      analytics.spendByClient.map((c) => ({ key: c.clientName, value: c.amount })),
      12,
      11,
    )
    return {
      total,
      data: slices.map((slice, i) => ({
        label: slice.label,
        value: slice.value,
        color: chartColourOverride?.length
          ? chartColourOverride[i % chartColourOverride.length]!
          : getDeterministicColor(slice.key),
      })),
    }
  }, [analytics.spendByClient, chartColourOverride])

  const pieDataByMediaType = useMemo(() => {
    const byType: Record<string, number> = {}
    for (const month of analytics.monthlySpend) {
      for (const { mediaType, amount } of month.data) {
        byType[mediaType] = (byType[mediaType] || 0) + amount
      }
    }
    return Object.entries(byType)
      .filter(([, amount]) => amount > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [analytics.monthlySpend])

  const mediaTypeDonut = useMemo(() => {
    const { slices, total } = buildDonutSlices(
      pieDataByMediaType.map((d) => ({ key: d.name, value: d.value })),
      12,
      11,
      getMediaLabel,
    )
    return {
      total,
      data: slices.map((slice, i) => ({
        label: getMediaLabel(slice.key),
        value: slice.value,
        color: channelColorFor(slice.key, i),
      })),
    }
  }, [pieDataByMediaType])

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
          <BaseChartCard
            title="Monthly spend by media type"
            subtitle="Australian financial year, this publisher only"
            className="h-full border-border/40 bg-card shadow-sm"
          >
            {stackedData.length === 0 || totalPositiveStacked <= 0 ? (
              <EmptyState
                className="min-h-[240px] border-0 bg-transparent"
                title="No monthly spend data for this period"
                message={null}
              />
            ) : (
              <StackedBarChart
                data={stackedData}
                xKey="month"
                series={series}
                valueFormat="dollars"
                className="min-h-[280px] w-full"
              />
            )}
          </BaseChartCard>
        </PanelRowCell>
        <PanelRowCell span={showMediaTypePie ? "third" : "half"}>
          {clientDonutSlices.data.length === 0 ? (
            <Panel className="h-full border-border/40 bg-card shadow-sm">
              <PanelHeader className="border-b border-border/40 bg-muted/10 px-6 py-4">
                <PanelTitle>Spend by client</PanelTitle>
                <PanelDescription>No FY spend attributed to this publisher to chart by client.</PanelDescription>
              </PanelHeader>
            </Panel>
          ) : (
            <BaseChartCard
              title="Spend by client"
              subtitle={"Share of this publisher's FY spend by client"}
              className="h-full border-border/40 bg-card shadow-sm"
            >
              <DonutChart
                data={clientDonutSlices.data}
                centerValue={fmt.currencyCompact(clientDonutSlices.total)}
                centerLabel="Total"
                valueFormat="dollars"
                className="min-h-[280px] w-full"
              />
            </BaseChartCard>
          )}
        </PanelRowCell>
        {showMediaTypePie ? (
          <PanelRowCell span="third">
            <BaseChartCard
              title="Spend by media type"
              subtitle="FY totals split across media types with spend for this publisher"
              className="h-full border-border/40 bg-card shadow-sm"
            >
              <DonutChart
                data={mediaTypeDonut.data}
                centerValue={fmt.currencyCompact(mediaTypeDonut.total)}
                centerLabel="Total"
                valueFormat="dollars"
                className="min-h-[280px] w-full"
              />
            </BaseChartCard>
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
            const sharePercentage =
              entry.totalMarketSpend > 0 ? (entry.thisPublisherSpend / entry.totalMarketSpend) * 100 : 0
            return (
              <PanelRowCell key={entry.mediaType} span={span}>
                <BaseChartCard
                  title={label}
                  subtitle={`Share of total ${label} spend this FY`}
                  className="h-full border-border/40 bg-card shadow-e1"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{publisherName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Publisher spend</p>
                      </div>
                      <div className="text-right">
                        <p className="num text-sm font-semibold text-foreground">
                          {fmt.currencyCompact(entry.thisPublisherSpend)}
                        </p>
                        <p className="num mt-1 text-xs text-muted-foreground">
                          {Math.round(sharePercentage)}%
                        </p>
                      </div>
                    </div>
                    <ProgressBar
                      value={entry.thisPublisherSpend}
                      max={entry.totalMarketSpend}
                      size="pacing"
                      color="info"
                      animated={false}
                    />
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>Total market</span>
                      <span className="num font-medium">{fmt.currencyCompact(entry.totalMarketSpend)}</span>
                    </div>
                  </div>
                </BaseChartCard>
              </PanelRowCell>
            )
          })}
        </PanelRow>
      ) : null}
    </div>
  )
}
