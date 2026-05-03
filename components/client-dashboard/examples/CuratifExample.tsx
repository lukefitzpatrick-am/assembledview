"use client"

import { useMemo, useState } from "react"

import { BrandAccentHeader } from "@/components/client-dashboard/BrandAccentHeader"
import { ClientBrandProvider } from "@/components/client-dashboard/ClientBrandProvider"
import { DashboardHeader } from "@/components/client-dashboard/DashboardHeader"
import { MetricCard } from "@/components/client-dashboard/MetricCard"
import BaseChartCard from "@/components/charts/BaseChartCard"
import { ComboChart } from "@/components/charts/ComboChart"
import { FunnelChart } from "@/components/charts/FunnelChart"
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart"
import { NightingaleChart } from "@/components/charts/NightingaleChart"
import { WaffleChart } from "@/components/charts/WaffleChart"
import { WaterfallChart } from "@/components/charts/WaterfallChart"
import { Panel, PanelContent } from "@/components/layout/Panel"
import {
  budgetMix,
  channelRevenue,
  funnel,
  keyKpis,
  nightingale,
  revenueDaily,
  snapshot,
  waterfall,
} from "@/lib/client-dashboard/mocks/curatif"
import { buildClientTheme } from "@/lib/client-dashboard/theme"
import { formatCurrencyFull } from "@/lib/format/currency"

/**
 * Mock — replace with theme from Xano in production.
 * Designer reference token (also fed into `buildClientTheme` below).
 */
export const MOCK_CURATIF_PRIMARY_HEX = "#0E9384" as const

const MOCK_PRIMARY_DARK = "#0B7568" as const

const curTheme = buildClientTheme({
  name: "Curatif",
  brand_primary_hex: MOCK_CURATIF_PRIMARY_HEX,
  brand_primary_dark_hex: MOCK_PRIMARY_DARK,
})

const currencyFmt = (v: number) =>
  formatCurrencyFull(v, { locale: "en-AU", currency: "AUD", maximumFractionDigits: 0, minimumFractionDigits: 0 })

export function CuratifExample() {
  const [rangeLabel, setRangeLabel] = useState("Last 28 days (mock)")

  const funnelData = useMemo(() => funnel.map((s) => ({ name: s.label, value: s.value })), [])
  const comboData = useMemo(
    () =>
      revenueDaily.map((d) => ({
        day: d.date.slice(5),
        revenue: d.revenue,
        transactions: d.transactions,
      })),
    [],
  )
  const waterfallData = useMemo(() => [...waterfall], [])
  const nightingaleData = useMemo(() => [...nightingale], [])
  const waffleData = useMemo(() => budgetMix.map((b) => ({ label: b.label, pct: b.pct })), [])
  const channelBarData = useMemo(
    () =>
      channelRevenue.map((c) => ({
        channel: c.channel,
        newCust: c.newCustomerRevenue,
        returning: c.returningCustomerRevenue,
      })),
    [],
  )

  return (
    <ClientBrandProvider theme={curTheme}>
      <div className="space-y-5">
        <DashboardHeader
          dateRangeLabel={rangeLabel}
          onDateRangeChange={() =>
            setRangeLabel((p) => (p.includes("Feb") ? "Last 28 days (mock)" : "Feb 1 – Feb 28, 2026 (mock)"))
          }
          dashboardTitle="E‑commerce performance"
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
          <BrandAccentHeader title="Key snapshot" />
          <PanelContent standalone className="!px-4 !py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {snapshot.map((s) => (
                <MetricCard key={s.label} label={s.label} value={s.value} subLabel={s.hint} />
              ))}
            </div>
          </PanelContent>
        </Panel>

        <BaseChartCard
          title="Revenue & transactions"
          description="Daily revenue vs order volume."
          variant="accent"
        >
          <ComboChart
            data={comboData}
            xKey="day"
            bars={[{ key: "revenue", label: "Revenue" }]}
            lines={[{ key: "transactions", label: "Transactions", yAxis: "right" }]}
            countDataKeys={["transactions"]}
            height={260}
          />
        </BaseChartCard>

        <BaseChartCard title="Revenue bridge — prior vs current" variant="accent">
          <WaterfallChart data={waterfallData} height={280} valueFormatter={currencyFmt} />
        </BaseChartCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <BaseChartCard title="Purchase funnel" variant="accent">
            <FunnelChart data={funnelData} height={300} />
          </BaseChartCard>
          <BaseChartCard title="Channel revenue share" variant="accent">
            <NightingaleChart data={nightingaleData} size={260} />
          </BaseChartCard>
          <BaseChartCard title="Media budget mix" variant="accent">
            <WaffleChart data={waffleData} />
          </BaseChartCard>
        </div>

        <BaseChartCard title="Channel revenue — new vs returning" variant="accent">
          <HorizontalBarChart
            data={channelBarData}
            xKey="channel"
            series={[
              { key: "newCust", label: "New customers" },
              { key: "returning", label: "Returning customers" },
            ]}
            xAxisFormatter={currencyFmt}
            height={260}
          />
        </BaseChartCard>
      </div>
    </ClientBrandProvider>
  )
}
