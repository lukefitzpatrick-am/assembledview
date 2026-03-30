"use client"

import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { useEffect, useState } from "react"
import { useReducedMotion } from "framer-motion"

import {
  clampBudgetUtilizationPct,
  getBudgetUtilizationKpiTone,
} from "@/lib/dashboard/budgetUtilKpi"
import { cn } from "@/lib/utils"

export interface HeroKPIBarProps {
  totalSpend: number
  totalBudget: number
  liveCampaigns: number
  plannedCampaigns: number
  averageRoas: number
  roasTrend?: number
  budgetUtilized: number
  /** When set, replaces the Avg. ROAS card (client hub). */
  campaignsYtd?: number
  /** Subtitle under the YTD campaigns count. */
  campaignsYtdCaption?: string
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
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
  liveCampaigns,
  plannedCampaigns,
  averageRoas,
  roasTrend,
  budgetUtilized,
  campaignsYtd,
  campaignsYtdCaption,
}: HeroKPIBarProps) {
  const shouldReduceMotion = useReducedMotion()
  const normalizedBudgetUtilized = clampBudgetUtilizationPct(budgetUtilized, 0, 100)
  const budgetTone = getBudgetUtilizationKpiTone(normalizedBudgetUtilized)
  const animatedSpend = useCountUp(totalSpend, 1000)
  const animatedLive = useCountUp(liveCampaigns, 1000)
  const animatedRoas = useCountUp(averageRoas, 1000)
  const ytdTarget = typeof campaignsYtd === "number" ? campaignsYtd : 0
  const animatedCampaignsYtd = useCountUp(ytdTarget, 1000)
  const animatedBudgetPct = useCountUp(normalizedBudgetUtilized, 1000)

  const ringRadius = 7
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference * (1 - animatedBudgetPct / 100)

  const isRoasPositive = typeof roasTrend === "number" ? roasTrend >= 0 : null

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Spend</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">{formatCompactCurrency(animatedSpend)}</p>
        <p className="mt-1 text-xs text-muted-foreground">of {formatCompactCurrency(totalBudget)} budget</p>
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
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg. ROAS</p>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-2xl font-semibold text-foreground">{formatRoas(animatedRoas)}</p>
              {typeof roasTrend === "number" ? (
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    isRoasPositive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  )}
                >
                  {isRoasPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {formatPercent(Math.abs(roasTrend))}
                </div>
              ) : null}
            </div>
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
