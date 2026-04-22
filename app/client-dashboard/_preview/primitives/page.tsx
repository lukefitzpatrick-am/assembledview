"use client"

import type { ReactNode } from "react"
import { useState } from "react"

import { BrandAccentHeader } from "@/components/client-dashboard/BrandAccentHeader"
import { ClientBrandProvider } from "@/components/client-dashboard/ClientBrandProvider"
import { Chip } from "@/components/client-dashboard/Chip"
import { DashboardHeader } from "@/components/client-dashboard/DashboardHeader"
import { DeltaBadge } from "@/components/client-dashboard/DeltaBadge"
import { MetricCard } from "@/components/client-dashboard/MetricCard"
import { Panel, PanelContent } from "@/components/layout/Panel"
import { Button } from "@/components/ui/button"
import { buildClientTheme, type ClientBrandTheme } from "@/lib/client-dashboard/theme"

const molincareTheme = buildClientTheme({
  name: "MoliCare",
  sub_name: "Continence",
  brand_primary_hex: "#1A2B78",
})

const curatifTheme = buildClientTheme({
  name: "Curatif",
  sub_name: "Spirits",
  brand_primary_hex: "#0E9384",
})

const molincareWithLogo = buildClientTheme({
  name: "MoliCare",
  sub_name: "Continence",
  brand_primary_hex: "#1A2B78",
  dashboard_logo_url: "/assembled-logo.png",
})

const DELTA_SAMPLES: { label: string; value: number | null; inverted?: boolean }[] = [
  { label: "Positive", value: 8.2 },
  { label: "Negative", value: -3.4 },
  { label: "Zero", value: 0 },
  { label: "Inverted +", value: 6.1, inverted: true },
  { label: "Inverted −", value: -2.2, inverted: true },
  { label: "Null", value: null },
]

function DeltaShowcase() {
  return (
    <ul className="flex flex-wrap gap-4">
      {DELTA_SAMPLES.map((s) => (
        <li key={s.label} className="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">{s.label}</span>
          <DeltaBadge value={s.value} inverted={s.inverted} />
        </li>
      ))}
    </ul>
  )
}

function MetricShowcase() {
  const [clicks, setClicks] = useState(0)
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard label="Impressions" value="1.24M" delta={4.2} />
      <MetricCard label="CPA" value="$42.10" delta={-6.5} invertDelta />
      <MetricCard label="Spend" value="$182k" delta={12.4} invertDelta emphasis subLabel="vs. prior period" />
      <MetricCard
        label="CTR"
        value="2.08%"
        delta={0}
        onClick={() => setClicks((c) => c + 1)}
      />
      <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
        Focusable metric (tab to): CTR card is a button. Clicks: {clicks}
      </p>
    </div>
  )
}

function ChipShowcase() {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip>Default</Chip>
      <Chip variant="success">On track</Chip>
      <Chip variant="warning">Review</Chip>
      <Chip variant="danger">At risk</Chip>
    </div>
  )
}

function BrandPanelShowcase() {
  return (
    <Panel className="max-w-xl">
      <BrandAccentHeader
        title="Campaign delivery"
        description="Spend and pacing for the selected MBA."
        actions={
          <Button type="button" size="sm" variant="outline">
            Export
          </Button>
        }
      />
      <PanelContent>
        <p className="text-sm text-muted-foreground">Panel body uses existing PanelContent padding.</p>
      </PanelContent>
    </Panel>
  )
}

function PreviewBlock({
  title,
  theme,
  children,
}: {
  title: string
  theme: ClientBrandTheme
  children: ReactNode
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-background p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <ClientBrandProvider theme={theme}>{children}</ClientBrandProvider>
    </section>
  )
}

export default function ClientDashboardPrimitivesPreviewPage() {
  const [range, setRange] = useState("Jan 1 – Mar 31, 2026")

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Client dashboard primitives</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Preview of KPI cards, chips, accent header, and dashboard chrome. Themes use{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">buildClientTheme</code> with brand primaries for
          MoliCare and Curatif.{" "}
          <a className="font-medium text-primary underline-offset-4 hover:underline" href="/client-dashboard/_preview/charts">
            Open charts preview
          </a>
          .
        </p>
      </div>

      <PreviewBlock title="MoliCare (#1A2B78)" theme={molincareTheme}>
        <div className="space-y-6 rounded-lg border border-dashed border-border bg-dashboard-surface p-4">
          <DashboardHeader
            dateRangeLabel={range}
            onDateRangeChange={() => setRange((r) => (r.includes("Jan") ? "Apr 1 – Jun 30, 2026" : "Jan 1 – Mar 31, 2026"))}
            dashboardTitle="Performance"
          />
          <DeltaShowcase />
          <MetricShowcase />
          <ChipShowcase />
          <BrandPanelShowcase />
        </div>
      </PreviewBlock>

      <PreviewBlock title="Curatif (#0E9384)" theme={curatifTheme}>
        <div className="space-y-6 rounded-lg border border-dashed border-border bg-dashboard-surface p-4">
          <DashboardHeader dateRangeLabel="Last 28 days" dashboardTitle="Performance" />
          <DeltaShowcase />
          <MetricShowcase />
          <ChipShowcase />
          <BrandPanelShowcase />
        </div>
      </PreviewBlock>

      <PreviewBlock title="MoliCare + logo tile" theme={molincareWithLogo}>
        <div className="rounded-lg border border-dashed border-border bg-dashboard-surface p-4">
          <DashboardHeader dateRangeLabel="FY2026 Q1" dashboardTitle="Overview" />
        </div>
      </PreviewBlock>
    </main>
  )
}
