"use client"

import { AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, Check, CircleDollarSign } from "lucide-react"

import { getMediaColor } from "@/lib/charts/registry"
import { formatCurrencyCompact } from "@/lib/format/currency"
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
    actualSpend?: number
    expectedSpend?: number
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

/** Utilisation bar tiers — colours from entity registry (`search`, `ooh`, `radio`, `cinema`). */
function spendUtilBarColor(utilisationPct: number): string {
  if (utilisationPct < 50) return getMediaColor("search")
  if (utilisationPct < 90) return getMediaColor("ooh")
  if (utilisationPct <= 100) return getMediaColor("radio")
  return getMediaColor("cinema")
}

/** Elapsed % fallback when `brandColour` is not set: blue &lt;50%, green 50–90%, amber 90–100%. */
function timelineElapsedFallbackColor(elapsedPct: number): string {
  if (elapsedPct < 50) return getMediaColor("search")
  if (elapsedPct < 90) return getMediaColor("ooh")
  return getMediaColor("radio")
}

function formatAxisDate(iso: string): string {
  if (!iso?.trim()) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(d)
}

function PacingVsExpectedIndicator({ actual, expected }: { actual: number; expected: number }) {
  if (expected <= 0 || !Number.isFinite(expected)) {
    return <span className="text-muted-foreground">—</span>
  }
  const relDiff = Math.abs(actual - expected) / expected
  if (relDiff <= 0.1) {
    return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Within 10% of expected" />
  }
  if (relDiff <= 0.2) {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="10–20% from expected" />
  }
  return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" aria-label="More than 20% from expected" />
}

export default function CampaignSummaryRow({
  time,
  spend,
  brandColour,
  layout = "side-by-side",
  hideStatus = false,
  embedded = false,
}: CampaignSummarySectionProps) {
  const timePct = clampPct(time.timeElapsedPct)
  const timeColor = brandColour?.trim() ? brandColour : timelineElapsedFallbackColor(timePct)

  const budget = typeof spend.budget === "number" && Number.isFinite(spend.budget) ? spend.budget : 0
  const actualSpend =
    typeof spend.actualSpend === "number" && Number.isFinite(spend.actualSpend) ? spend.actualSpend : 0
  const expectedSpend =
    typeof spend.expectedSpend === "number" && Number.isFinite(spend.expectedSpend) ? spend.expectedSpend : undefined

  const utilisationPctRaw = budget > 0 ? (actualSpend / budget) * 100 : 0
  const utilisationPctDisplay = utilisationPctRaw
  const utilBarWidthPct = budget > 0 ? clampPct(utilisationPctRaw) : 0
  const barColor = spendUtilBarColor(utilisationPctRaw)

  const remaining = budget - actualSpend
  const pctUtilisedLabel = budget > 0 ? utilisationPctRaw.toFixed(1) : "0.0"

  const expectedMarkerPct =
    budget > 0 && expectedSpend !== undefined && expectedSpend >= 0
      ? clampPct((expectedSpend / budget) * 100)
      : null

  const spendDeltaPct =
    expectedSpend !== undefined && expectedSpend > 0
      ? ((actualSpend - expectedSpend) / expectedSpend) * 100
      : undefined

  const startLabel = formatAxisDate(time.startDate)
  const endLabel = formatAxisDate(time.endDate)
  const pctLabelLeft = timePct <= 0 ? 0 : Math.min(100, Math.max(timePct / 2, timePct < 14 ? 7 : timePct / 2))

  const dayCurrent = Math.max(0, Math.round(time.daysElapsed))
  const dayTotal = Math.max(0, Math.round(time.daysInCampaign))
  const daysRem = Math.max(0, Math.round(time.daysRemaining))

  const sharedCard = cn("rounded-2xl border border-border/60 bg-card", embedded && "border-0 bg-transparent")

  const spendCardClass = cn(sharedCard, "space-y-4 p-4 md:p-5", embedded && "p-0")
  const timelineCardClass = cn(sharedCard, "space-y-4 p-4 md:p-5", embedded && "p-0")

  return (
    <div className="space-y-3">
      <div className={cn("grid grid-cols-1 gap-4", layout === "side-by-side" ? "md:grid-cols-2" : "md:grid-cols-1")}>
        {/* Spend card — left column on md+ */}
        <article className={spendCardClass}>
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
              <CircleDollarSign className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold text-foreground">Budget &amp; Spend</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Budget</div>
              <div className="text-xl font-bold tabular-nums text-foreground md:text-2xl">
                {formatCurrencyCompact(budget)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Actual Spend</div>
              <div className="text-xl font-bold tabular-nums text-foreground md:text-2xl">
                {formatCurrencyCompact(actualSpend)}
              </div>
              {expectedSpend !== undefined ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>of expected {formatCurrencyCompact(expectedSpend)}</span>
                  <PacingVsExpectedIndicator actual={actualSpend} expected={expectedSpend} />
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">Expected spend unavailable</div>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Remaining</div>
              <div className="text-xl font-bold tabular-nums text-foreground md:text-2xl">
                {formatCurrencyCompact(remaining)}
              </div>
              <div className="text-[11px] text-muted-foreground">{pctUtilisedLabel}% utilised</div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="relative">
              {expectedMarkerPct !== null ? (
                <div
                  className="pointer-events-none absolute bottom-full left-0 z-10 mb-px -translate-x-1/2"
                  style={{ left: `${expectedMarkerPct}%` }}
                  role="img"
                  aria-label={`Expected spend at ${expectedMarkerPct.toFixed(1)}% of budget`}
                >
                  <svg width="10" height="7" viewBox="0 0 10 7" className="text-foreground/80 drop-shadow-sm">
                    <polygon points="5,7 10,0 0,0" fill="currentColor" />
                  </svg>
                </div>
              ) : null}
              <div
                className="relative h-3 w-full overflow-hidden rounded-full bg-muted/80"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(utilBarWidthPct)}
                aria-label={`Budget utilisation ${utilisationPctDisplay.toFixed(1)} percent`}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${utilBarWidthPct}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>Spent</span>
              <span>Budget</span>
            </div>
          </div>

          {!hideStatus && typeof spendDeltaPct === "number" ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                spendDeltaPct <= 0 ? "text-emerald-600" : "text-amber-600",
              )}
            >
              {spendDeltaPct <= 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
              <span>
                {Math.abs(spendDeltaPct).toFixed(1)}% {spendDeltaPct <= 0 ? "under" : "over"} expected
              </span>
            </div>
          ) : null}
        </article>

        {/* Timeline card — right column on md+ */}
        <article className={timelineCardClass}>
          <h3 className="text-sm font-semibold text-foreground">Campaign Timeline</h3>

          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 text-left leading-tight">{startLabel}</span>
            <span className="min-w-0 text-right leading-tight">{endLabel}</span>
          </div>

          <div
            className="relative pt-1"
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

            <div className="relative mt-5 h-8 w-full overflow-visible">
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
                <span className="h-2 w-2 rounded-full border-2 border-background bg-foreground shadow-md ring-1 ring-border/50" />
                <span className="-mt-px h-6 w-0.5 rounded-full bg-foreground/90" />
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
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

      {!hideStatus ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {expectedSpend !== undefined ? (
            <span>Vs expected: {formatCurrencyCompact(actualSpend - expectedSpend)}</span>
          ) : (
            <span className="text-muted-foreground/80">Expected spend not available for comparison</span>
          )}
        </div>
      ) : null}
    </div>
  )
}
