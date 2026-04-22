"use client"

import type { ReactNode } from "react"

import { BoxPlotChart } from "@/components/charts/BoxPlotChart"
import { ComboChart } from "@/components/charts/ComboChart"
import { FunnelChart } from "@/components/charts/FunnelChart"
import { HeatmapTable } from "@/components/charts/HeatmapTable"
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart"
import { NightingaleChart } from "@/components/charts/NightingaleChart"
import { StackedColumnChart } from "@/components/charts/StackedColumnChart"
import { TimeHeatmap } from "@/components/charts/TimeHeatmap"
import { TreemapChart } from "@/components/charts/TreemapChart"
import { WaffleChart } from "@/components/charts/WaffleChart"
import { WaterfallChart } from "@/components/charts/WaterfallChart"
import { ClientBrandProvider } from "@/components/client-dashboard/ClientBrandProvider"
import { buildClientTheme, type ClientBrandTheme } from "@/lib/client-dashboard/theme"

const theme: ClientBrandTheme = buildClientTheme({
  name: "Preview Co",
  brand_primary_hex: "#1A2B78",
})

const stackedWeekly = [
  { week: "W1", search: 1200, social: 800, display: 400 },
  { week: "W2", search: 1400, social: 720, display: 520 },
  { week: "W3", search: 1100, social: 900, display: 480 },
  { week: "W4", search: 1600, social: 640, display: 600 },
]

const stackedMonthly = [
  { month: "Jan", brand: 42, performance: 28, prospecting: 18 },
  { month: "Feb", brand: 38, performance: 34, prospecting: 22 },
  { month: "Mar", brand: 50, performance: 30, prospecting: 20 },
  { month: "Apr", brand: 44, performance: 36, prospecting: 24 },
  { month: "May", brand: 48, performance: 32, prospecting: 26 },
  { month: "Jun", brand: 52, performance: 40, prospecting: 28 },
]

const hBarChannels = [
  { channel: "BVOD", spend: 120000, fees: 18000 },
  { channel: "OLV", spend: 95000, fees: 14250 },
  { channel: "Display", spend: 78000, fees: 11700 },
  { channel: "Audio", spend: 34000, fees: 5100 },
]

const hBarRegions = [
  { region: "NSW", q1: 210, q2: 240, q3: 228 },
  { region: "VIC", q1: 180, q2: 196, q3: 205 },
  { region: "QLD", q1: 140, q2: 152, q3: 160 },
]

const comboTraffic = [
  { day: "Mon", sessions: 12000, conversions: 420 },
  { day: "Tue", sessions: 13200, conversions: 480 },
  { day: "Wed", sessions: 11800, conversions: 390 },
  { day: "Thu", sessions: 14500, conversions: 510 },
  { day: "Fri", sessions: 13900, conversions: 502 },
]

const comboRevenue = [
  { week: "W1", revenue: 184000, transactions: 920 },
  { week: "W2", revenue: 196500, transactions: 880 },
  { week: "W3", revenue: 172200, transactions: 760 },
  { week: "W4", revenue: 205000, transactions: 1010 },
]

const funnelRetail = [
  { name: "Site visits", value: 120000 },
  { name: "Product views", value: 48000 },
  { name: "Add to cart", value: 12000 },
  { name: "Checkout", value: 6200 },
  { name: "Purchase", value: 4100 },
]

const funnelB2b = [
  { name: "Leads", value: 2400 },
  { name: "MQL", value: 980 },
  { name: "SQL", value: 420 },
  { name: "Oppty", value: 160 },
  { name: "Closed won", value: 48 },
]

const treemapWithIntensity = [
  { name: "Retail", size: 420, intensity: 88 },
  { name: "Grocery", size: 310, intensity: 62 },
  { name: "Travel", size: 180, intensity: 35 },
  { name: "Auto", size: 140, intensity: 20 },
]

const treemapPaletteOnly = [
  { name: "Alpha", size: 300 },
  { name: "Beta", size: 260 },
  { name: "Gamma", size: 190 },
  { name: "Delta", size: 150 },
  { name: "Epsilon", size: 100 },
]

const heatRowsA: Record<string, unknown>[] = [
  { publisher: "Pub A", impressions: 1200000, ctr: 0.018, spend: 42000 },
  { publisher: "Pub B", impressions: 980000, ctr: 0.022, spend: 38000 },
  { publisher: "Pub C", impressions: 760000, ctr: 0.015, spend: 29000 },
]

const heatRowsB: Record<string, unknown>[] = [
  { dma: "Sydney", reach: 2.1, freq: 4.2, grp: 180 },
  { dma: "Melbourne", reach: 1.9, freq: 3.8, grp: 160 },
  { dma: "Brisbane", reach: 1.4, freq: 3.1, grp: 120 },
]

const waterfallRevenue = [
  { label: "Start", value: 220000, type: "start" as const },
  { label: "Upsell", value: 32000, type: "positive" as const },
  { label: "Churn", value: -18000, type: "negative" as const },
  { label: "Promo", value: 11000, type: "positive" as const },
  { label: "Total", value: 245000, type: "total" as const },
]

const waterfallMargin = [
  { label: "Start", value: 68000, type: "start" as const },
  { label: "Media", value: -14000, type: "negative" as const },
  { label: "Ops", value: -9000, type: "negative" as const },
  { label: "Efficiency", value: 7000, type: "positive" as const },
  { label: "Total", value: 52000, type: "total" as const },
]

const nightingaleA = [
  { label: "Search", value: 82 },
  { label: "Social", value: 63 },
  { label: "Video", value: 54 },
  { label: "OOH", value: 40 },
  { label: "Radio", value: 31 },
]

const nightingaleB = [
  { label: "NSW", value: 74 },
  { label: "VIC", value: 65 },
  { label: "QLD", value: 58 },
  { label: "WA", value: 36 },
]

const waffleA = [
  { label: "Brand", pct: 46 },
  { label: "Performance", pct: 34 },
  { label: "Retention", pct: 12 },
]

const waffleB = [
  { label: "Awareness", pct: 52 },
  { label: "Consideration", pct: 27 },
  { label: "Conversion", pct: 15 },
]

const timeHeatA = [
  [12, 16, 20, 28, 30, 24],
  [10, 14, 18, 22, 25, 19],
  [8, 12, 15, 18, 21, 17],
  [9, 13, 17, 24, 27, 20],
]

const timeHeatB = [
  [130, 150, 170, 165, 140],
  [110, 138, 160, 154, 132],
  [98, 120, 145, 140, 118],
]

const boxDataA = [
  { label: "Search", min: 18, q1: 24, median: 32, q3: 41, max: 56, outliers: [62] },
  { label: "Social", min: 14, q1: 22, median: 28, q3: 35, max: 48, outliers: [52] },
  { label: "Video", min: 16, q1: 20, median: 27, q3: 33, max: 44 },
  { label: "Display", min: 11, q1: 17, median: 24, q3: 30, max: 39, outliers: [42] },
]

const boxDataB = [
  { label: "NSW", min: 21000, q1: 26000, median: 30000, q3: 36000, max: 42000, outliers: [47000] },
  { label: "VIC", min: 19000, q1: 24000, median: 28000, q3: 33000, max: 40000 },
  { label: "QLD", min: 15000, q1: 21000, median: 25000, q3: 30000, max: 35500, outliers: [38000] },
]

function currencyAud(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n)
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

export default function ClientDashboardChartsPreviewPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Client dashboard charts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recharts primitives using <code className="rounded bg-muted px-1 py-0.5 text-xs">useClientBrand</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">getChartPalette</code>. Each block shows two data shapes.{" "}
          <a className="font-medium text-primary underline-offset-4 hover:underline" href="/client-dashboard/_preview/primitives">
            Back to primitives preview
          </a>
          .
        </p>
      </div>

      <ClientBrandProvider theme={theme}>
        <div className="space-y-10">
          <Section title="StackedColumnChart — weekly vs monthly">
            <StackedColumnChart
              data={stackedWeekly}
              xKey="week"
              series={[
                { key: "search", label: "Search" },
                { key: "social", label: "Social" },
                { key: "display", label: "Display" },
              ]}
              height={280}
            />
            <StackedColumnChart
              data={stackedMonthly}
              xKey="month"
              series={[
                { key: "brand", label: "Brand" },
                { key: "performance", label: "Performance" },
                { key: "prospecting", label: "Prospecting" },
              ]}
              height={300}
            />
          </Section>

          <Section title="HorizontalBarChart — channels vs regions">
            <HorizontalBarChart
              data={hBarChannels}
              xKey="channel"
              series={[
                { key: "spend", label: "Media spend" },
                { key: "fees", label: "Fees" },
              ]}
              xAxisFormatter={(v) => currencyAud(v)}
              height={260}
            />
            <HorizontalBarChart
              data={hBarRegions}
              xKey="region"
              series={[
                { key: "q1", label: "Q1" },
                { key: "q2", label: "Q2" },
                { key: "q3", label: "Q3" },
              ]}
              height={240}
            />
          </Section>

          <Section title="ComboChart — traffic + conversions; revenue + transactions (dual axis)">
            <ComboChart
              data={comboTraffic}
              xKey="day"
              bars={[{ key: "sessions", label: "Sessions" }]}
              lines={[{ key: "conversions", label: "Conversions", yAxis: "right" }]}
              height={280}
            />
            <ComboChart
              data={comboRevenue}
              xKey="week"
              bars={[{ key: "revenue", label: "Revenue" }]}
              lines={[{ key: "transactions", label: "Transactions", yAxis: "right" }]}
              height={300}
            />
          </Section>

          <Section title="FunnelChart — retail vs B2B">
            <FunnelChart data={funnelRetail} height={380} />
            <FunnelChart data={funnelB2b} height={360} />
          </Section>

          <Section title="TreemapChart — intensity vs palette cycle">
            <TreemapChart data={treemapWithIntensity} height={280} />
            <TreemapChart data={treemapPaletteOnly} height={260} />
          </Section>

          <Section title="HeatmapTable — spend / CTR vs reach / GRP">
            <HeatmapTable
              data={heatRowsA}
              columns={[
                { key: "publisher", label: "Publisher" },
                {
                  key: "impressions",
                  label: "Impressions",
                  align: "right",
                  mono: true,
                  heatmap: true,
                  format: (v) => (typeof v === "number" ? v.toLocaleString() : String(v)),
                },
                {
                  key: "ctr",
                  label: "CTR",
                  align: "right",
                  mono: true,
                  heatmap: true,
                  format: (v) => (typeof v === "number" ? `${(v * 100).toFixed(2)}%` : ""),
                },
                {
                  key: "spend",
                  label: "Spend",
                  align: "right",
                  mono: true,
                  heatmap: true,
                  format: (v) => (typeof v === "number" ? currencyAud(v) : ""),
                },
              ]}
            />
            <HeatmapTable
              data={heatRowsB}
              columns={[
                { key: "dma", label: "Market" },
                {
                  key: "reach",
                  label: "Reach (m)",
                  align: "right",
                  mono: true,
                  heatmap: true,
                  format: (v) => (typeof v === "number" ? v.toFixed(1) : ""),
                },
                {
                  key: "freq",
                  label: "Freq",
                  align: "right",
                  mono: true,
                  heatmap: true,
                  format: (v) => (typeof v === "number" ? v.toFixed(1) : ""),
                },
                {
                  key: "grp",
                  label: "GRP",
                  align: "right",
                  mono: true,
                  heatmap: true,
                  format: (v) => (typeof v === "number" ? String(Math.round(v)) : ""),
                },
              ]}
            />
          </Section>

          <Section title="WaterfallChart — revenue bridge and margin bridge">
            <WaterfallChart data={waterfallRevenue} height={280} />
            <WaterfallChart data={waterfallMargin} height={280} />
          </Section>

          <Section title="NightingaleChart — channel mix and region mix">
            <NightingaleChart data={nightingaleA} size={320} />
            <NightingaleChart data={nightingaleB} size={320} />
          </Section>

          <Section title="WaffleChart — objective split and funnel split">
            <WaffleChart data={waffleA} />
            <WaffleChart data={waffleB} />
          </Section>

          <Section title="TimeHeatmap — weekday/hour and market/day">
            <TimeHeatmap
              data={timeHeatA}
              rowLabels={["Mon", "Tue", "Wed", "Thu"]}
              colLabels={["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"]}
            />
            <TimeHeatmap
              data={timeHeatB}
              rowLabels={["Sydney", "Melbourne", "Brisbane"]}
              colLabels={["Mon", "Tue", "Wed", "Thu", "Fri"]}
            />
          </Section>

          <Section title="BoxPlotChart — CPA spread and spend spread">
            <BoxPlotChart data={boxDataA} height={300} />
            <BoxPlotChart data={boxDataB} height={300} valueFormatter={currencyAud} />
          </Section>
        </div>
      </ClientBrandProvider>
    </main>
  )
}
