"use client"

import { CircleDollarSign } from "lucide-react"

import { getMediaColor } from "@/lib/charts/registry"
import { computeBudgetSpendTileValues } from "@/lib/dashboard/budgetSpendTiles"
import {
  campaignPacingVerdict,
  campaignPacingVerdictSentence,
} from "@/lib/dashboard/campaignPacingVerdict"
import { formatDateShort } from "@/lib/format/date"
import { formatMoneyCompact } from "@/lib/format/money"
import { cn } from "@/lib/utils"

export interface CampaignSummarySectionProps {
  time: {
    timeElapsedPct: number
    daysInCampaign: number
    daysElapsed: number
    daysRemaining: number
    startDate: string
    endDate: string
  }
  spend: {
    budget: number
    /** Delivered spend to date (Snowflake) — digital + fixed-cost combined. See `delivered` below for the full breakdown. */
    actualSpend?: number
    /** Prorated expectation from monthly plan (full prior months + current month linear) */
    expectedSpend?: number
    /** Sum of all monthly plan rows — full planned media from the plan */
    totalPlannedSpend?: number
  }
  /** Delivered-to-date detail (Task 3) — spend lives on `spend.actualSpend`; this covers the rest. */
  delivered?: {
    /** Digital impressions only (fixed-cost media has no impression metric). */
    impressions?: number
    /** True when there is a real positive delivered figure — false means "not yet reported", never a fabricated $0. */
    hasDelivery: boolean
    /** Melbourne "as of" date (YYYY-MM-DD) — Snowflake facts refresh ~06:30 Melbourne daily. */
    asOf?: string
  }
  brandColour?: string
  layout?: "side-by-side" | "stacked"
  hideStatus?: boolean
  embedded?: boolean
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

/** Elapsed % fallback when `brandColour` is not set: blue &lt;50%, green 50–90%, amber 90–100%. */
function timelineElapsedFallbackColor(elapsedPct: number): string {
  if (elapsedPct < 50) return getMediaColor("search")
  if (elapsedPct < 90) return getMediaColor("ooh")
  return getMediaColor("radio")
}

function formatAxisDate(iso: string): string {
  return formatDateShort(iso)
}

export default function CampaignSummaryRow({
  time,
  spend,
  delivered,
  brandColour,
  layout = "side-by-side",
  embedded = false,
}: CampaignSummarySectionProps) {
  const timePct = clampPct(time.timeElapsedPct)
  const timeColor = brandColour?.trim() ? brandColour : timelineElapsedFallbackColor(timePct)

  // Campaign has started once any day has elapsed — before that, "no delivery yet" is expected
  // and unremarkable, so we show the neutral "—" rather than the "No delivery reported yet" nudge.
  const hasStarted = time.daysElapsed > 0 || timePct > 0
  const hasDelivery = Boolean(delivered?.hasDelivery)
  const deliveredInput =
    hasDelivery && typeof spend.actualSpend === "number" ? spend.actualSpend : undefined

  const { budget, expectedSpend, deliveredSpend, remaining } = computeBudgetSpendTileValues({
    budget: typeof spend.budget === "number" && Number.isFinite(spend.budget) ? spend.budget : 0,
    expectedSpend:
      typeof spend.expectedSpend === "number" && Number.isFinite(spend.expectedSpend)
        ? spend.expectedSpend
        : undefined,
    deliveredSpend: deliveredInput,
  })

  const pacingResolved = campaignPacingVerdict({
    budget,
    startDate: time.startDate,
    endDate: time.endDate,
    spendToDate: hasDelivery && deliveredSpend !== undefined ? deliveredSpend : 0,
    asOfDate: delivered?.asOf,
  })
  const pacingSentence = pacingResolved ? campaignPacingVerdictSentence(pacingResolved) : null

  const startLabel = formatAxisDate(time.startDate)
  const endLabel = formatAxisDate(time.endDate)
  const pctLabelLeft = timePct <= 0 ? 0 : Math.min(100, Math.max(timePct / 2, timePct < 14 ? 7 : timePct / 2))

  const dayCurrent = Math.max(0, Math.round(time.daysElapsed))
  const dayTotal = Math.max(0, Math.round(time.daysInCampaign))
  const daysRem = Math.max(0, Math.round(time.daysRemaining))

  const deliveryEmptyCaption = hasStarted ? "No delivery reported yet" : "Campaign not started"

  const sharedCard = cn("rounded-2xl border border-border/60 bg-card", embedded && "border-0 bg-transparent")

  const spendCardClass = cn(sharedCard, "space-y-3 p-3 md:p-4", embedded && "p-0")
  const timelineCardClass = cn(sharedCard, "space-y-3 p-3 md:p-4", embedded && "p-0")

  return (
    <div className="space-y-3">
      {pacingSentence && pacingResolved ? (
        <p
          className={cn("text-sm font-medium", pacingResolved.textClass)}
          data-pacing-status={pacingResolved.status}
        >
          {pacingSentence}
        </p>
      ) : null}
      <div className={cn("grid grid-cols-1 gap-4", layout === "side-by-side" ? "md:grid-cols-2" : "md:grid-cols-1")}>
        {/* Spend card — left column on md+ */}
        <article className={spendCardClass}>
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
              <CircleDollarSign className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold text-foreground">Budget &amp; Spend</h3>
          </div>

          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Budget</div>
              <div className="text-xl font-bold tabular-nums text-foreground md:text-2xl">
                {formatMoneyCompact(budget)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Expected Spend</div>
              <div className="text-xl font-bold tabular-nums text-foreground md:text-2xl">
                {expectedSpend !== undefined ? formatMoneyCompact(expectedSpend) : "—"}
              </div>
              {expectedSpend === undefined ? (
                <div className="text-[11px] text-muted-foreground">Monthly plan data unavailable</div>
              ) : null}
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Delivered to date</div>
              {hasDelivery && deliveredSpend !== undefined ? (
                <div className="text-xl font-bold tabular-nums text-foreground md:text-2xl">
                  {formatMoneyCompact(deliveredSpend)}
                </div>
              ) : (
                <>
                  <div className="text-xl font-bold tabular-nums text-muted-foreground md:text-2xl">—</div>
                  <div className="text-[11px] text-muted-foreground">{deliveryEmptyCaption}</div>
                </>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Remaining</div>
              {remaining !== undefined ? (
                <div className="text-xl font-bold tabular-nums text-foreground md:text-2xl">
                  {formatMoneyCompact(remaining)}
                </div>
              ) : (
                <>
                  <div className="text-xl font-bold tabular-nums text-muted-foreground md:text-2xl">—</div>
                  <div className="text-[11px] text-muted-foreground">{deliveryEmptyCaption}</div>
                </>
              )}
            </div>
          </div>
        </article>

        {/* Timeline card — right column on md+ */}
        <article className={timelineCardClass}>
          <h3 className="text-sm font-semibold text-foreground">Campaign Timeline</h3>

          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 text-left leading-tight">{startLabel}</span>
            <span className="min-w-0 text-right leading-tight">{endLabel}</span>
          </div>

          <div
            className="relative pt-0.5"
            role="group"
            aria-label={`Campaign timeline, ${timePct.toFixed(1)} percent elapsed`}
          >
            {timePct > 0 ? (
              <span
                className="absolute -top-0.5 z-[1] text-xs font-bold tabular-nums text-foreground"
                style={{ left: `${pctLabelLeft}%`, transform: "translateX(-50%)" }}
              >
                {timePct.toFixed(1)}%
              </span>
            ) : (
              <span className="absolute -top-0.5 left-0 z-[1] text-xs font-bold tabular-nums text-muted-foreground">
                0%
              </span>
            )}

            <div className="relative mt-3 h-6 w-full overflow-visible">
              <div className="absolute inset-0 rounded-full bg-muted/80" aria-hidden />
              <div
                className={cn(
                  "absolute left-0 top-0 h-full transition-[width] duration-500 ease-out",
                  timePct >= 99.5 ? "rounded-full" : "rounded-l-full",
                )}
                style={{
                  width: `${timePct}%`,
                  backgroundColor: timeColor,
                }}
              />
              <div
                className="pointer-events-none absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${timePct}%` }}
                aria-label="Today"
                role="img"
              >
                <span className="h-1.5 w-1.5 rounded-full border-2 border-background bg-foreground shadow-md ring-1 ring-border/50" />
                <span className="-mt-px h-4 w-0.5 rounded-full bg-foreground/90" />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {dayTotal > 0 ? (
              <>
                Day {dayCurrent} of {dayTotal} • {daysRem} {daysRem === 1 ? "day" : "days"} remaining
              </>
            ) : (
              <>Timeline unavailable</>
            )}
          </p>
        </article>
      </div>
    </div>
  )
}
