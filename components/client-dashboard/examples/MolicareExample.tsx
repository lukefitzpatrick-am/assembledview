"use client"

import { useMemo, useState } from "react"

import { BrandAccentHeader } from "@/components/client-dashboard/BrandAccentHeader"
import { ClientBrandProvider } from "@/components/client-dashboard/ClientBrandProvider"
import { DashboardHeader } from "@/components/client-dashboard/DashboardHeader"
import { MetricCard } from "@/components/client-dashboard/MetricCard"
import BaseChartCard from "@/components/charts/BaseChartCard"
import { BoxPlotChart } from "@/components/charts/BoxPlotChart"
import { FunnelChart } from "@/components/charts/FunnelChart"
import { HeatmapTable } from "@/components/charts/HeatmapTable"
import { StackedColumnChart } from "@/components/charts/StackedColumnChart"
import { TimeHeatmap } from "@/components/charts/TimeHeatmap"
import { TreemapChart } from "@/components/charts/TreemapChart"
import { Panel, PanelContent } from "@/components/layout/Panel"
import {
  boxplot,
  channelDaily,
  funnel,
  heatmap,
  keyKpis,
  snapshot,
  sourceMedium,
  treemap,
} from "@/lib/client-dashboard/mocks/molicare"
import { buildClientTheme } from "@/lib/client-dashboard/theme"
import { formatCurrencyFull } from "@/lib/format/currency"

/**
 * Mock — replace with theme from Xano in production.
 * Designer reference token (also fed into `buildClientTheme` below).
 */
export const MOCK_MOLICARE_PRIMARY_HEX = "#1A2B78" as const

const MOCK_PRIMARY_DARK = "#111F5C" as const

const molTheme = buildClientTheme({
  name: "MoliCare",
  sub_name: "by HARTMANN",
  brand_primary_hex: MOCK_MOLICARE_PRIMARY_HEX,
  brand_primary_dark_hex: MOCK_PRIMARY_DARK,
})

const channelSeries = [
  { key: "paidSocial", label: "Paid social" },
  { key: "paidSearch", label: "Paid search" },
  { key: "organic", label: "Organic" },
  { key: "direct", label: "Direct" },
  { key: "referral", label: "Referral" },
] as const

const sourceRows = sourceMedium.map((r) => ({
  sourceMedium: r.sourceMedium,
  sessions: r.sessions,
  conversions: r.conversions,
  conversionRatePct: r.conversionRatePct,
}))

export function MolicareExample() {
  const [rangeLabel, setRangeLabel] = useState("Last 28 days (mock)")

  const funnelData = useMemo(() => funnel.map((s) => ({ name: s.label, value: s.value })), [])
  const chartDaily = useMemo(() => [...channelDaily], [])
  const treemapData = useMemo(() => [...treemap], [])

  return (
    <ClientBrandProvider theme={molTheme}>
      <div className="space-y-5">
        <DashboardHeader
          dateRangeLabel={rangeLabel}
          onDateRangeChange={() =>
            setRangeLabel((p) => (p.includes("Feb") ? "Last 28 days (mock)" : "Feb 1 – Feb 28, 2026 (mock)"))
          }
          dashboardTitle="Marketing performance"
        />

        <Panel>
          <BrandAccentHeader title="Key KPIs" description="Mock fixtures — Snowflake marts in next phase." />
          <PanelContent standalone className="!px-4 !py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {keyKpis.map((k) => (
                <MetricCard
                  key={k.label}
                  label={k.label}
                  value={k.value}
                  delta={k.deltaPct}
                  invertDelta={k.invertDelta}
                  emphasis
                />
              ))}
            </div>
          </PanelContent>
        </Panel>

        <Panel>
          <BrandAccentHeader title="Key snapshot" description="Eight headline metrics for the period." />
          <PanelContent standalone className="!px-4 !py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {snapshot.map((s) => (
                <MetricCard key={s.label} label={s.label} value={s.value} subLabel={s.hint} />
              ))}
            </div>
          </PanelContent>
        </Panel>

        <BaseChartCard
          title="Daily sessions by channel"
          description="Stacked volume by acquisition channel."
          variant="accent"
        >
          <StackedColumnChart
            data={chartDaily}
            xKey="date"
            series={[...channelSeries]}
            height={260}
            valueFormatter={(v) => Math.round(v).toLocaleString("en-AU", { maximumFractionDigits: 0 })}
          />
        </BaseChartCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <BaseChartCard title="Conversion funnel" variant="accent" className="lg:col-span-2">
            <FunnelChart data={funnelData} height={320} />
          </BaseChartCard>
          <BaseChartCard title="CPA distribution by campaign" variant="accent" className="lg:col-span-3">
            <BoxPlotChart
              data={[...boxplot]}
              height={300}
              valueFormatter={(v) =>
                formatCurrencyFull(v, {
                  locale: "en-AU",
                  currency: "AUD",
                  maximumFractionDigits: 0,
                  minimumFractionDigits: 0,
                })}
            />
          </BaseChartCard>
        </div>

        <BaseChartCard
          title="Top pages by views"
          description="Rectangle size = views, colour intensity = engagement rate."
          variant="accent"
        >
          <TreemapChart data={treemapData} height={260} />
        </BaseChartCard>

        <BaseChartCard title="Traffic by hour × day of week" variant="accent">
          <TimeHeatmap data={heatmap.data} rowLabels={heatmap.rowLabels} colLabels={heatmap.colLabels} />
        </BaseChartCard>

        <BaseChartCard title="Source / medium performance" variant="accent">
          <HeatmapTable
            data={sourceRows}
            columns={[
              { key: "sourceMedium", label: "Source / medium" },
              {
                key: "sessions",
                label: "Sessions",
                align: "right",
                mono: true,
                heatmap: true,
                format: (v) => (typeof v === "number" ? v.toLocaleString() : ""),
              },
              {
                key: "conversions",
                label: "Conversions",
                align: "right",
                mono: true,
                heatmap: true,
                format: (v) => (typeof v === "number" ? v.toLocaleString() : ""),
              },
              {
                key: "conversionRatePct",
                label: "Conv. rate",
                align: "right",
                mono: true,
                heatmap: true,
                format: (v) => (typeof v === "number" ? `${v.toFixed(1)}%` : ""),
              },
            ]}
          />
        </BaseChartCard>
      </div>
    </ClientBrandProvider>
  )
}
