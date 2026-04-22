"use client"

import { useMemo, useState } from "react"

import { BrandAccentHeader } from "@/components/client-dashboard/BrandAccentHeader"
import { ClientBrandProvider } from "@/components/client-dashboard/ClientBrandProvider"
import { DashboardHeader } from "@/components/client-dashboard/DashboardHeader"
import { MetricCard } from "@/components/client-dashboard/MetricCard"
import { ComboBarLineChart } from "@/components/client-dashboard/charts/ComboBarLineChart"
import { FunnelViz } from "@/components/client-dashboard/charts/FunnelViz"
import { NightingaleChart } from "@/components/client-dashboard/charts/NightingaleChart"
import { StackedBarChart } from "@/components/client-dashboard/charts/StackedBarChart"
import { WaffleChart } from "@/components/client-dashboard/charts/WaffleChart"
import { WaterfallChart } from "@/components/client-dashboard/charts/WaterfallChart"
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
import { formatMoney } from "@/lib/utils/money"

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

const currencyFmt = (v: number) => formatMoney(v, { locale: "en-AU", currency: "AUD", maximumFractionDigits: 0 })

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

        <Panel>
          <BrandAccentHeader title="Revenue & transactions" description="Daily revenue vs order volume." />
          <PanelContent standalone className="!px-3 !py-2">
            <ComboBarLineChart
              data={comboData}
              xKey="day"
              bars={[{ key: "revenue", label: "Revenue" }]}
              lines={[{ key: "transactions", label: "Transactions", yAxis: "right" }]}
              height={260}
            />
          </PanelContent>
        </Panel>

        <Panel>
          <BrandAccentHeader title="Revenue bridge — prior vs current" />
          <PanelContent standalone className="!px-3 !py-2">
            <WaterfallChart data={waterfallData} height={280} valueFormatter={currencyFmt} />
          </PanelContent>
        </Panel>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel>
            <BrandAccentHeader title="Purchase funnel" />
            <PanelContent standalone className="!px-2 !py-2">
              <FunnelViz data={funnelData} height={300} />
            </PanelContent>
          </Panel>
          <Panel>
            <BrandAccentHeader title="Channel revenue share" />
            <PanelContent standalone className="!px-2 !py-2">
              <NightingaleChart data={nightingaleData} size={260} />
            </PanelContent>
          </Panel>
          <Panel>
            <BrandAccentHeader title="Media budget mix" />
            <PanelContent standalone className="!px-2 !py-2">
              <WaffleChart data={waffleData} />
            </PanelContent>
          </Panel>
        </div>

        <Panel>
          <BrandAccentHeader title="Channel revenue — new vs returning" />
          <PanelContent standalone className="!px-3 !py-2">
            <StackedBarChart
              data={channelBarData}
              xKey="channel"
              series={[
                { key: "newCust", label: "New customers" },
                { key: "returning", label: "Returning customers" },
              ]}
              xAxisFormatter={currencyFmt}
              height={260}
            />
          </PanelContent>
        </Panel>
      </div>
    </ClientBrandProvider>
  )
}
