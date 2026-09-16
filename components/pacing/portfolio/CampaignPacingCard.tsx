import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/format/money"
import type { CampaignPacingRow, ChannelPacingRow } from "@/lib/pacing/portfolio/types"
import {
  CHANNEL_SOURCE_STATE_LABEL,
  campaignDisplayBand,
  campaignPaceLabel,
  displayBandBadgeVariant,
  displayBandBorderClass,
  displayBandFillClass,
  displayBandTextClass,
  paceToDisplayBand,
} from "@/lib/pacing/portfolio/portfolioPresentation"
import { cn } from "@/lib/utils"

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function formatWhole(value: number): string {
  return formatMoney(value, { decimals: 0 })
}

function formatDeliverableCount(value: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value)
}

function channelAmount(channel: ChannelPacingRow): string {
  if (channel.spendMode === "reported" && channel.spendToDate > 0) {
    return `${formatWhole(channel.spendToDate)} / ${formatWhole(channel.budget)}`
  }
  if (channel.spendMode !== "actual" && channel.deliverable) {
    return `${formatDeliverableCount(channel.deliverable.delivered)} / ${formatDeliverableCount(channel.deliverable.planned)} ${channel.deliverable.unit}`
  }
  return `${formatWhole(channel.spendToDate)} / ${formatWhole(channel.budget)}`
}

function channelPctOrState(channel: ChannelPacingRow): { text: string; className: string } {
  if (channel.sourceState !== "reporting") {
    return {
      text: CHANNEL_SOURCE_STATE_LABEL[channel.sourceState],
      className: "text-muted-foreground",
    }
  }
  const band = paceToDisplayBand(channel.pace)
  return {
    text: formatPercent(channel.spendPct, { decimals: 0 }),
    className: displayBandTextClass(band),
  }
}

export function CampaignPacingCard({
  row,
  asOf,
  showWhy = true,
  muted = false,
}: {
  row: CampaignPacingRow
  asOf: string
  showWhy?: boolean
  muted?: boolean
}) {
  const band = campaignDisplayBand(row)
  const spendFill = clampPct(row.spendPct)
  const timeFill = clampPct(row.timePct)
  const tick = clampPct(row.timePct)
  const href = `/dashboard/${row.clientSlug}/${row.mbaNumber}`
  const finishLabel = band === "on-track" ? "Expected by now" : "Projected finish"
  const finishValue =
    band === "on-track"
      ? formatMoneyCompact(row.expectedToDate)
      : row.projectedFinish != null
        ? formatMoneyCompact(row.projectedFinish)
        : "—"
  const kpiValue = row.kpi
    ? `${row.kpi.tracked} of ${row.kpi.total}`
    : "—"

  return (
    <Card
      className={cn(
        "flex min-w-0 min-[640px]:min-w-[360px] flex-col gap-3 p-4",
        muted && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {row.clientName}
          </p>
          <p className="text-[15px] font-semibold leading-snug text-foreground">
            {row.campaignName}{" "}
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              {row.mbaNumber}
            </span>
          </p>
        </div>
        <Badge variant={displayBandBadgeVariant(band)} size="sm" dot>
          {campaignPaceLabel(row)}
        </Badge>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Time elapsed
          </p>
          <div className="relative mt-1 h-2 overflow-hidden rounded-pill bg-fill-track">
            <span
              className="absolute inset-y-0 left-0 rounded-pill bg-muted-foreground/40"
              style={{ width: `${timeFill}%` }}
            />
          </div>
        </div>
        <span className="num text-xs font-semibold text-foreground">
          {formatPercent(row.timePct, { decimals: 0 })}
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Spend delivered
          </p>
          <div className="relative mt-1 h-2 overflow-hidden rounded-pill bg-fill-track">
            <span
              className={cn("absolute inset-y-0 left-0 rounded-pill", displayBandFillClass(band))}
              style={{ width: `${spendFill}%` }}
            />
            <span
              className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-foreground/70"
              style={{ left: `${tick}%` }}
              aria-hidden
            />
          </div>
        </div>
        <span className={cn("num text-xs font-semibold", displayBandTextClass(band))}>
          {formatPercent(row.spendPct, { decimals: 0 })}
        </span>
      </div>

      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <b className="num font-semibold text-foreground">{formatWhole(row.spendToDate)}</b>
          {" of "}
          {formatWhole(row.budget)}
        </span>
        <span>
          {finishLabel}{" "}
          <b className="num font-semibold text-foreground">{finishValue}</b>
        </span>
        <span>
          Yesterday{" "}
          <b className="num font-semibold text-foreground">{formatWhole(row.spendYesterday)}</b>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-input bg-surface-panel px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Days left</p>
          <p className="num text-sm font-semibold text-foreground">{row.daysLeft}</p>
        </div>
        <div className="rounded-input bg-surface-panel px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Daily rate</p>
          <p className="num text-sm font-semibold text-foreground">
            {formatWhole(row.dailyRateActual)}{" "}
            <span className="text-[11px] font-normal text-muted-foreground">
              vs {formatWhole(row.dailyRatePlan)} plan
            </span>
          </p>
        </div>
        <div className="rounded-input bg-surface-panel px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">KPIs</p>
          <p className="num text-sm font-semibold text-foreground">
            {kpiValue}
            {row.kpi ? (
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">tracked</span>
            ) : null}
          </p>
        </div>
      </div>

      {row.channels.length > 0 ? (
        <ul className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          {row.channels.map((channel) => {
            const chBand = paceToDisplayBand(channel.pace)
            const pct = channelPctOrState(channel)
            return (
              <li
                key={channel.channelKey}
                className="grid grid-cols-[8px_1fr_auto_auto] items-center gap-2.5 text-xs"
              >
                <span
                  className={cn("h-2 w-2 rounded-full", displayBandFillClass(chBand))}
                  aria-hidden
                />
                <span className="truncate text-foreground">{channel.label}</span>
                <span className="num text-muted-foreground">{channelAmount(channel)}</span>
                <span className={cn("num font-semibold", pct.className)}>{pct.text}</span>
              </li>
            )
          })}
        </ul>
      ) : null}

      {showWhy && row.why ? (
        <p
          className={cn(
            "rounded-r-input border-l-[3px] bg-surface-panel px-2.5 py-2 text-xs text-foreground",
            displayBandBorderClass(band),
          )}
        >
          {row.why}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <time dateTime={asOf}>Updated {asOf}</time>
        <Link
          href={href}
          className="font-semibold text-primary hover:underline"
        >
          Open campaign →
        </Link>
      </div>
    </Card>
  )
}
