"use client"

import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { useEffect, useState } from "react"
import { useReducedMotion } from "framer-motion"

import {
  clampBudgetUtilizationPct,
  getBudgetUtilizationKpiTone,
} from "@/lib/dashboard/budgetUtilKpi"
import { hasReportedDeliveredSpend } from "@/lib/delivery/deliveredTotals"
import { formatCurrencyCompact } from "@/lib/format/currency"
import { cn } from "@/lib/utils"

export interface HeroKPIBarProps {
  totalSpend: number
  totalBudget: number
  /** Label for the `totalSpend` tile. Defaults to "Total Spend"; callers pass "Planned to date"
   * when `totalSpend` is a planned (not delivered/actuals) figure — see
   * `lib/dashboard/plannedSpendConsistency.ts`. `totalBudget` and `budgetUtilized` must be
   * computed over the SAME campaign set as `totalSpend` or the tiles will contradict again. */
  spendLabel?: string
  liveCampaigns: number
  plannedCampaigns: number
  averageRoas?: number
  roasTrend?: number
  budgetUtilized: number
  /** When set, replaces the Avg. ROAS card (client hub). */
  campaignsYtd?: number
  /** Subtitle under the YTD campaigns count. */
  campaignsYtdCaption?: string
  /** True while `/api/dashboard/[slug]/delivered` is loading (Task 3). Shows a skeleton state. */
  deliveredLoading?: boolean
  /** Delivered spend to date (Snowflake, digital + fixed-cost combined) — see `getDeliveredTotalsForClient`. */
  deliveredToDate?: number
  /** False means "not yet reported" — render "No delivery reported yet", never a fabricated $0. */
  deliveredHasData?: boolean
  /** Melbourne "as of" date (YYYY-MM-DD) — Snowflake facts refresh ~06:30 Melbourne daily. */
  deliveredAsOf?: string
}

function formatDeliveredAsOfCaption(asOf: string | undefined): string | null {
  if (!asOf?.trim()) return null
  const d = new Date(`${asOf}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const label = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(d)
  return `As of ${label} · refreshes ~6:30am (Melbourne)`
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US")
}

function formatRoas(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}x`
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`
}

function useCountUp(target: number, durationMs = 1000): number {
  const shouldReduceMotion = useReducedMotion()
  const [value, setValue] = useState(shouldReduceMotion ? target : 0)

  useEffect(() => {
    if (shouldReduceMotion) {
      setValue(target)
      return
    }

    let frame = 0
    const start = performance.now()
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(target * eased)
      if (progress < 1) frame = requestAnimationFrame(animate)
    }

    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [durationMs, shouldReduceMotion, target])

  return value
}

export function HeroKPIBar({
  totalSpend,
  totalBudget,
  spendLabel = "Total Spend",
  liveCampaigns,
  plannedCampaigns,
  averageRoas,
  roasTrend,
  budgetUtilized,
  campaignsYtd,
  campaignsYtdCaption,
  deliveredLoading = false,
  deliveredToDate,
  deliveredHasData = false,
  deliveredAsOf,
}: HeroKPIBarProps) {
  const shouldReduceMotion = useReducedMotion()
  const normalizedBudgetUtilized = clampBudgetUtilizationPct(budgetUtilized, 0, 100)
  const budgetTone = getBudgetUtilizationKpiTone(normalizedBudgetUtilized)
  const animatedSpend = useCountUp(totalSpend, 1000)
  const animatedLive = useCountUp(liveCampaigns, 1000)
  const roasTarget = typeof averageRoas === "number" ? averageRoas : 0
  const animatedRoas = useCountUp(roasTarget, 1000)
  const ytdTarget = typeof campaignsYtd === "number" ? campaignsYtd : 0
  const animatedCampaignsYtd = useCountUp(ytdTarget, 1000)
  const animatedBudgetPct = useCountUp(normalizedBudgetUtilized, 1000)
  /**
   * Gated on the spend figure itself (not just `deliveredHasData`, which is also true for
   * impressions-only delivery) so an impressions-only campaign never renders a fabricated "$0
   * delivered" — see `hasReportedDeliveredSpend`.
   */
  const hasDeliveredSpend = deliveredHasData && hasReportedDeliveredSpend(deliveredToDate)
  const deliveredTarget = hasDeliveredSpend && typeof deliveredToDate === "number" ? deliveredToDate : 0
  const animatedDelivered = useCountUp(deliveredTarget, 1000)
  const deliveredAsOfCaption = formatDeliveredAsOfCaption(deliveredAsOf)

  const ringRadius = 7
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference * (1 - animatedBudgetPct / 100)

  const isRoasPositive = typeof roasTrend === "number" ? roasTrend >= 0 : null

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <article className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{spendLabel}</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrencyCompact(animatedSpend)}</p>
        <p className="mt-1 text-xs text-muted-foreground">of {formatCurrencyCompact(totalBudget)} budget</p>
      </article>

      <article className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Delivered</p>
        {deliveredLoading ? (
          <>
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-muted/60" aria-hidden />
            <p className="mt-1 text-xs text-muted-foreground">Loading delivery data…</p>
          </>
        ) : hasDeliveredSpend ? (
          <>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrencyCompact(animatedDelivered)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{deliveredAsOfCaption ?? "Delivered to date"}</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-2xl font-semibold text-muted-foreground">—</p>
            <p className="mt-1 text-xs text-muted-foreground">No delivery reported yet</p>
          </>
        )}
      </article>

      <article className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Live Campaigns</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(Math.round(animatedLive))}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatNumber(plannedCampaigns)} planned</p>
      </article>

      <article className="rounded-xl border border-border/60 bg-card p-4">
        {typeof campaignsYtd === "number" ? (
          <>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total campaigns YTD</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatNumber(Math.round(animatedCampaignsYtd))}
            </p>
            {campaignsYtdCaption ? (
              <p className="mt-1 text-xs text-muted-foreground">{campaignsYtdCaption}</p>
            ) : null}
          </>
        ) : typeof averageRoas === "number" ? (
          <>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg. ROAS</p>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-2xl font-semibold text-foreground">{formatRoas(animatedRoas)}</p>
              {typeof roasTrend === "number" ? (
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    isRoasPositive ? "bg-pacing-ahead-bg text-status-ahead-fg" : "bg-pacing-critical-bg text-status-critical-fg"
                  )}
                >
                  {isRoasPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {formatPercent(Math.abs(roasTrend))}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg. ROAS</p>
            <p className="mt-2 text-2xl font-semibold text-muted-foreground">—</p>
            <p className="mt-1 text-xs text-muted-foreground">Pending KPI data</p>
          </>
        )}
      </article>

      <article className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Budget Utilized</p>
        <div className="mt-2 flex items-center gap-2">
          <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r={ringRadius} className="fill-none stroke-border/40" strokeWidth="2" />
            <circle
              cx="8"
              cy="8"
              r={ringRadius}
              className={cn("fill-none transition-all", budgetTone.ring)}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
            />
          </svg>
          <p className={cn("text-2xl font-semibold", budgetTone.text)}>{formatPercent(animatedBudgetPct)}</p>
        </div>
        <div className={cn("mt-3 h-1.5 w-full overflow-hidden rounded-full", budgetTone.track)}>
          <div
            className={cn("h-full rounded-full", budgetTone.fill)}
            style={{
              width: `${animatedBudgetPct}%`,
              transition: shouldReduceMotion ? undefined : "width 750ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            aria-hidden
          />
        </div>
      </article>
    </section>
  )
}
