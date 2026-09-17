import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/format/money"
import type { LineCardModel, LineCardPace } from "@/lib/pacing/channel/lineCardTypes"
import { formatCount, formatKpiCaption } from "@/lib/pacing/channel/lineCardFormat"
import { clampPct } from "@/lib/pacing/channel/lineCardPace"
import type { PortfolioDisplayBand } from "@/lib/pacing/portfolio/portfolioPresentation"
import {
  displayBandBadgeVariant,
  displayBandBorderClass,
  displayBandFillClass,
  displayBandTextClass,
} from "@/lib/pacing/portfolio/portfolioPresentation"
import { cn } from "@/lib/utils"

function paceBand(pace: LineCardPace): PortfolioDisplayBand {
  switch (pace) {
    case "behind":
      return "behind"
    case "on_track":
      return "on-track"
    case "ahead":
      return "ahead"
    case "over_pacing":
      return "over-pacing"
    case "no_data":
      return "no-data"
    default: {
      const _exhaustive: never = pace
      return _exhaustive
    }
  }
}

function paceLabel(pace: LineCardPace): string {
  switch (pace) {
    case "behind":
      return "Behind"
    case "on_track":
      return "On track"
    case "ahead":
      return "Ahead"
    case "over_pacing":
      return "Over-pacing"
    case "no_data":
      return "No delivery"
    default: {
      const _exhaustive: never = pace
      return _exhaustive
    }
  }
}

function formatWhole(value: number): string {
  return formatMoney(value, { decimals: 0 })
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return ""
  return `${start ?? "—"} – ${end ?? "—"}`
}

function kpiTone(status: LineCardModel["kpis"][number]["status"]): string {
  if (status === "on-track") return "border-pacing-on-track text-status-on-track-fg"
  if (status === "off-target") return "border-pacing-behind text-status-behind-fg"
  return "border-border text-muted-foreground"
}

export function LinePacingCard({
  model,
  asOf,
}: {
  model: LineCardModel
  asOf: string
}) {
  const band = paceBand(model.pace)
  const timeFill = clampPct(model.timePct)
  const lineFill = model.budget > 0 ? clampPct((model.spend / model.budget) * 100) : clampPct(model.linePct)
  const burstFill =
    model.burstBudget != null && model.burstBudget > 0 && model.burstSpend != null
      ? clampPct((model.burstSpend / model.burstBudget) * 100)
      : model.burstPct != null
        ? clampPct(model.burstPct)
        : 0
  const href = `/dashboard/${model.clientSlug}/${model.mba}`
  const statMetrics = model.metrics.slice(0, 2)

  return (
    <Card className="flex min-w-0 min-[640px]:min-w-[360px] flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {model.client}
            {model.platform ? ` · ${model.platform}` : ""}
          </p>
          <p className="text-[15px] font-semibold leading-snug text-foreground">
            {model.campaignName}{" "}
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              {model.lineItemId}
            </span>
          </p>
        </div>
        <Badge variant={displayBandBadgeVariant(band)} size="sm" dot>
          {paceLabel(model.pace)}
        </Badge>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Time elapsed · line
          </p>
          <div className="relative mt-1 h-2 overflow-hidden rounded-pill bg-fill-track">
            <span
              className="absolute inset-y-0 left-0 rounded-pill bg-muted-foreground/40"
              style={{ width: `${timeFill}%` }}
            />
          </div>
        </div>
        <span className="num text-xs font-semibold text-foreground">
          {formatPercent(model.timePct, { decimals: 0 })}
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {model.verificationOnly ? "Delivered · line" : "Spend delivered · line"}
          </p>
          <div className="relative mt-1 h-2 overflow-hidden rounded-pill bg-fill-track">
            <span
              className={cn("absolute inset-y-0 left-0 rounded-pill", displayBandFillClass(band))}
              style={{ width: `${lineFill}%` }}
            />
            <span
              className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-foreground/70"
              style={{ left: `${timeFill}%` }}
              aria-hidden
            />
          </div>
        </div>
        <span className={cn("num text-xs font-semibold", displayBandTextClass(band))}>
          {formatPercent(model.linePct, { decimals: 0 })}
        </span>
        {model.burstPct != null ? (
          <>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Current burst{model.burstMonth ? ` · ${model.burstMonth.slice(0, 3)}` : ""}
              </p>
              <div className="relative mt-1 h-2 overflow-hidden rounded-pill bg-fill-track">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-pill", displayBandFillClass(band))}
                  style={{ width: `${burstFill}%` }}
                />
                <span
                  className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-foreground/70"
                  style={{ left: `${timeFill}%` }}
                  aria-hidden
                />
              </div>
            </div>
            <span className={cn("num text-xs font-semibold", displayBandTextClass(band))}>
              {formatPercent(model.burstPct, { decimals: 0 })}
            </span>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <b className="num font-semibold text-foreground">{formatWhole(model.spend)}</b>
          {" of "}
          {formatWhole(model.budget)}
        </span>
        {model.burstSpend != null && model.burstBudget != null ? (
          <span>
            Burst{" "}
            <b className="num font-semibold text-foreground">{formatWhole(model.burstSpend)}</b>
            {" / "}
            {formatWhole(model.burstBudget)}
          </span>
        ) : null}
        <span>
          Yesterday{" "}
          <b className="num font-semibold text-foreground">{formatWhole(model.yesterday)}</b>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-input bg-surface-panel px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Remaining · line</p>
          <p className="num text-sm font-semibold text-foreground">
            {model.verificationOnly
              ? formatCount(model.remainingLine)
              : formatMoneyCompact(model.remainingLine)}
          </p>
        </div>
        <div className="rounded-input bg-surface-panel px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Per-day left</p>
          <p className="num text-sm font-semibold text-foreground">
            {formatMoneyCompact(model.perDayLeft)}{" "}
            {model.perDayPlan != null ? (
              <span className="text-[11px] font-normal text-muted-foreground">
                vs {formatMoneyCompact(model.perDayPlan)} plan
              </span>
            ) : null}
          </p>
        </div>
        {statMetrics.map((metric) => (
          <div key={metric.label} className="rounded-input bg-surface-panel px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{metric.label}</p>
            <p className="num text-sm font-semibold text-foreground">{metric.value}</p>
          </div>
        ))}
      </div>

      {model.kpis.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {model.kpis.map((kpi) => (
            <span
              key={`${kpi.label}-${kpi.delivered}`}
              className={cn(
                "rounded-pill border bg-surface-panel px-2 py-0.5 text-[11px]",
                kpiTone(kpi.status),
              )}
            >
              {formatKpiCaption(kpi)}
            </span>
          ))}
        </div>
      ) : null}

      {model.bursts.total > 0 ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Bursts</span>
          <span className="flex items-center gap-1">
            {model.bursts.states.map((state, index) => (
              <span
                key={`${state}-${index}`}
                className={cn(
                  "h-1.5 w-4 rounded-pill",
                  state === "done" && "bg-muted-foreground/50",
                  state === "now" && "bg-foreground",
                  state === "future" && "bg-fill-track",
                )}
                aria-label={state}
              />
            ))}
          </span>
          <span>
            {model.bursts.index != null
              ? `${model.bursts.index} of ${model.bursts.total}`
              : `${model.bursts.total}`}
          </span>
        </div>
      ) : null}

      {model.why ? (
        <p
          className={cn(
            "rounded-r-input border-l-[3px] bg-surface-panel px-2.5 py-2 text-xs text-foreground",
            displayBandBorderClass(band),
          )}
        >
          {model.why}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Line {formatDateRange(model.lineStart, model.lineEnd)}
          {model.targeting ? ` · Targeting: ${model.targeting}` : ""}
        </span>
        <Link href={href} className="shrink-0 font-semibold text-primary hover:underline">
          Details →
        </Link>
      </div>
      <time className="sr-only" dateTime={asOf}>
        As of {asOf}
      </time>
    </Card>
  )
}
