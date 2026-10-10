"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts"

import { Section } from "@/components/layout/Section"
import { segmentChipClass } from "@/components/layout/navChip"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { StatusPill } from "@/components/ui/status-pill"
import { auFyFilterOptions, currentFy } from "@/lib/dates/auFinancialYear"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import {
  formatHomeStartDay,
  homeSpendInsight,
  plannedBarsFromClientMonths,
  type HomeMonthBar,
} from "@/lib/dashboard/homeBrief"
import { formatMoneyCompact } from "@/lib/format/money"
import { BRAND } from "@/lib/brand"
import { useChartTheme } from "@/lib/chart-theme"
import {
  campaignDisplayBand,
  campaignPaceLabel,
  displayBandBadgeVariant,
} from "@/lib/pacing/portfolio/portfolioPresentation"
import { isAttentionRow } from "@/lib/pacing/portfolio/portfolioRowFlags"
import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"

export type HomeAttentionState =
  | { status: "loading" }
  | { status: "building" }
  | { status: "error" }
  | { status: "ready"; count: number; rows: CampaignPacingRow[] }

export function HomeAttentionList({ attention }: { attention: HomeAttentionState }) {
  const rows =
    attention.status === "ready" ? attention.rows.filter(isAttentionRow).slice(0, 5) : []

  return (
    <div className="rounded-card bg-card p-5 lg:col-span-8">
      <Section
        title="Needs attention"
        actions={
          <Link href="/pacing/portfolio" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">
            Open pacing
          </Link>
        }
      >
        {attention.status === "loading" ? (
          <p className="text-sm text-muted-foreground">Loading pacing.</p>
        ) : attention.status === "building" ? (
          <p className="text-sm text-muted-foreground">Pacing snapshot is still building.</p>
        ) : attention.status === "error" ? (
          <p className="text-sm text-muted-foreground">Pacing could not be loaded.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs a look.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const band = campaignDisplayBand(row)
              return (
                <li key={row.mbaNumber} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0">
                      <span className="text-[13px] text-muted-foreground">{row.clientName}</span>
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      <span className="font-semibold text-foreground">{row.campaignName}</span>
                    </p>
                    <StatusPill tone={displayBandBadgeVariant(band)} label={campaignPaceLabel(row)} />
                  </div>
                  {row.why ? <p className="text-sm text-text-secondary">{row.why}</p> : null}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}

export function HomeStartingSoon({
  campaigns,
}: {
  campaigns: Array<{
    id: number
    mp_campaignname?: string | null
    mp_clientname?: string | null
    mp_campaigndates_start?: string | null
  }>
}) {
  return (
    <div className="rounded-card bg-card p-5 lg:col-span-4">
      <Section title="Starting soon">
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing starts in the next 10 days.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {campaigns.map((plan) => (
              <li key={plan.id} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{plan.mp_campaignname}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{plan.mp_clientname}</p>
                </div>
                <p className="num shrink-0 text-[13px] text-muted-foreground">
                  {formatHomeStartDay(plan.mp_campaigndates_start)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

const SPEND_CONFIG = {
  planned: { label: "Planned", color: "var(--chart-2)" },
} satisfies ChartConfig

export function HomeSpendRow() {
  const theme = useChartTheme()
  const [fy, setFy] = useState(() => currentFy())
  const [bars, setBars] = useState<HomeMonthBar[] | null>(null)
  const [failed, setFailed] = useState(false)
  const todayIso = getMelbourneTodayISO()
  const current = currentFy()
  const showingCurrent = fy === current
  const fyOptions = useMemo(() => auFyFilterOptions().filter((option) => option.value !== "all"), [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/dashboard/global-monthly-client-spend", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<{ data?: unknown }>
      })
      .then((body) => {
        if (cancelled) return
        const rows = Array.isArray(body.data) ? body.data : []
        setBars(plannedBarsFromClientMonths(rows, getMelbourneTodayISO()))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const insight = showingCurrent && bars ? homeSpendInsight(bars, todayIso) : null

  return (
    <>
      <div className="rounded-card bg-card p-5 lg:col-span-8">
        <Section
          title="Spend by month"
          actions={
            <div className="flex flex-wrap gap-1" role="group" aria-label="Financial year">
              {fyOptions.map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={option.value === fy}
                  className={segmentChipClass(option.value === fy)}
                  onClick={() => {
                    if (typeof option.value === "number") setFy(option.value)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        >
          {!showingCurrent ? (
            <p className="text-sm text-muted-foreground">
              Monthly planned is loaded for the current financial year only.
            </p>
          ) : failed ? (
            <p className="text-sm text-muted-foreground">Monthly planned could not be loaded.</p>
          ) : !bars ? (
            <p className="text-sm text-muted-foreground">Loading planned spend.</p>
          ) : (
            <>
              <ChartContainer config={SPEND_CONFIG} className="aspect-auto h-[220px] w-full">
                <BarChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: theme.axisText }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(value) => formatMoneyCompact(Number(value))}
                    tick={{ fontSize: 11, fill: theme.axisText }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatMoneyCompact(Number(value), { millionScale: "home-spend" })}
                      />
                    }
                  />
                  <Bar dataKey="planned" radius={[theme.barRadius, theme.barRadius, 0, 0]} isAnimationActive={false}>
                    {bars.map((bar) => (
                      <Cell
                        key={bar.month}
                        fill={bar.inProgress ? BRAND.colour.lime : theme.context}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
              <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <i className="size-2 rounded-full" style={{ background: theme.context }} />
                  Planned
                </span>
                <span className="inline-flex items-center gap-2">
                  <i className="size-2 rounded-full bg-am-lime" />
                  Month in progress
                </span>
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Planned media from published schedules. Delivered by month is not loaded on Home.
              </p>
            </>
          )}
        </Section>
      </div>
      <div className="flex flex-col gap-3 rounded-card bg-card p-5 lg:col-span-4">
        <span className="inline-flex w-fit rounded-pill bg-am-sky px-3 py-0.5 text-xs font-bold text-am-ink">
          Insight
        </span>
        <p className="text-[16px] font-semibold leading-snug text-foreground">
          {insight ?? "Last month's delivered spend is not loaded on Home."}
        </p>
        <p className="text-[12px] text-muted-foreground">Calculated from published plans.</p>
      </div>
    </>
  )
}
